# Inline Object Lifting (Top-Level Reusable Types)

## Goal
Lift inline, non-cyclic object schemas into top-level `$defs` so both bundle and single-file outputs emit reusable Zod schemas (e.g., CallTask `with` objects such as AsyncAPI become first-class exports). Keep current behavior default; opt-in via a flag.

## Scope
- Applies to both `jsonSchemaToZod` (single file) and `generateSchemaBundle` (multi-file).
- Targets inline object-like schemas (properties/patternProperties/additionalProperties/items/allOf/anyOf/oneOf/if/then/else/dependentSchemas/contains/not).
- Skip cyclic/self-referential candidates or ones where lifting would change semantics; err on not lifting when uncertain.

## High-Level Flow
1) **Preprocess** the incoming schema (root + `$defs`) with a lifting pass.
2) **Detect candidates**: inline object-like schemas not already `$ref`/`$defs`/boolean, having meaningful object keywords.
3) **Cycle guard**: localized DFS; if the candidate references itself/ancestors (via `$ref`/`$dynamicRef`), skip.
4) **Name**: derive a stable PascalCase name from the nearest named parent (root name/def) + path segments; use discriminator/const-enum to disambiguate union branches; suffix on collisions. Optional hook `nameForPath`.
5) **Rewrite**: add candidate to `$defs` under the chosen name; replace inline with `$ref: "#/$defs/<Name>"`. Preserve schema content verbatim.
6) **Proceed** to analyzer/emit/bundle with the transformed schema; new defs flow through existing import/ref logic.

## Options
- Extend `Options` and `GenerateBundleOptions` with:
  - `liftInlineObjects?: { enable?: boolean; nameForPath?: (path, ctx) => string }`
- Default: `enable` is false to avoid snapshot churn.
- Use `name`/`rootName` as the base parent name; fallback to `Root` when absent.

## Integration Points
- **Single file (`jsonSchemaToZod`)**: run lifting before `analyzeSchema`; feed transformed schema into analyzer/emitter so parity is maintained with bundle.
- **Bundle (`generateSchemaBundle`)**: run lifting before `buildBundleContext/planBundleTargets`; use returned `$defs`/defNames/root in downstream steps.
- **Shared hook**: expose the lifting pass via the public options on both paths to avoid divergent behavior.
- **Nested types feature**: lifted items no longer count as “nested” (they are top-level), which is expected when the flag is on.

## Naming Strategy (default)
- Base: nearest named ancestor (def name → PascalCase; root → `Root` or provided `name`/`rootName`).
- Path segments: PascalCase property names; for union branches, include discriminator const/enum value when present; else index (`Option1`).
- Collision resolution: maintain set of existing def names + assigned names; append numeric suffix.
- Hook: `nameForPath(path, { parentName, branchInfo, existingNames })`.

## Safety / Skip Rules
- Skip boolean schemas, pure meta-only objects (no constraints), ambiguous `unevaluatedProperties` contexts where lifting could alter validation, and any detected cycles.
- If ref resolution is unclear, prefer to keep inline rather than risk behavior change.

## Testing Plan
- **Unit (new suite for lifting pass)**:
  - Lifts simple inline property object → `$defs` + `$ref`.
  - Lifts inside allOf/oneOf/anyOf branches; names stable and unique.
  - Handles items/additionalProperties/patternProperties.
  - Skips self/ancestor-ref cycles.
  - Collision handling and custom `nameForPath` hook.
- **Integration**:
  - Flag off: existing snapshots unchanged.
  - Flag on (single + bundle): workflow fixture shows CallTask `with` shapes as top-level defs; CallTask branches reference them; `pnpm test` + workflow snapshot pass.
  - Maintain snapshots for both modes to contain churn; default-off remains the baseline.

## Risks / Mitigations
- **Semantics drift**: lifting could change validation if sibling keywords depend on inline position (e.g., `unevaluatedProperties`, composition in `parseObject`). Mitigate with conservative skip logic; if inline context is ambiguous, do not lift. Keep behavior opt-in (flag default off).
- **Cycle misdetection**: identity-only checks can miss `$ref`/`$dynamicRef` loops, causing infinite recursion or skipped lifts. Mitigate by reusing `buildRefRegistry`/`resolveRef` to detect ancestor/self refs during the lifting pass.
- **Naming collisions**: new defs could clash with existing `$defs` or generated names. Mitigate with suffixing and an optional `nameForPath` hook; check against `defInfoMap` inputs before insertion.
- **Bundle import gaps**: if lifted defs are not added to `defInfoMap`/`planBundleTargets`, `$ref` targets may emit without definitions. Mitigate by running the lifting pass before context/build planning so new `defNames` flow through imports.
- **Single/bundle divergence**: wiring only the bundle path would leave single-file outputs unchanged, confusing users. Mitigate by invoking the same lifting pass in `jsonSchemaToZod` and exposing the flag in shared `Options`.

## Implementation Notes
- New helper: `src/utils/liftInlineObjects.ts` (pure, no side effects).
- Returns `{ rootSchema, defs, addedDefNames, pathToDefName }` for debugging/tests.
- Reuse `toPascalCase` from bundle generator; keep ASCII identifiers.
- Consider reusing traversal patterns from `findNestedTypesInSchema` to avoid missing positions (properties/items/allOf/etc.).
