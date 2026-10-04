import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { addDays, chunkRange, daysBetween, isValidDate, monthRange, mondayOf, today } from "./dates.js";
import { legacyItems, list, requiredList } from "./json.js";
import { mapAllDayEvents, mapDiary, mapFeed, mapMessages, mapPeriods, mapSemester, mapWeek, mapWork } from "./mappers.js";
import { TamoClient, TamoError } from "./tamo.js";

const instructions = `Read-only access to one student's TAMO dienynas (Lithuanian school e-diary).
Dates are YYYY-MM-DD in Europe/Vilnius time; when no dates are given, tools default to a sensible window around today.
School content is in Lithuanian and is returned as written. Grades are usually 1-10; formative assessments ("kaupiamieji") can be numbers, "+"/"-" or percentages and only count toward a grade when convertedToGrade is true.
Attendance values starting with "n" mean absent, "p" means late.`;

const date = z.string().refine(isValidDate, "Use a real date in YYYY-MM-DD format");
const readOnly = { readOnlyHint: true, openWorldHint: true } as const;

const json = (value: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(value) }] });

const failure = (error: unknown): CallToolResult => ({
  content: [{ type: "text", text: error instanceof Error ? error.message : "Unexpected error" }],
  isError: true,
});

const guard =
  <A>(handler: (args: A) => Promise<unknown>) =>
  async (args: A): Promise<CallToolResult> => {
    try {
      return json(await handler(args));
    } catch (error) {
      if (!(error instanceof TamoError) && !(error instanceof RangeError)) console.error(error);
      return failure(error);
    }
  };

const range = (from: string | undefined, to: string | undefined, defaultFrom: number, defaultTo: number, maxDays: number) => {
  const now = today();
  const start = from ?? (to ? addDays(to, defaultFrom - defaultTo) : addDays(now, defaultFrom));
  const end = to ?? (from ? addDays(from, defaultTo - defaultFrom) : addDays(now, defaultTo));
  if (end < start) throw new RangeError("'to' must not be before 'from'");
  if (daysBetween(start, end) > maxDays) throw new RangeError(`The range can be at most ${maxDays} days`);
  return { from: start, to: end };
};

