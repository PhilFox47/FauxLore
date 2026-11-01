/** Model-generated Codex fields may be a scalar where an array is expected. */
export function codexText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map(codexText).filter(Boolean).join(", ");
  return "";
}
export function codexList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(codexText).filter(Boolean);
  const one = codexText(value);
  return one ? [one] : [];
}
