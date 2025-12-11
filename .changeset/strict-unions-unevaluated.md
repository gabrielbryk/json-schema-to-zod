---
"@gabrielbryk/json-schema-to-zod": patch
---

Fix `unevaluatedProperties: false` with `oneOf` by avoiding strict union branches, allowing base properties through, and enforcing unknown-key rejection after composition.
