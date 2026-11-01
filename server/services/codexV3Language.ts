/** V3 presentation/research language: English, with original German when appropriate.
 * Native-script source excerpts must not leak into the finished Codex. */
const otherScript = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Thai}]/u;
export function hasUnwantedScript(text: unknown): boolean {
  return typeof text === "string" && otherScript.test(text);
}
export function stripNativeAnnotations(input: string): string {
  let text = input;
  // Prefer the existing romanized/English name; nested native-script
  // parentheticals must be removed from the inside outward.
  for (let i = 0; i < 8; i++) {
    const next = text.replace(/\s*[（(][^()（）]*[)）]/gu, (part) =>
      hasUnwantedScript(part) ? "" : part);
    if (next === text) break;
    text = next;
  }
  return text.replace(/\s{2,}/g, " ").trim();
}
export interface LanguageIssue { path: string; text: string; }
export interface LanguageFix { path: string; english: string; }
const isReferenceKey = (key: string) =>
  key === "sourceUrl" || key === "sourceUrls" || key === "sources" ||
  key === "id" || key === "sourceStatus";
export function collectLanguageIssues(root: unknown): LanguageIssue[] {
  const issues: LanguageIssue[] = [];
  const walk = (value: unknown, path: string, key: string) => {
    if (isReferenceKey(key)) return;
    if (typeof value === "string") {
      const clean = stripNativeAnnotations(value);
      if (hasUnwantedScript(clean)) issues.push({path, text: clean});
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, path ? `${path}.${i}` : String(i), key));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value))
        walk(v, path ? `${path}.${k}` : k, k);
    }
  };
  walk(root, "", "");
  return issues;
}
/** Apply only path-exact English fixes; never modify sources/URLs or cast IDs. */
export function applyLanguageFixes<T>(data: T, fixes: unknown): T {
  const byPath = new Map<string, string>();
  if (Array.isArray(fixes)) for (const row of fixes) {
    if (typeof row?.path === "string" && typeof row?.english === "string" &&
        row.english.trim() && !hasUnwantedScript(stripNativeAnnotations(row.english))) {
      byPath.set(row.path, stripNativeAnnotations(row.english));
    }
  }
  const walk = (value: unknown, path: string, key: string): unknown => {
    if (isReferenceKey(key)) return value;
    if (typeof value === "string") {
      const clean = stripNativeAnnotations(value);
      return hasUnwantedScript(clean) ? byPath.get(path) || clean : clean;
    }
    if (Array.isArray(value)) return value.map((v, i) => walk(v, path ? `${path}.${i}` : String(i), key));
    if (value && typeof value === "object") return Object.fromEntries(
      Object.entries(value).map(([k,v]) => [k, walk(v, path ? `${path}.${k}` : k, k)]));
    return value;
  };
  return walk(data, "", "") as T;
}
