---
"@gabrielbryk/json-schema-to-zod": minor
---

- Extract analyzer/emitter core, refactor bundle generation to avoid recursion and preserve inline defs/definitions.
- Add scoped naming for inline $defs, lazy cross-ref handling, and nested types emission.
- Expand bundle test coverage with snapshots, inline-def fixtures, and nested-type extraction.
