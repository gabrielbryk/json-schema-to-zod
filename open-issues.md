# Open Issues

Standard issue format (use for all entries):

```
## [Title]
- Status: open | investigating | blocked | fixed
- Category: correctness | type-safety | performance | ergonomics
- Summary: <1–2 sentences>
- Evidence: <file:line or schema path>
- Impact: <who/what is affected>
- Proposed fix: <short plan>
- Related: <issue titles>
- Depends on: <issue titles>
- Notes: <optional>
```

## [unevaluatedProperties is ignored]

- Status: open
- Category: correctness
- Summary: `unevaluatedProperties: false` is not enforced, so many generated objects are looser than the schema requires.
- Evidence: `test/fixtures/workflow.yaml` (multiple occurrences); `src/parsers/parseObject.ts` has no handling; example output `ListenTaskSchema` in `.tmp-workflow-schema-output.ts:1827` uses `z.looseObject`.
- Impact: Extra keys pass validation and types remain open, diverging from the JSON Schema contract.
- Proposed fix: Implement `unevaluatedProperties` handling in `parseObject` (at least for non-composed objects; consider strategy for `allOf/oneOf/anyOf`).
- Related: minProperties/maxProperties are not enforced; Default openness (fallbacks + passthrough) is not configurable
- Depends on: —
- Notes: A phased implementation can trade strictness for runtime/type complexity.

## [minProperties/maxProperties are not enforced]

- Status: open
- Category: correctness
- Summary: `minProperties`/`maxProperties` constraints are emitted as metadata but never validated.
- Evidence: `.tmp-workflow-schema-output.ts:2167` (`SwitchItemSchema`), `.tmp-workflow-schema-output.ts:2436` (`TaskListSchema` item), `.tmp-workflow-schema-output.ts:2495` (`ExtensionItemSchema`), `.tmp-workflow-schema-output.ts:260` (`ErrorFilterSchema`), `.tmp-workflow-schema-output.ts:660` (`DurationInline`).
- Impact: Objects meant to be non-empty or single-key allow invalid shapes.
- Proposed fix: Add object-level property count validation in `parseObject` (likely via `superRefine`), with awareness of `additionalProperties`, `patternProperties`, and `unevaluatedProperties`.
- Related: unevaluatedProperties is ignored
- Depends on: —
- Notes: None.

## [Required property without schema falls back to z.any]

- Status: open
- Category: type-safety
- Summary: Required keys that have no property schema are emitted as `z.any()`.
- Evidence: `.tmp-workflow-schema-output.ts:152` (`McpClientSchema.version`); schema requires `version` but no definition exists (`test/fixtures/workflow.yaml:606-620`).
- Impact: Output type is overly permissive and hides schema inconsistencies.
- Proposed fix: Emit a warning when `required` contains undefined properties; optionally support a strict mode that errors on this.
- Related: Default openness (fallbacks + passthrough) is not configurable
- Depends on: —
- Notes: This is a schema authoring issue, but surfacing it improves trust in generated output.

## [anyOf with empty schema collapses to z.any]

- Status: open
- Category: type-safety
- Summary: `anyOf: [<schema>, {}]` becomes `z.union([<schema>, z.any()])`, which is effectively `z.any()`.
- Evidence: `.tmp-workflow-schema-output.ts:1609` (`EventProperties.data`); source schema uses `{}` in `anyOf` (`test/fixtures/workflow.yaml:1549-1553`).
- Impact: Types and validation are wider than intended; unions become noisy without adding constraints.
- Proposed fix: Normalize unions/anyOf to detect empty schemas and collapse explicitly to `z.any()`/`z.unknown()` (or emit a warning).
- Related: Default openness (fallbacks + passthrough) is not configurable
- Depends on: —
- Notes: If `useUnknown` is enabled, prefer `z.unknown()` for better type safety.

## [Default openness (fallbacks + passthrough) is not configurable]

- Status: open
- Category: ergonomics
- Summary: Missing schemas and `additionalProperties` defaults result in permissive output, with no opt-in strictness mode.
- Evidence: `src/utils/anyOrUnknown.ts`, `src/parsers/parseSchema.ts`, `src/parsers/parseObject.ts`.
- Impact: Users who want strict types/validation must modify schemas rather than toggling a generator option.
- Proposed fix: Add a strictness option that defaults to `unknown`, enforces `additionalProperties` as strict/strip, and optionally tightens recursive record handling.
- Related: unevaluatedProperties is ignored; Required property without schema falls back to z.any; anyOf with empty schema collapses to z.any
- Depends on: —
- Notes: Keep default behavior spec-correct; make strictness opt-in.

## [additionalProperties forces object typing even when schema is unioned with non-objects]

- Status: open
- Category: correctness
- Summary: When `additionalProperties` is set alongside `oneOf/anyOf`, the parser assumes the schema is an object and emits an object intersection, which drops non-object branches.
- Evidence: `HTTPQuerySchema` in `.tmp-workflow-schema-output.ts:171` is `z.intersection(z.looseObject({}), z.xor([object, runtimeExpression]))` while the source allows a runtime-expression branch (`test/fixtures/workflow.yaml:386-398`).
- Impact: Legitimate non-object values fail validation and types are too narrow.
- Proposed fix: When `additionalProperties` exists, only force object typing if the schema is explicitly `type: object`; otherwise keep unions intact and apply `additionalProperties` only to object branches.
- Related: Default openness (fallbacks + passthrough) is not configurable
- Depends on: —
- Notes: This is a correctness bug (not just optimization).

## [Large union splitting to avoid TS7056]

- Status: open
- Category: performance
- Summary: Very large unions can trigger TS7056 (“inferred type exceeds maximum length”) when emitting declarations; flattening unions can worsen this by expanding the literal union in `.d.ts`.
- Evidence: Zod issue https://github.com/colinhacks/zod/issues/1040; multiple reports of TS7056 with big unions in libs that emit declarations.
- Impact: Builds fail when emitting `.d.ts` for large schemas; forces manual annotations or schema splitting.
- Proposed fix: Add optional union-splitting options for `anyOf`/`type: []` unions:
  - `maxUnionSize?: number` (threshold to split).
  - `unionSplitMode?: "inline" | "named"` (named emits `const UnionPartN = z.union([...])` to let TS refer to `typeof UnionPartN` instead of serializing the full literal union).
  - `unionSplitStrategy?: "chunk" | "balanced"` (chunk into fixed size or balanced tree).
  - (Optional) `unionTypeAnnotation?: boolean` to emit `z.ZodUnion<[...]>`/`z.ZodType<...>` annotations on named sub-unions, which further reduces serialization size.
- Related: String-based optimizations are brittle (need structured IR)
- Depends on: —
- Notes: Pure nesting (`z.union([z.union([...]), ...])`) is often insufficient because TS flattens unions during inference; naming sub-unions is the more reliable workaround.

## [String-based optimizations are brittle (need structured IR)]

- Status: open
- Category: ergonomics
- Summary: Several optimizations parse emitted expression strings (`z.union(...)`, `z.intersection(...)`) instead of operating on structured data.
- Evidence: `src/utils/normalizeUnion.ts`, `src/utils/schemaRepresentation.ts`, `src/core/emitZod.ts`.
- Impact: Output changes can silently disable optimizations; harder to maintain/refactor.
- Proposed fix: Introduce a structured IR (e.g., `SchemaRepresentation` gains `kind`, `children`, `meta`) and perform normalizations on IR before emitting strings; keep a string emission phase only at the end.
- Related: Large union splitting to avoid TS7056
- Depends on: —
- Notes: This can start with union/intersection nodes before a full rewrite.
