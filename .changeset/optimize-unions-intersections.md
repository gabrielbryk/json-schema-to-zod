---
"@gabrielbryk/json-schema-to-zod": patch
---

Normalize unions (dedupe/flatten, fold nullable) and balance object-level intersections for simpler output and faster type checking. Preserve base types for `not` schemas and keep required-only `oneOf` refinements from erasing base object types.
