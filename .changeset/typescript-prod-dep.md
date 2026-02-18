---
"@gabrielbryk/json-schema-to-zod": patch
---

Move `typescript` from `devDependencies` to `dependencies`. The library uses the TypeScript compiler API at runtime in `esmEmitter.ts` to format generated output; without this change, consumers who install the package without dev dependencies would receive a runtime crash.
