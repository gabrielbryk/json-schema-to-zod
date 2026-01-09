# Open Issues

Standard issue format (use for all entries):

```
## [ISSUE-ID] Title
- Status: open | investigating | blocked | fixed
- Category: correctness | type-safety | performance | ergonomics
- Summary: <1–2 sentences>
- Evidence: <file:line or schema path>
- Impact: <who/what is affected>
- Proposed fix: <short plan>
- Related: <issue IDs>
- Depends on: <issue IDs>
- Notes: <optional>
```

## [ISSUE-001] unevaluatedProperties is ignored

- Status: open
- Category: correctness
- Summary: `unevaluatedProperties: false` is not enforced, so many generated objects are looser than the schema requires.
- Evidence: `test/fixtures/workflow.yaml` (multiple occurrences); `src/parsers/parseObject.ts` has no handling; example output `ListenTaskSchema` in `.tmp-workflow-schema-output.ts:1827` uses `z.looseObject`.
- Impact: Extra keys pass validation and types remain open, diverging from the JSON Schema contract.
- Proposed fix: Implement `unevaluatedProperties` handling in `parseObject` (at least for non-composed objects; consider strategy for `allOf/oneOf/anyOf`).
- Related: ISSUE-006
- Depends on: —
- Notes: A phased implementation can trade strictness for runtime/type complexity.

## [ISSUE-002] minProperties/maxProperties are not enforced

- Status: open
- Category: correctness
- Summary: `minProperties`/`maxProperties` constraints are emitted as metadata but never validated.
- Evidence: `.tmp-workflow-schema-output.ts:2167` (`SwitchItemSchema`), `.tmp-workflow-schema-output.ts:2436` (`TaskListSchema` item), `.tmp-workflow-schema-output.ts:2495` (`ExtensionItemSchema`), `.tmp-workflow-schema-output.ts:260` (`ErrorFilterSchema`), `.tmp-workflow-schema-output.ts:660` (`DurationInline`).
- Impact: Objects meant to be non-empty or single-key allow invalid shapes.
- Proposed fix: Add object-level property count validation in `parseObject` (likely via `superRefine`), with awareness of `additionalProperties`, `patternProperties`, and `unevaluatedProperties`.
- Related: ISSUE-001
- Depends on: —
- Notes: None.

## [ISSUE-003] Required property without schema falls back to z.any

- Status: open
- Category: type-safety
- Summary: Required keys that have no property schema are emitted as `z.any()`.
- Evidence: `.tmp-workflow-schema-output.ts:152` (`McpClientSchema.version`); schema requires `version` but no definition exists (`test/fixtures/workflow.yaml:606-620`).
- Impact: Output type is overly permissive and hides schema inconsistencies.
- Proposed fix: Emit a warning when `required` contains undefined properties; optionally support a strict mode that errors on this.
- Related: ISSUE-006
- Depends on: —
- Notes: This is a schema authoring issue, but surfacing it improves trust in generated output.

## [ISSUE-004] anyOf with empty schema collapses to z.any

- Status: open
- Category: type-safety
- Summary: `anyOf: [<schema>, {}]` becomes `z.union([<schema>, z.any()])`, which is effectively `z.any()`.
- Evidence: `.tmp-workflow-schema-output.ts:1609` (`EventProperties.data`); source schema uses `{}` in `anyOf` (`test/fixtures/workflow.yaml:1549-1553`).
- Impact: Types and validation are wider than intended; unions become noisy without adding constraints.
- Proposed fix: Normalize unions/anyOf to detect empty schemas and collapse explicitly to `z.any()`/`z.unknown()` (or emit a warning).
- Related: ISSUE-005, ISSUE-006
- Depends on: ISSUE-005
- Notes: If `useUnknown` is enabled, prefer `z.unknown()` for better type safety.

## [ISSUE-005] Union normalization (flatten + dedupe) is missing

- Status: open
- Category: performance
- Summary: Unions and XORs are built without flattening or deduplication, creating redundant or nested union trees.
- Evidence: `src/parsers/parseMultipleType.ts`, `src/parsers/parseAnyOf.ts`, `src/parsers/parseOneOf.ts`.
- Impact: Larger output and slower TS inference for complex schemas and recursive unions.
- Proposed fix: Normalize union members by flattening nested unions and deduping by expression/type key; collapse single-member unions.
- Related: ISSUE-004, ISSUE-006
- Depends on: —
- Notes: This is the root cause behind several “too open” union outputs and should be implemented once in a shared helper.

## [ISSUE-006] Default openness (fallbacks + passthrough) is not configurable

- Status: open
- Category: ergonomics
- Summary: Missing schemas and `additionalProperties` defaults result in permissive output, with no opt-in strictness mode.
- Evidence: `src/utils/anyOrUnknown.ts`, `src/parsers/parseSchema.ts`, `src/parsers/parseObject.ts`.
- Impact: Users who want strict types/validation must modify schemas rather than toggling a generator option.
- Proposed fix: Add a strictness option that defaults to `unknown`, enforces `additionalProperties` as strict/strip, and optionally tightens recursive record handling.
- Related: ISSUE-001, ISSUE-003, ISSUE-004, ISSUE-005
- Depends on: —
- Notes: Keep default behavior spec-correct; make strictness opt-in.

## [ISSUE-007] Intersection normalization (balanced tree) is missing

- Status: open
- Category: performance
- Summary: Object-level `allOf` and `patternProperties` build left-deep intersection chains instead of balanced trees.
- Evidence: `src/parsers/parseObject.ts` intersection loops; `src/parsers/parseAllOf.ts` already has a balanced strategy.
- Impact: Deep intersection nesting increases TS inference time for large schemas.
- Proposed fix: Build balanced intersection trees in `parseObject` (use the `half()` strategy or reuse `parseAllOf` where safe).
- Related: ISSUE-008
- Depends on: —
- Notes: This should be applied after property-only `allOf` merge to avoid redundant intersections.

## [ISSUE-008] Nullable folding is missing

- Status: open
- Category: performance
- Summary: `null | T` unions are emitted as `z.union([z.null(), T])` instead of `T.nullable()`.
- Evidence: `src/parsers/parseAnyOf.ts`, `src/parsers/parseMultipleType.ts`.
- Impact: Slightly larger output and unnecessary union complexity; can affect TS inference speed.
- Proposed fix: Detect nullable unions and emit `.nullable()`; avoid double-wrapping when `nullable: true` is also set.
- Related: ISSUE-005
- Depends on: ISSUE-005
- Notes: This is a normalization step; semantics remain equivalent.
