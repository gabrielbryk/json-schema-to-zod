export const resolveUri = (base: string, ref: string): string => {
  try {
    // If ref is absolute, new URL will accept it; otherwise resolves against base
    return new URL(ref, base).toString();
  } catch {
    // Fallback: simple concatenation to avoid throwing; keep ref as-is
    if (ref.startsWith("#")) return `${base}${ref}`;
    return ref;
  }
};
