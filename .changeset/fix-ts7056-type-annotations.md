---
"@gabrielbryk/json-schema-to-zod": patch
---

Fix TS7056 error when generating declarations for schemas referencing recursive types

- Add explicit type annotations to any schema that references recursive schemas (not just unions)
- This prevents TypeScript from trying to serialize extremely large expanded types when generating .d.ts files
- Fix type narrowing in parseObject for allOf required array handling
