# @gabrielbryk/json-schema-to-zod

## 2.9.0

### Minor Changes

- 0ef12db: - Extract analyzer/emitter core, refactor bundle generation to avoid recursion and preserve inline defs/definitions.
  - Add scoped naming for inline $defs, lazy cross-ref handling, and nested types emission.
  - Expand bundle test coverage with snapshots, inline-def fixtures, and nested-type extraction.

### Patch Changes

- b8f6248: - Commit remaining utility, ref resolution test, and config updates.
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
