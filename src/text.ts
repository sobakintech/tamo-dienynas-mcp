const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const decodeEntities = (value: string): string =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return entities[entity.toLowerCase()] ?? match;
  });

// TAMO text fields mix plain text and small HTML fragments.
export const plain = (raw: string): string => {
  if (!raw) return "";
  const value = raw.replace(/\r\n?/g, "\n");
  if (!value.includes("<") && !value.includes("&")) return value.trim();
  const text = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

// Teachers often fill the homework field with a dash or "x" when nothing was assigned.
export const isPlaceholder = (value: string): boolean => {
  const trimmed = value.trim();
  return trimmed.length <= 1 || !/[\p{L}\p{N}]/u.test(trimmed);
};
