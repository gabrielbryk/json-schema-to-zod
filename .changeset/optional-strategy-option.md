---
"@gabrielbryk/json-schema-to-zod": minor
---

Add `optionalStrategy` option to control whether optional object properties emit `.optional()` or `.exactOptional()`. Defaults to `"exactOptional"` (current behaviour) for full backward compatibility. Use `"optional"` when callers may produce `{ field: undefined }` via optional chaining or object spreads.
