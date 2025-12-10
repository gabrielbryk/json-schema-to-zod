---
"@gabrielbryk/json-schema-to-zod": patch
---

Remove fallback to the non-existent ZodError.errors property in generated conditional schemas; rely on ZodError.issues to avoid TypeScript errors.