export const createServer = (tamo: TamoClient): McpServer => {
  const server = new McpServer({ name: "tamo-dienynas", version: "0.1.0" }, { instructions });

  server.registerTool(
    "get_schedule",
    {
      title: "Weekly schedule",
      description:
        "Lessons for the Monday-Sunday week containing the given date (default: this week): times, subject, teacher, topic, grades and marks given in the lesson, formative assessments, homework and other lesson details, and labels such as tests.",
      inputSchema: { date: date.optional().describe("Any date in the wanted week. Defaults to today.") },
      annotations: readOnly,
    },
    guard(async ({ date: day }: { date?: string }) => {
      const monday = mondayOf(day ?? today());
      return { week: monday, days: mapWeek(await tamo.modern("v2/app/calendar/events", { date: monday })) };
    }),
  );

  server.registerTool(
    "get_grades",
    {
      title: "Grades and attendance",
      description:
        "Grades, formative assessments and attendance marks from the diary for a date range (default: the last 30 days, at most 400 days).",
      inputSchema: { from: date.optional(), to: date.optional() },
      annotations: readOnly,
    },
    guard(async ({ from, to }: { from?: string; to?: string }) => {
      const window = range(from, to, -30, 0, 400);
      const parts = [];
      for (const [start, end] of chunkRange(window.from, window.to)) {
        parts.push(mapDiary(await tamo.modern("core/app/dienynas", { dateFrom: start, dateTo: end })));
      }
      return {
        ...window,
        grades: parts.flatMap((part) => part.grades),
        formatives: parts.flatMap((part) => part.formatives),
        attendance: parts.flatMap((part) => part.attendance),
      };
    }),
  );

  server.registerTool(
    "get_homework",
    {
      title: "Homework",
      description:
        "Homework whose due date falls in a date range (default: due from 14 days ago to 21 days ahead, at most 62 days), with assignment dates, attachments and whether it is marked done.",
      inputSchema: {
        from: date.optional(),
        to: date.optional(),
        status: z.enum(["all", "done", "not_done"]).optional().describe("Filter by completion. Defaults to all."),
      },
      annotations: readOnly,
    },
    guard(async ({ from, to, status }: { from?: string; to?: string; status?: "all" | "done" | "not_done" }) => {
      const window = range(from, to, -14, 21, 62);
      const items = mapWork(await tamo.modern("core/app/darbai", { dateFrom: window.from, dateTo: window.to, workType: "home" }));
      const filtered = items.filter((item) => !status || status === "all" || (status === "done") === Boolean(item.done));
      return { ...window, homework: filtered.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? "")) };
    }),
  );

  server.registerTool(
    "get_classwork",
    {
      title: "Classwork",
      description: "What was done in lessons during a date range (default: the last 14 days, at most 62 days).",
      inputSchema: { from: date.optional(), to: date.optional() },
      annotations: readOnly,
    },
    guard(async ({ from, to }: { from?: string; to?: string }) => {
      const window = range(from, to, -14, 0, 62);
      const items = mapWork(await tamo.modern("core/app/darbai", { dateFrom: window.from, dateTo: window.to, workType: "class" }));
      return { ...window, classwork: items.map(({ done: _done, completedOn: _completedOn, ...item }) => item) };
    }),
  );

  server.registerTool(
    "get_notifications",
    {
      title: "Recent notifications",
      description:
        "The recent TAMO notification feed: new grades, formative assessments, homework, absences and lateness, praise, remarks and comments.",
      inputSchema: {},
      annotations: readOnly,
    },
    guard(async () => ({ notifications: mapFeed(requiredList(await tamo.modern("core/app/feeds"), "result")) })),
  );

  server.registerTool(
    "get_school_calendar",
    {
      title: "School calendar",
      description: "All-day school events for a month: holidays, breaks and school-wide events (default: the current month).",
      inputSchema: {
        month: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM")
          .optional()
          .describe("Month as YYYY-MM. Defaults to the current month."),
      },
      annotations: readOnly,
    },
    guard(async ({ month }: { month?: string }) => {
      const [from, to] = monthRange(month ?? today().slice(0, 7));
      return { from, to, events: mapAllDayEvents(await tamo.modern("core/app/calendar/events/allDay", { dateFrom: from, dateTo: to })) };
    }),
  );

  server.registerTool(
    "list_messages",
    {
      title: "Message list",
      description:
        "Lists TAMO messages (sender, subject, date, unread flag), newest first. Message bodies are not available: opening a message would mark it as read.",
      inputSchema: {
        folder: z.enum(["received", "sent", "starred"]).optional().describe("Defaults to received."),
        page: z.number().int().min(1).max(50).optional().describe("Page number, starting at 1."),
        search: z.string().max(100).optional().describe("Text to search for in messages."),
      },
      annotations: readOnly,
    },
    guard(async ({ folder = "received", page = 1, search }: { folder?: "received" | "sent" | "starred"; page?: number; search?: string }) => {
      const query: Record<string, string> = { orderDescending: "true", page: String(page) };
      if (folder === "starred") query.isStarred = "true";
      if (search?.trim()) query.searchTerm = search.trim();
      const path = folder === "sent" ? "messaging/messages/sent" : "messaging/messages/received";
      const items = list(await tamo.modern(path, query, false), "items");
      return { folder, page, messages: mapMessages(items, folder === "sent") };
    }),
  );

  server.registerTool(
    "get_semester_grades",
    {
      title: "Semester grades and averages",
      description:
        "Per-subject averages, final grades and all marks for a grading period such as a semester or the whole year. Lists the available periods; defaults to the period TAMO marks as current.",
      inputSchema: { period: z.string().max(100).optional().describe("Period title or part of it, e.g. '1 pusmetis' or 'Metinis'.") },
      annotations: readOnly,
    },
    guard(async ({ period }: { period?: string }) => {
      const session = await tamo.currentSession();
      if (session.legacyRole !== 2 || session.roleCount !== 1) throw new TamoError("Semester grades are only available for a student's own login");
      const periods = mapPeriods(await tamo.legacy("GetWindowFilters", { windowName: "periods", userType: String(session.legacyRole) }));
      const wanted = period?.trim().toLowerCase();
      const chosen = wanted ? periods.find((item) => item.title.toLowerCase().includes(wanted)) : (periods.find((item) => item.selected) ?? periods[0]);
      if (!chosen) throw new TamoError(wanted ? `No grading period matches "${period}"` : "TAMO returned no grading periods");
      const result = await tamo.legacy("GetPeriodAssessments", { personId: chosen.personId, periodId: chosen.periodId });
      return {
        period: chosen.title,
        availablePeriods: periods.map((item) => item.title),
        subjects: mapSemester(legacyItems(result)),
      };
    }),
  );

  return server;
};
