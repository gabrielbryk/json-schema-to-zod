---
"@gabrielbryk/json-schema-to-zod": patch
---

Preserve precise types for recursive schemas by emitting typed lazy wrappers instead of erasing types, and add a workflow regression type-check to guard against inference blowups.
