# Proposal: Strengthen `allOf` required handling

## Problem

- Required keys are dropped when properties live in a different `allOf` member than the `required` array (e.g., workflow schema `call`/`with`).
- Spread path only looks at each member’s own `required`, ignoring parent + sibling required-only members.
- Intersection fallback also skips parent required enforcement because `parseObject` disables missing-key checks when composition keywords exist.
- `$ref` members with required lists don’t inform optionality of sibling properties.
- Conflicting property definitions across `allOf` members fail silently (often ending up as permissive intersections).

## Goals

1. Preserve required semantics across `allOf`, even when properties and `required` are split across members.
2. Keep spread optimization where safe; otherwise, enforce required keys in the intersection path.
3. Respect `unevaluatedProperties`/`additionalProperties` constraints from stricter members.
4. Surface conflicts clearly instead of silently widening to `z.any()`.

## Proposed changes

- **Normalize `allOf` members up front (done partially):**
  - Add `type: "object"` when shape hints exist and merge parent+member required into any member that actually declares those properties (already implemented for the spread path; extend to intersection path and `$ref` resolution).

- **Intersection required enforcement:**
  - When spread is not possible, compute a combined required set (parent + all member `required` + required-only members) and add a `superRefine` that checks presence of those keys on the final intersection result.
  - Skip keys that none of the members define (avoid false positives).

- **Required-only + properties-only pattern:**
  - Detect an `allOf` where one member has only `required` and another has the properties; merge those required keys into the properties member before parsing.

- **$ref-aware required merge:**
  - When an `allOf` member is a `$ref`, resolve its schema shape/required (using existing ref resolution) and merge required keys that match properties provided by other members.

- **Policy reconciliation:**
  - When merging shapes, intersect `unevaluatedProperties`/`additionalProperties` so a member that disallows extras keeps that restriction after spread/intersection.

- **Conflict detection:**
  - If multiple members define the same property with incompatible primitive types (e.g., `string` vs `number`), emit a `superRefine` that fails with a clear message instead of silently widening.

## Testing

- Unit tests in `test/parsers/parseAllOf.test.ts` and `parseObject.test.ts` covering:
  - properties-only + required-only split (current workflow pattern).
  - Overlapping required across multiple members (including parent required).
  - `$ref` member with required + sibling properties.
  - Spread eligible vs. ineligible `allOf` and intersection fallback enforcing required.
  - `unevaluatedProperties` interactions where one member disallows extras.
  - Conflict detection on incompatible property types.

## Risks & mitigations

- **Over-enforcement**: Ensure required keys are only checked when at least one member defines the property. Filter combined required sets accordingly.
- **Ref resolution cost**: Cache resolved `$ref` shapes when harvesting required sets to avoid repeated work.
- **False conflicts**: Limit conflict detection to clear primitive mismatches; avoid flagging unions/anyOf/any as conflicts.

## Rollout

- Implement normalization + intersection required enforcement first, add tests for workflow fixture regression.
- Follow with `$ref`-aware required merge and policy reconciliation tests.
- Add conflict detection last (guarded behind a clear error message) to avoid unexpected breakage.
