---
"@gabrielbryk/json-schema-to-zod": minor
---

Fix Zod v4 type compatibility and improve discriminated union detection

### Zod v4 Type Fixes
- Remove `ZodEffects` usage which doesn't exist in Zod v4
- `.superRefine()` and `.refine()` no longer change the schema type
- `.transform()` now correctly returns `ZodPipe` type instead of `ZodEffects`

### Discriminated Union Detection Improvements
- Enhanced `findImplicitDiscriminator` to detect discriminators in `allOf` members
- Properly resolves `$ref` when checking for discriminator values
- Correctly collects `required` fields from both parent schema and `allOf` members

### Cleaner Output Generation
- Simplified `parseAllOf` to avoid generating redundant `z.record().superRefine()` patterns
- Build proper object types with specific property annotations instead of generic `ZodObject<Record<string, ZodTypeAny>>`
- Intersection types are now properly tracked and reflected in type annotations
