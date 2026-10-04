export const zone = "Europe/Vilnius";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const dayMs = 86_400_000;

const parts = (now: Date, options: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, hourCycle: "h23", ...options })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );

export const today = (now = new Date()): string => {
  const { year, month, day } = parts(now, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${year}-${month}-${day}`;
};

// TAMO's login expects the device-local time without a timezone suffix.
export const loginDateTime = (now = new Date()): string => {
  const p = parts(now, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
};

export const isValidDate = (value: string): boolean => {
  if (!isoDate.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
};

export const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10);

export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs);

export const mondayOf = (date: string): string => {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
};

export const monthRange = (month: string): [string, string] => {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return [`${month}-01`, `${month}-${String(last).padStart(2, "0")}`];
};

// TAMO rejects or truncates long ranges, so wide requests are split into chunks of at most maxDays.
export const chunkRange = (from: string, to: string, maxDays = 62): Array<[string, string]> => {
  const chunks: Array<[string, string]> = [];
  for (let start = from; start <= to; start = addDays(start, maxDays + 1)) {
    const end = addDays(start, maxDays);
    chunks.push([start, end < to ? end : to]);
  }
  return chunks;
};

// Extracts YYYY-MM-DD from values like "2026-09-25T13:15:24", "2026-09-25 00:00" or "2026.09.25".
export const dateOnly = (value: string): string => {
  const candidate = value.trim().slice(0, 10).replace(/\./g, "-");
  return isValidDate(candidate) ? candidate : "";
};

export const localTime = (instant: string): string => {
  const parsed = new Date(instant);
  if (!instant || Number.isNaN(parsed.getTime())) return "";
  const { hour, minute } = parts(parsed, { hour: "2-digit", minute: "2-digit" });
  return `${hour}:${minute}`;
};
