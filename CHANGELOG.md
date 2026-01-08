# @gabrielbryk/json-schema-to-zod

## 2.12.1

### Patch Changes

- d57f812: Align Zod output with Zod v4 idiomatic patterns, including strict/loose object helpers, exact optional properties, and broader discriminated union detection. Also improve recursive getter emissions to avoid TS7056 via explicit type annotations.
- e8cbafc: Fix `unevaluatedProperties: false` with `oneOf` by avoiding strict union branches, allowing base properties through, and enforcing unknown-key rejection after composition.

## 2.12.0

### Minor Changes

- 719e761: Add `typeExports` option to export TypeScript types for all generated schemas

  When `typeExports: true` is set (along with `exportRefs: true`), each generated schema will have a corresponding type export:

  ```typescript
  export const MySchema = z.object({...});
  export type MySchema = z.infer<typeof MySchema>;
  ```

  This makes it easier to use the generated types throughout your codebase without manually creating type aliases.

## 2.11.1

### Patch Changes

- 466d672: Fix TS7056 error when generating declarations for schemas referencing recursive types
  - Add explicit type annotations to any schema that references recursive schemas (not just unions)
  - This prevents TypeScript from trying to serialize extremely large expanded types when generating .d.ts files
  - Fix type narrowing in parseObject for allOf required array handling

## 2.11.0

### Minor Changes

- 2656c90: Fix Zod v4 type compatibility and improve discriminated union detection

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

### Patch Changes

- 63c6a1c: Enable inline object lifting by default with improved naming and cycle guards

## 2.10.1

### Patch Changes

- 1c318a0: Ensure bundled outputs remain type-safe by grouping strongly connected defs, emitting lazy getters for recursive object refs, and reordering bundle members to avoid duplicate exports.
- 87526f0: Preserve precise types for recursive schemas by emitting typed lazy wrappers instead of erasing types, and add a workflow regression type-check to guard against inference blowups.

## 2.9.0

### Minor Changes

- 0ef12db: - Extract analyzer/emitter core, refactor bundle generation to avoid recursion and preserve inline defs/definitions.
  - Add scoped naming for inline $defs, lazy cross-ref handling, and nested types emission.
  - Expand bundle test coverage with snapshots, inline-def fixtures, and nested-type extraction.

### Patch Changes

- b8f6248: - Commit remaining utility, ref resolution test, and config updates.
- 04b6c6b: Fix bundle output by emitting z.lazy for cyclical refs outside object properties, use ZodError.issues in generated conditionals, and make nested type extraction array-aware to avoid invalid indexers.
- b8f7b29: Fix type errors in CI by replacing symbol-based allOf indexing, guarding invalid refs, and tightening string content schema parsing types.
- 691cc5b: - Added ESLint (recommended + no-require-imports) and cleaned all lint issues across src/tests; tightened types and removed unused vars.
  - Ensured ESM-friendly test evals and ref/anchor resolver code without require usage.
- 4d127fe: Remove fallback to the non-existent ZodError.errors property in generated conditional schemas; rely on ZodError.issues to avoid TypeScript errors.
- 7d257dd: - Ensure dist/esm emits real ESM with NodeNext settings and type:module, and update tests to run under ESM by providing createRequire shims.

## 2.8.0

### Minor Changes

- 0065ee8: - Add support for JSON Schema `dependentRequired` on objects with optional custom error message.
  - Extend format handling and add bigint format helpers while warning on unknown string formats.

### Patch Changes

- 3d57690: - Make $ref handling cycle-aware with SCC-based ordering and minimal z.lazy usage.
  - Add workflow spec fixture to compiled-output tests to guard against TDZ issues.
  - Fix parseString to build a full Refs context when missing, keeping type checks happy.
- 3d57690: - Switch ESM/typings builds to NodeNext resolution and ensure relative imports include .js extensions for Node ESM compatibility.
- 82aa953: Fix patternProperties validation under Zod v4 by preserving regex patterns and handling missing `ctx.path`.
- a501e7d: Adjust release workflow to rely on the default npm from setup-node and drop unused tokens.
- 43f2abc: Update object record generation to use `z.record(z.string(), …)` for Zod v4 compatibility.

## 2.7.3

### Patch Changes

- d727121: Fix internal logic; publish patched release.
