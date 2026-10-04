import { loginDateTime } from "./dates.js";
import { isObject, obj, requiredList, str, type JsonObject } from "./json.js";

const modernBase = "https://api.tamo.lt/";
const legacyBase = "https://dienynas.tamo.lt/MobileServiceV3/";
// The official Android app sends this build constant, not a per-device id.
const appGuid = "1166cfd3-1be5-4dca-aa64-5aff7bbb8acc";
const maxResponseBytes = 4 * 1024 * 1024;

export class TamoError extends Error {
  constructor(message: string, readonly expired = false) {
    super(message);
  }
}

export interface TamoConfig {
  username: string;
  password: string;
  roleTitle?: string;
  maxRequestsPerMinute: number;
}

export interface Session {
  token: string;
  personId: string;
  legacyRole: number;
  roleId: string;
  roleCount: number;
  studentName: string;
}

interface RequestOptions {
  query?: Record<string, string>;
  legacy?: boolean;
  envelope?: boolean;
  login?: JsonObject;
}

const validHeader = (value: string) => value.length > 0 && !/[\u0000-\u001f\u007f]/.test(value);

const checkEnvelope = (payload: JsonObject, legacy: boolean) => {
  if (legacy) {
    if (str(payload, "ErrorMessage") === "User is not authenticated.") throw new TamoError("TAMO session expired", true);
    if (str(payload, "Status") !== "1" || str(payload, "ErrorCode") !== "0") {
      throw new TamoError(
        str(payload, "ErrorCode") === "-13"
          ? "TAMO requires an active TAMO IŠMANIEMS subscription for this data"
          : "TAMO rejected the request",
      );
    }
  } else if (str(payload, "message") === "User is not authenticated.") {
    throw new TamoError("TAMO session expired", true);
  } else if (payload.isSuccess !== true) {
    throw new TamoError("TAMO could not return this data");
  }
};

export class TamoClient {
  private session?: Session;
  private sessionPromise?: Promise<Session>;
  private readonly requestTimes: number[] = [];

  constructor(private readonly config: TamoConfig) {}

  async currentSession(): Promise<Session> {
    if (this.session) return this.session;
    this.sessionPromise ??= this.login().finally(() => {
      this.sessionPromise = undefined;
    });
    this.session = await this.sessionPromise;
    return this.session;
  }

  // Reads one modern route with the selected student role.
  modern(path: string, query: Record<string, string> = {}, envelope = true): Promise<JsonObject> {
    return this.authenticated({ query, envelope }, path);
  }

  // Reads one legacy MobileServiceV3 route and returns its Result object.
  async legacy(path: string, query: Record<string, string> = {}): Promise<JsonObject> {
    return obj(await this.authenticated({ query, legacy: true }, path), "Result");
  }

  private async authenticated(options: RequestOptions, path: string): Promise<JsonObject> {
    const session = await this.currentSession();
    try {
      return await this.request(path, options, session);
    } catch (error) {
      if (!(error instanceof TamoError) || !error.expired) throw error;
      if (this.session === session) this.session = undefined;
      return this.request(path, options, await this.currentSession());
    }
  }

  private async login(): Promise<Session> {
    const auth = obj(
      await this.request("AuthenticateV2", {
        legacy: true,
        login: {
          username: this.config.username,
          password: this.config.password,
          dateTime: loginDateTime(),
          typePhoneSystem: "Android",
          guid: appGuid,
        },
      }),
      "Result",
    );
    const token = str(auth, "authToken");
    if (auth.userRoleIsAllowed !== true || !validHeader(token)) throw new TamoError("TAMO did not grant access to this account");
    const base = {
      token,
      personId: str(auth, "personId"),
      legacyRole: Number(str(auth, "role")) || 0,
      studentName: `${str(auth, "firstName")} ${str(auth, "lastName")}`.trim(),
    };

    await this.request("core/app/settings/StyleRef", {}, { ...base, roleId: "", roleCount: 0 });
    const roles = requiredList(await this.request("core/app/roles", {}, { ...base, roleId: "", roleCount: 0 }), "roles");
    const role = this.pickRole(roles);
    const roleId = str(role, "id");
    if (!validHeader(roleId)) throw new TamoError("TAMO returned an unusable role");
    return { ...base, roleId, roleCount: roles.length };
  }

  // Role ids change on every roles request, so the role is chosen by its stable title instead.
  private pickRole(roles: JsonObject[]): JsonObject {
    if (roles.length === 0) throw new TamoError("This TAMO account has no school roles");
    const wanted = this.config.roleTitle?.trim().toLowerCase();
    if (wanted) {
      const match = roles.find((role) => [str(role, "title"), str(role, "subtitle")].some((text) => text.toLowerCase().includes(wanted)));
      if (!match) throw new TamoError(`No TAMO role matches TAMO_ROLE "${this.config.roleTitle}"`);
      return match;
    }
    if (roles.length === 1) return roles[0]!;
    return roles.find((role) => role.active === true) ?? roles[0]!;
  }

  private throttle() {
    const now = Date.now();
    while (this.requestTimes.length && this.requestTimes[0]! <= now - 60_000) this.requestTimes.shift();
    if (this.requestTimes.length >= this.config.maxRequestsPerMinute) {
      const wait = Math.ceil((this.requestTimes[0]! + 60_000 - now) / 1000);
      throw new TamoError(`Too many TAMO requests; try again in ${wait} seconds`);
    }
    this.requestTimes.push(now);
  }

  private async request(path: string, options: RequestOptions, session?: Session): Promise<JsonObject> {
    this.throttle();
    const { query = {}, legacy = false, envelope = true, login } = options;
    const parameters = new URLSearchParams(query);
    if (legacy && session) parameters.set("authToken", session.token);
    const suffix = parameters.size ? `?${parameters}` : "";
    const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "okhttp/4.9.1" };
    if (!legacy && session) {
      headers.Authorization = `Bearer ${session.token}`;
      if (session.roleId) headers["x-selected-role"] = session.roleId;
    }
    if (login) headers["Content-Type"] = "application/json; charset=UTF-8";

    let response: Response;
    try {
      response = await fetch((legacy ? legacyBase : modernBase) + path + suffix, {
        method: login ? "POST" : "GET",
        headers,
        body: login ? JSON.stringify(login) : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new TamoError("Could not reach TAMO");
    }
    if (response.status === 401) throw new TamoError("TAMO session expired", true);
    if (response.status < 200 || response.status > 299) {
      await response.body?.cancel();
      throw new TamoError(response.status === 403 ? "TAMO denied access to this data" : `TAMO responded with HTTP ${response.status}`);
    }

    const raw = await response.arrayBuffer();
    if (raw.byteLength > maxResponseBytes) throw new TamoError("TAMO response is too large; use a shorter date range");
    const text = new TextDecoder().decode(raw);
    if (!envelope && !text.trim()) return {};
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new TamoError("TAMO returned a response that is not JSON");
    }
    if (!isObject(payload)) throw new TamoError("TAMO returned an unexpected response");
    if (envelope) checkEnvelope(payload, legacy || Boolean(login));
    return payload;
  }
}

