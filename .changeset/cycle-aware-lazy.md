---
"@gabrielbryk/json-schema-to-zod": patch
---
- Make $ref handling cycle-aware with SCC-based ordering and minimal z.lazy usage.
- Add workflow spec fixture to compiled-output tests to guard against TDZ issues.
