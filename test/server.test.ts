import assert from "node:assert/strict";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { TamoClient } from "../src/tamo.js";
import { createServer } from "../src/tools.js";

interface Call {
  url: URL;
  method: string;
  headers: Record<string, string>;
}

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fakeTamo = (overrides: Record<string, () => Response> = {}) => {
  const calls: Call[] = [];
  let logins = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string> });
    const route = url.pathname.replace(/^\/(MobileServiceV3\/)?/, "");
    if (overrides[route]) return overrides[route]!();
    switch (route) {
      case "AuthenticateV2":
        logins++;
        return respond({ Status: 1, ErrorCode: 0, Result: { authToken: `token-${logins}`, personId: 7, role: 2, userRoleIsAllowed: true } });
      case "core/app/settings/StyleRef":
        return respond({ isSuccess: true });
      case "core/app/roles":
        return respond({ isSuccess: true, roles: [{ id: `role-${logins}`, title: "Mokinys", active: true }] });
      case "core/app/darbai":
        return respond({
          isSuccess: true,
          items: [
            { lessonId: 1, date: "2026-09-07", deadline: "2026-09-10", homeWork: "Skaityti", thingName: "Istorija", completionDate: "2026-09-08" },
            { lessonId: 2, date: "2026-09-07", deadline: "2026-09-09", homeWork: "Pratimai", thingName: "Matematika" },
          ],
        });
      case "core/app/feeds":
        return respond({ isSuccess: true, result: [{ id: 1, eventId: 1, date: "2026-09-24", eventDetails: { ThingName: "Fizika", Value: "9" } }] });
      default:
        return respond({ isSuccess: false }, 404);
    }
  };
  return { calls, logins: () => logins };
};

const connect = async (tamo: TamoClient) => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer(tamo).connect(serverTransport);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(clientTransport);
  return client;
};

const textOf = (result: Awaited<ReturnType<Client["callTool"]>>) => (result.content as Array<{ text: string }>)[0]!.text;

const config = { username: "u", password: "p", maxRequestsPerMinute: 100 };

test("lists only read-only tools", async () => {
  fakeTamo();
  const client = await connect(new TamoClient(config));
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    ["get_classwork", "get_grades", "get_homework", "get_notifications", "get_schedule", "get_school_calendar", "get_semester_grades", "list_messages"],
  );
  assert.ok(tools.every((tool) => tool.annotations?.readOnlyHint === true));
});

test("logs in once, sends the role header, filters homework and reads fresh data every time", async () => {
  const { calls, logins } = fakeTamo();
  const client = await connect(new TamoClient(config));
  const args = { from: "2026-09-01", to: "2026-09-30" };

  const notDone = JSON.parse(textOf(await client.callTool({ name: "get_homework", arguments: { ...args, status: "not_done" } })));
  assert.deepEqual(notDone.homework.map((item: { subject: string }) => item.subject), ["Matematika"]);
  await client.callTool({ name: "get_homework", arguments: args });

  assert.equal(logins(), 1);
  const reads = calls.filter((call) => call.url.pathname === "/core/app/darbai");
  assert.equal(reads.length, 2);
  assert.equal(reads[0]!.headers["x-selected-role"], "role-1");
  assert.equal(reads[0]!.headers.Authorization, "Bearer token-1");
  assert.equal(reads[0]!.url.searchParams.get("workType"), "home");
  assert.ok(calls.every((call) => call.method === "GET" || call.url.pathname.endsWith("/AuthenticateV2")));
});

test("logs in again once when the session expires", async () => {
  let first = true;
  const { logins } = fakeTamo({
    "core/app/feeds": () => {
      if (first) {
        first = false;
        return respond({}, 401);
      }
      return respond({ isSuccess: true, result: [] });
    },
  });
  const client = await connect(new TamoClient(config));
  const result = await client.callTool({ name: "get_notifications", arguments: {} });
  assert.equal(result.isError, undefined);
  assert.equal(logins(), 2);
});

test("rejects bad ranges and reports TAMO failures as tool errors", async () => {
  fakeTamo({ "core/app/feeds": () => respond({ isSuccess: false }) });
  const client = await connect(new TamoClient(config));
  const reversed = await client.callTool({ name: "get_grades", arguments: { from: "2026-09-30", to: "2026-09-01" } });
  assert.equal(reversed.isError, true);
  const tooLong = await client.callTool({ name: "get_homework", arguments: { from: "2026-01-01", to: "2026-06-01" } });
  assert.equal(tooLong.isError, true);
  const failed = await client.callTool({ name: "get_notifications", arguments: {} });
  assert.equal(failed.isError, true);
  assert.equal(textOf(failed), "TAMO could not return this data");
});

test("throttles bursts of TAMO requests", async () => {
  fakeTamo();
  const client = await connect(new TamoClient({ ...config, maxRequestsPerMinute: 3 }));
  const result = await client.callTool({ name: "get_notifications", arguments: {} });
  assert.equal(result.isError, true);
  assert.match(textOf(result), /Too many TAMO requests/);
});
