---
"@gabrielbryk/json-schema-to-zod": patch
---

Fix bundle output by emitting z.lazy for cyclical refs outside object properties, use ZodError.issues in generated conditionals, and make nested type extraction array-aware to avoid invalid indexers.
