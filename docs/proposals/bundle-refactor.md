# Schema Bundling Refactor (Analyzer + Emitters)

## Context
- `generateSchemaBundle` currently recurses via `parserOverride` and can overflow the stack when inline `$defs` are present (root hits immediately). Inline `$defs` inside `$defs` are also overwritten when stitching schemas.
- The conversion pipeline mixes concerns: parsing/analysis, code emission, and bundling strategy live together in `jsonSchemaToZod` and the bundle generator.

## Goals
- Single responsibility: analyze JsonSchema once, emit code through pluggable strategies (single file, bundle, nested types).
- Open for extension: new emitters (e.g., type-only), new ref resolution policies, without touching the analyzer.
- Safer bundling: no recursive parser overrides; import-aware ref resolution; preserve inline `$defs`.
- Testable units: analyzer IR and emitters have focused tests; bundle strategy tested with snapshots.

## Proposed Architecture
- **Analyzer (`analyzeSchema`)**: Convert JsonSchema + options into an intermediate representation (IR) containing symbols, ref pointer map, dependency graph, cycle info, and metadata flags. No code strings.
- **Emitters**:
  - `emitZod(ir, emitOptions)`: IR → zod code (esm/cjs/none), with naming hooks and export policies.
  - `emitTypes(ir, typeOptions)`: optional type-only exports (for nested types or barrel typing).
- **Strategies**:
  - `SingleFileStrategy`: analyze root → emit zod once.
  - `BundleStrategy`: analyze root once → slice IR per `$def` + root → emit per-file zod using an import-capable RefResolutionStrategy. Inline `$defs` remain scoped; cross-def `$ref`s become imports; unknown refs handled via policy.
  - `NestedTypesStrategy`: walk IR titles/property paths to emit a dedicated types file.
- **Public API**:
  - `analyzeSchema(schema, options): AnalysisResult`
  - `emitZod(ir, emitOptions): string`
  - `generateSchemaBundle(schema, bundleOptions): { files }` implemented via BundleStrategy
  - `jsonSchemaToZod(schema, options): string` becomes a thin wrapper (analyze + emit single file).

## SOLID Alignment
- SRP: analyzer, emitter, strategy are separate modules.
- OCP: new emitters/strategies plug in without changing analyzer.
- LSP/ISP: narrow contracts (naming hooks, ref resolution hooks) instead of monolithic option bags.
- DIP: bundle strategy depends on IR abstractions, not on concrete `jsonSchemaToZod` string output.

## Migration Plan
1) **Foundations**: Extract analyzer + zod emitter modules; make `jsonSchemaToZod` call them. Preserve output parity and option validation. Add tests around analyzer/emitter.
2) **Bundle Strategy**: Rework `generateSchemaBundle` to use the analyzer IR and an import-aware ref strategy; remove recursive `parserOverride`; preserve inline `$defs` within defs.
3) **Nested Types**: Move nested type extraction to IR-based walker; emit via `emitTypes`.
4) **Cleanups & API polish**: Reduce option bag coupling; document new APIs; consider default export ergonomics.

## Risks / Mitigations
- Risk: Output regressions. Mitigation: snapshot tests for single-file and bundle outputs.
- Risk: Bundle import mapping errors. Mitigation: ref-strategy unit tests (cycles, unknown refs, cross-def).
- Risk: Incremental refactor churn. Mitigation: keep `jsonSchemaToZod` wrapper stable while internals shift; land in stages with tests.
