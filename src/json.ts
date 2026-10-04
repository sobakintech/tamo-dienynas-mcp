export type JsonObject = Record<string, unknown>;

export const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const obj = (source: JsonObject, key: string): JsonObject => {
  const value = source[key];
  return isObject(value) ? value : {};
};

export const str = (source: JsonObject, key: string): string => {
  const value = source[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

export const list = (source: JsonObject, key: string): JsonObject[] => {
  const value = source[key];
  return Array.isArray(value) ? value.filter(isObject) : [];
};

// A missing or malformed collection means the response shape changed, not that the day was empty.
export const requiredList = (source: JsonObject, key: string): JsonObject[] => {
  const value = source[key];
  if (!Array.isArray(value) || value.some((item) => !isObject(item))) {
    throw new Error(`TAMO returned an unrecognized "${key}" collection`);
  }
  return value as JsonObject[];
};

// Legacy responses spell their collection either "items" or "Items".
export const legacyItems = (result: JsonObject): JsonObject[] =>
  Array.isArray(result.items) ? requiredList(result, "items") : requiredList(result, "Items");

// Drops empty strings, empty arrays, null and undefined so tool output stays compact.
export const compact = <T extends JsonObject>(value: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(value).filter(([, field]) =>
      field !== undefined && field !== null && field !== "" && !(Array.isArray(field) && field.length === 0),
    ),
  ) as Partial<T>;
