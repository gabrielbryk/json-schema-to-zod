export function normalizeCode(code: string): string {
  return code
    .replace(/\/\*\*/g, "/**")
    .replace(/\s+/g, " ")
    .replace(/;+/g, "")
    .trim();
}
