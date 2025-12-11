# Inline Object Lifting (Top-Level Reusable Types)

## Goal
Lift inline, non-cyclic object schemas into top-level `$defs` so both bundle and single-file outputs emit reusable Zod schemas (e.g., CallTask `with` objects such as AsyncAPI become first-class exports). This is now the default behavior (opt-out via a flag). Move lifting into an IR transformation pipeline (not just a raw-schema pre-pass) for stronger guarantees and shared behavior.

## Scope
- Applies to both `jsonSchemaToZod` (single file) and `generateSchemaBundle` (multi-file).
- Targets inline object-like schemas (properties/patternProperties/additionalProperties/items/allOf/anyOf/oneOf/if/then/else/dependentSchemas/contains/not).
- Skip cyclic/self-referential candidates or ones where lifting would change semantics; err on not lifting when uncertain.

## High-Level Flow (IR-centric)
1) **Analyze to IR**: ingest JSON Schema → IR with refs, dependencies, SCCs, and registry (as per bundle refactor proposal).
2) **Hoist transform (IR pass)**:
   - Detect inline object-like nodes (properties/items/allOf/anyOf/oneOf/if/then/else/dependentSchemas/contains/not, etc.).
   - Skip boolean schemas, `$ref`/`$dynamicRef`, and `$defs` members.
   - Use IR dependency graph/ref registry for accurate ancestor/self cycle detection; if ambiguous, skip.
   - Optionally deduplicate by structural hash (excluding titles/descriptions) so identical shapes share one hoisted def.
3) **Name** via a centralized naming service:
   - Base on nearest named parent (root/def) + path; include discriminator/const-enum hints; suffix on collisions.
   - Allow `nameForPath` hook; all passes/emitters call the same service.
4) **Rewrite IR**:
   - Create top-level def nodes for hoisted shapes; replace inline nodes with ref nodes.
   - Preserve annotations; keep ASCII identifiers.
   - Emit debug metadata (path → def name) for tests/telemetry.
5) **Emit**:
   - Single-file: emit Zod using transformed IR.
   - Bundle: build defInfoMap/plan targets/imports from transformed IR; lifted defs flow like native `$defs`.

## Options
- Extend `Options` and `GenerateBundleOptions` with:
  - `liftInlineObjects?: { enable?: boolean; nameForPath?: (path, ctx) => string }`
- Default: `enable` is true; set `enable: false` to opt out.
- Use `name`/`rootName` as the base parent name; fallback to `Root` when absent.

## Integration Points
- **Shared IR pass**: integrate the hoist transform into the IR pipeline used by both `jsonSchemaToZod` and `generateSchemaBundle`.
- **Single file**: run analysis → hoist pass → emit.
- **Bundle**: run analysis → hoist pass → plan/emit; new defs appear in defInfoMap/imports.
- **Nested types**: lifted items are no longer “nested” (expected when the flag is on).

## Naming Strategy (default)
- Centralized naming service (IR utility) used by all passes/emitters.
- Base: nearest named ancestor (def name → PascalCase; root → `Root` or provided `name`/`rootName`).
- Path segments: PascalCase property names; union branches include discriminator const/enum when present; else index (`Option1`).
- Collision resolution: set of existing def names + assigned names; append numeric suffix.
- Hook: `nameForPath(path, { parentName, branchInfo, existingNames })`.

## Safety / Skip Rules
- Skip boolean schemas, pure meta-only objects (no constraints), ambiguous `unevaluatedProperties` contexts where lifting could alter validation, and any detected cycles.
- Use ref registry/IR deps for cycle detection; if unclear, do not lift.
- Structural hash dedup optional: only if shapes match; otherwise, keep distinct.

## Testing Plan
- **Unit (hoist IR pass)**:
  - Lifts simple inline property object → top-level def + ref node.
  - Lifts inside allOf/oneOf/anyOf branches; names stable and unique.
  - Handles items/additionalProperties/patternProperties.
  - Skips self/ancestor-ref cycles (using ref registry).
  - Collision handling and custom `nameForPath` hook.
  - Optional structural hash dedup: identical shapes hoisted once.
- **Integration**:
- Default-on: workflow fixture shows CallTask `with` shapes as top-level defs; CallTask branches reference them; `pnpm test` + workflow snapshot pass.
- Opt-out coverage: with `enable: false`, outputs match legacy layout (no lifting) to preserve backward compatibility when explicitly requested.
- Maintain snapshots for both modes to contain churn while default-on is adopted.

## Risks / Mitigations
- **Semantics drift**: lifting could change validation if sibling keywords depend on inline position (e.g., `unevaluatedProperties`, composition). Mitigate with conservative skip logic; if context is ambiguous, do not lift. Default-on but easily opt-out with `enable: false`.
- **Cycle misdetection**: identity-only checks can miss `$ref`/`$dynamicRef` loops. Mitigate by reusing ref registry/IR deps for ancestor/self detection in the hoist pass.
- **Naming collisions**: new defs could clash with existing `$defs` or generated names. Mitigate with centralized naming service, suffixing, optional hook, and checks against defInfoMap inputs.
- **Bundle import gaps**: lifted defs must flow into defInfoMap/planBundleTargets. Mitigate by running the hoist pass before planning so new defNames/imports are included.
- **Single/bundle divergence**: if only bundle is wired, single-file outputs diverge. Mitigate by invoking the same IR hoist pass in `jsonSchemaToZod` and exposing the flag in shared `Options`.

## Implementation Notes
- New IR transform: `src/utils/liftInlineObjects.ts` (pure, no side effects) operating on IR nodes rather than raw schema where possible; if raw is needed, still leverage ref registry.
- Returns `{ rootSchema, defs, addedDefNames, pathToDefName }` (or IR equivalents) for debugging/tests.
- Central naming service (shared util) used by hoist, emitters, and other passes; reuse `toPascalCase` and keep ASCII identifiers.
- Reuse traversal coverage from `findNestedTypesInSchema` to avoid missing positions; prefer IR graph traversal for accuracy.
