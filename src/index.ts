import { createServer as createHttpServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { TamoClient } from "./tamo.js";
import { createServer } from "./tools.js";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const port = Number(process.env.PORT ?? "8000");
const headerToken = required("MCP_TOKEN");
const pathToken = required("MCP_PATH_TOKEN");

const tamo = new TamoClient({
  username: required("TAMO_USERNAME"),
  password: required("TAMO_PASSWORD"),
  roleTitle: process.env.TAMO_ROLE || undefined,
  maxRequestsPerMinute: Number(process.env.MAX_TAMO_REQUESTS_PER_MINUTE ?? "30"),
});

const safeEqual = (actual: string, expected: string) => {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

// Clients that support headers use /mcp with a bearer token; ChatGPT only takes a URL, so it gets /<path token>/mcp.
const authorized = (path: string, authorization: string | undefined) => {
  if (path === "/mcp") return authorization?.startsWith("Bearer ") === true && safeEqual(authorization.slice(7), headerToken);
  const match = path.match(/^\/(.+)\/mcp$/);
  return match !== null && safeEqual(match[1]!, pathToken);
};

const httpServer = createHttpServer(async (request, response) => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  if (path === "/healthz") {
    response.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
    return;
  }
  if (path !== "/mcp" && !/^\/.+\/mcp$/.test(path)) {
    response.writeHead(404).end();
    return;
  }
  if (!authorized(path, request.headers.authorization)) {
    response.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  const server = createServer(tamo);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    await transport.handleRequest(request, response);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) response.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "internal_error" }));
  } finally {
    await server.close().catch(() => undefined);
  }
});

httpServer.listen(port, "0.0.0.0", () => console.error(`TAMO MCP listening on :${port}`));

const shutdown = () => httpServer.close(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
