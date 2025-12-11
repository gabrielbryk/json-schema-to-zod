---
"@gabrielbryk/json-schema-to-zod": minor
---

Add `typeExports` option to export TypeScript types for all generated schemas

When `typeExports: true` is set (along with `exportRefs: true`), each generated schema will have a corresponding type export:

```typescript
export const MySchema = z.object({...});
export type MySchema = z.infer<typeof MySchema>;
```

This makes it easier to use the generated types throughout your codebase without manually creating type aliases.
