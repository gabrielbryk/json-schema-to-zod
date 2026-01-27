---
"@gabrielbryk/json-schema-to-zod": patch
---

Fix recursive oneOf with direct self-references using z.union instead of z.xor

When a recursive schema has a oneOf containing a direct self-reference (without z.lazy() wrapper),
the v2.15.0 fix to use z.union for recursive catchall cases didn't apply because the condition
`isRecursive && (inCatchall || hasLazyMembers)` didn't cover direct self-references.

This patch adds detection for direct self-references in oneOf options, ensuring z.union is used
instead of z.xor for these patterns. z.xor validation fails during parsing when evaluating
self-referential branches, so z.union is the correct choice.

This fixes validation failures for schemas like EventConsumptionStrategy from the Serverless
Workflow spec which uses: `oneOf: [simple-cases, allOf: [$ref: self, additional-properties]]`
