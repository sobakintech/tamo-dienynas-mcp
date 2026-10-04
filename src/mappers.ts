import { dateOnly, localTime } from "./dates.js";
import { compact, isObject, list, obj, requiredList, str, type JsonObject } from "./json.js";
import { isPlaceholder, plain } from "./text.js";

// Modern "Content" values are objects with a "content" field; some payloads alias "titleContent" to "title".
const content = (source: JsonObject, name: string): string => {
  const value = source[`${name}Content`] ?? source[name];
  if (isObject(value)) return plain(str(value, "content"));
  return typeof value === "string" ? plain(value) : "";
};

const contents = (source: JsonObject, key: string): JsonObject[] => {
  const value = source[key];
  if (Array.isArray(value)) return value.filter(isObject);
  return isObject(value) ? [value] : [];
};

const fileNames = (files: JsonObject[]): string[] =>
  files.map((file) => plain(str(file, "fileName") || str(file, "content"))).map((name) => name || "attachment");

const unique = <T>(items: T[], key: (item: T) => string): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = key(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const lessonNumber = (event: JsonObject): number | undefined => {
  const candidates = [content(event, "eventIcon"), ...list(event, "timeBadges").map((badge) => plain(str(badge, "content")))];
  return candidates.map((value) => Number.parseInt(value, 10)).find((value) => value >= 1 && value <= 30);
};

const iconNote = (icon: string): string | undefined => {
  if (icon.includes("negative")) return "negative";
  if (icon.includes("positive")) return "positive";
  if (icon.includes("note") || icon.includes("comment")) return "comment";
  return undefined;
};

export const mapWeek = (payload: JsonObject) => {
  const formativeGroups = list(payload, "formatives");
  return requiredList(payload, "days").map((day) => ({
    date: dateOnly(str(day, "date")),
    lessons: requiredList(day, "events").map((event) => {
      const details = list(event, "eventDetails")
        .map((detail) => {
          const title = content(detail, "title");
          return compact({
            kind: str(detail, "key"),
            title: title || content(detail, "label"),
            label: title ? content(detail, "label") : "",
            text: content(detail, "body"),
            files: fileNames(list(detail, "files")),
          });
        })
        .filter((detail) => detail.title || detail.text || detail.files)
        .filter((detail) => !(detail.kind?.startsWith("homework") && !detail.files && isPlaceholder(detail.text ?? "")));

      const formativeKey = str(obj(event, "references"), "formatives");
      const formatives = unique(
        [
          ...list(event, "formatives"),
          ...(formativeKey
            ? formativeGroups
                .filter((group) => str(group, "key") === formativeKey)
                .flatMap((group) => list(group, "items"))
                .filter((item) => str(item, "lessonId") === str(event, "id"))
            : []),
        ],
        (item) => `${str(item, "date")}|${str(item, "type")}|${str(item, "title")}`,
      ).map((item) => compact({ value: plain(str(item, "title")), type: plain(str(item, "type")) }));

      const right = ["rightIconsTop", "rightIconsMiddle", "rightIconsBottom"].flatMap((key) => contents(event, key));
      const marks = unique(
        right.filter((item) => str(item, "contentType") !== "icon").map((item) => plain(str(item, "content"))).filter(Boolean),
        (mark) => mark,
      );
      const note = right
        .filter((item) => str(item, "contentType") === "icon")
        .map((item) => iconNote(str(item, "content")))
        .find(Boolean);
      const bottomRight = contents(event, "bottomIconsRight");
      const average = plain(str(bottomRight.find((item) => str(item, "key") === "average") ?? {}, "content"));
      const label = obj(event, "eventLabel");
      const important =
        str(obj(event, "eventHighlight"), "styleRef").includes("important") || str(label, "styleRef").includes("important");

      return compact({
        number: lessonNumber(event),
        start: localTime(str(event, "timeFromUtc")),
        end: localTime(str(event, "timeToUtc")),
        subject: content(event, "eventTitle"),
        teacher: content(event, "eventSubtitle"),
        topic: content(event, "eventDescription"),
        label: plain(str(label, "content")),
        important: important || undefined,
        marks,
        note,
        subjectAverage: average,
        formatives,
        details,
      });
    }),
  }));
};

export const mapDiary = (payload: JsonObject) => {
  const items = requiredList(payload, "items");
  const grades = items
    .filter((item) => plain(str(item, "assessmentValue")))
    .map((item) =>
      compact({
        date: dateOnly(str(item, "subjectDate")),
        subject: plain(str(item, "subject")),
        value: plain(str(item, "assessmentValue")),
        type: plain(str(item, "assessmentType")),
      }),
    );
  const attendance = items
    .filter((item) => plain(str(item, "attendanceValue")))
    .map((item) =>
      compact({
        date: dateOnly(str(item, "subjectDate")),
        subject: plain(str(item, "subject")),
        value: plain(str(item, "attendanceValue")),
      }),
    );
  const formatives = list(payload, "formativeGrades")
    .filter((item) => plain(str(item, "title")))
    .map((item) => {
      const converted = str(item, "isConverted");
      const percents = Number.parseInt(str(item, "percents"), 10);
      return compact({
        date: dateOnly(str(item, "date")),
        subject: plain(str(item, "subject")),
        value: plain(str(item, "title")),
        type: plain(str(item, "type")),
        system: str(item, "system"),
        percents: Number.isFinite(percents) ? percents : undefined,
        convertedToGrade: converted === "true" ? true : converted === "false" ? false : undefined,
      });
    });
  return { grades, attendance, formatives };
};

export const mapWork = (payload: JsonObject) =>
  requiredList(payload, "items")
    .map((item) => {
      const text = plain(str(item, "homeWork"));
      const completed = dateOnly(str(item, "completionDate"));
      return compact({
        subject: plain(str(item, "thingName")),
        text: isPlaceholder(text) ? "" : text,
        assigned: dateOnly(str(item, "date")),
        due: dateOnly(str(item, "deadline")),
        done: Boolean(str(item, "completionDate")),
        completedOn: completed,
        files: fileNames(list(item, "files")),
      });
    })
    .filter((item) => item.text || item.files);

const remarkKind = (type: string) => {
  const lower = type.toLowerCase();
  if (lower.includes("pagyr")) return "praise";
  if (lower.includes("pastab")) return "remark";
  return "comment";
};

export const mapFeed = (items: JsonObject[]) =>
  items.flatMap((item) => {
    const detail = obj(item, "eventDetails");
    const field = (name: string) => {
      const key = Object.keys(detail).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
      return key ? plain(str(detail, key)) : "";
    };
    const base = {
      date: dateOnly(str(item, "date")),
      subject: field("ThingName"),
      lessonDate: dateOnly(field("Date")),
    };
    switch (str(item, "eventId")) {
      case "4": {
        const text = field("HomeWork") || field("Description");
        return isPlaceholder(text) ? [] : [compact({ kind: "homework", ...base, text, due: dateOnly(field("Deadline")) })];
      }
      case "1":
        return field("Value") ? [compact({ kind: "grade", ...base, value: field("Value") })] : [];
      case "2":
        return [compact({ kind: "attendance", ...base, value: field("Type") === "1" ? "absent" : "late" })];
      case "10":
        return field("Vertinimas") ? [compact({ kind: "formative", ...base, value: field("Vertinimas"), type: field("Tipas") })] : [];
      case "8":
        return [compact({ kind: remarkKind(field("Type")), ...base, type: field("Type"), text: field("Value") })];
      default: {
        const text = unique(
          [field("Description"), field("HomeWork"), field("Vertinimas"), field("Value")].filter(Boolean),
          (value) => value,
        ).join("\n");
        return text ? [compact({ kind: "other", ...base, text, due: dateOnly(field("Deadline")) })] : [];
      }
    }
  });

export const mapAllDayEvents = (payload: JsonObject) =>
  requiredList(payload, "allDayEvents").map((event) => {
    const from = dateOnly(str(event, "timeFromUtc"));
    const to = dateOnly(str(event, "timeToUtc"));
    return compact({
      title: content(event, "eventTitle"),
      label: content(event, "eventLabel"),
      when: content(event, "eventSubtitle"),
      from,
      to: to && to !== from ? to : "",
      description: content(event, "eventDescription"),
    });
  });

export const mapMessages = (items: JsonObject[], sent: boolean) =>
  items.map((item) =>
    compact({
      date: str(item, "date").slice(0, 16).replace("T", " "),
      subject: plain(str(item, "subject")),
      ...(sent
        ? {
            to: list(item, "recipientSets")
              .map((set) => plain(str(set, "title")).split(" > ").pop() ?? "")
              .filter(Boolean)
              .join(", "),
          }
        : { from: plain(str(item, "senderPerson")), fromTitle: plain(str(item, "senderPersonTitle")) }),
      unread: !sent && !str(item, "readDate") ? true : undefined,
      starred: item.isStarred === true || undefined,
      important: item.isImportant === true || undefined,
      hasAttachments: item.hasAttachments === true || undefined,
    }),
  );

export interface Period {
  title: string;
  personId: string;
  periodId: string;
  selected: boolean;
}

export const mapPeriods = (result: JsonObject): Period[] =>
  requiredList(result, "groups")
    .filter((group) => str(group, "id") === "periods")
    .flatMap((group) =>
      list(group, "filteritems").flatMap((item) => {
        const values = Array.isArray(item.values) ? item.values.map(String) : [];
        if (values.length !== 2 || values.some((value) => !/^\d+$/.test(value))) return [];
        return [{ title: plain(str(item, "name")), personId: values[0]!, periodId: values[1]!, selected: item.selected === true }];
      }),
    );

const average = (value: string): number | undefined => {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 10 ? parsed : undefined;
};

export const mapSemester = (items: JsonObject[]) =>
  items.map((item) =>
    compact({
      subject: plain(str(item, "subject")),
      teacher: plain(str(item, "teacherName")),
      average: average(str(item, "average")),
      finalGrade: plain(str(item, "main")),
      marks: list(item, "marks").map((mark) => plain(str(mark, "value"))).filter(Boolean),
      textMarks: [...list(item, "TextMarks"), ...list(item, "textMarks")].map((mark) => plain(str(mark, "value"))).filter(Boolean),
    }),
  );
