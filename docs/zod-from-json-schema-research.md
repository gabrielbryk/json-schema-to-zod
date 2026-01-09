# Zod v4 native JSON Schema -> Zod conversion (fromJSONSchema)

This document captures how Zod implements its native JSON Schema to Zod conversion in v4, based on the local repo at `/Users/gbryk/Repos/zod`. It focuses on the concrete implementation in `from-json-schema.ts` and the related tests/docs, and then compares it to our `json-schema-to-zod` approach.

## Scope and sources

Primary implementation:

- Zod v4 classic converter: `packages/zod/src/v4/classic/from-json-schema.ts`.
- Export surface: `packages/zod/src/v4/classic/external.ts` (re-exports `fromJSONSchema`).
- Docs: `packages/docs/content/json-schema.mdx`.
- Tests: `packages/zod/src/v4/classic/tests/from-json-schema.test.ts`.

Our repo reference points (for comparison):

- Entry: `src/jsonSchemaToZod.ts`.
- Analysis pass + cycle detection: `src/core/analyzeSchema.ts`.
- Parsing: `src/parsers/parseSchema.ts`, `src/parsers/parseObject.ts`, `src/parsers/parseAllOf.ts`, `src/parsers/parseAnyOf.ts`, `src/parsers/parseOneOf.ts`.
- allOf property collection: `src/utils/collectSchemaProperties.ts`.
- Ref resolution and external registry: `src/utils/resolveRef.ts`.
- Emission: `src/core/emitZod.ts`.

## High-level architecture (Zod)

Zod's native converter is runtime-only and returns a `ZodType` instance, not generated source code. The entire pipeline is implemented in `from-json-schema.ts` and follows this flow:

1. `fromJSONSchema(...)` handles boolean schemas and creates a conversion context. (`packages/zod/src/v4/classic/from-json-schema.ts:622-642`)
2. Version detection uses `$schema` with a default fallback. (`packages/zod/src/v4/classic/from-json-schema.ts:104-119`)
3. The converter calls `convertSchema(...)`, which:
   - Builds the base schema ignoring composition keywords via `convertBaseSchema(...)`.
   - Applies composition (anyOf/oneOf/allOf) after the base schema is built.
   - Applies OpenAPI `nullable`, `readOnly`.
   - Captures metadata for unknown keys in a registry. (`packages/zod/src/v4/classic/from-json-schema.ts:541-616`)

The converter uses a local `z` object to avoid circular dependencies with `../index.js` by directly spreading internal module exports. (`packages/zod/src/v4/classic/from-json-schema.ts:8-13`)

## Entry point and conversion context

### fromJSONSchema

- Entry point: `fromJSONSchema(schema, params)` in `packages/zod/src/v4/classic/from-json-schema.ts:622-642`.
- Boolean schema handling:
  - `true` => `z.any()`.
  - `false` => `z.never()`.
- Builds a `ConversionContext` with:
  - `version`: draft-2020-12, draft-7, draft-4, or openapi-3.0.
  - `defs`: `$defs` or `definitions` map.
  - `refs`: cache of resolved refs.
  - `processing`: cycle detection set.
  - `rootSchema` and `registry`.

### Version detection

- `detectVersion` reads `$schema` and maps known draft URLs; otherwise defaults to draft-2020-12 unless `defaultTarget` is set. (`packages/zod/src/v4/classic/from-json-schema.ts:104-119`)

## Ref handling and cycles (Zod)

### resolveRef

- Only local refs are supported. Any `$ref` not starting with `#` throws an error. (`packages/zod/src/v4/classic/from-json-schema.ts:121-124`)
- Ref targets are limited to `$defs` (draft-2020-12) or `definitions` (draft-7/4) only. (`packages/zod/src/v4/classic/from-json-schema.ts:133-141`)
- `#` by itself references the root schema. (`packages/zod/src/v4/classic/from-json-schema.ts:128-131`)

### Cycle handling

- When a `$ref` is encountered, `convertBaseSchema`:
  - Returns cached value if already resolved.
  - Detects an in-flight ref via `processing` and returns `z.lazy(...)` to break cycles. (`packages/zod/src/v4/classic/from-json-schema.ts:169-183`)
  - Otherwise resolves the ref and stores the resulting Zod schema in `refs` cache. (`packages/zod/src/v4/classic/from-json-schema.ts:185-190`)

There is no explicit graph analysis. Cycle handling is purely on the `$ref` resolution stack.

## Unsupported keywords and error strategy

Zod refuses some schema keywords outright by throwing errors in `convertBaseSchema`:

- `not` (except `{ not: {} }` which becomes `z.never()`). (`packages/zod/src/v4/classic/from-json-schema.ts:146-154`)
- `unevaluatedItems`, `unevaluatedProperties`. (`packages/zod/src/v4/classic/from-json-schema.ts:155-160`)
- `if/then/else`. (`packages/zod/src/v4/classic/from-json-schema.ts:161-163`)
- `dependentSchemas` and `dependentRequired`. (`packages/zod/src/v4/classic/from-json-schema.ts:164-165`)

This means Zod's converter is intentionally partial and avoids emulating these features with refinements.

## Base schema conversion (convertBaseSchema)

### Enum and const

- `enum` cases:
  - Empty enum => `z.never()`.
  - Single value => `z.literal(value)`.
  - String-only enums => `z.enum([...])`.
  - Mixed types => `z.union` of literals.
  - OpenAPI nullable + enum `[null]` special-case returns `z.null()`. (`packages/zod/src/v4/classic/from-json-schema.ts:193-226`)
- `const` => `z.literal(schema.const)` (`packages/zod/src/v4/classic/from-json-schema.ts:229-231`)

### Type arrays

- If `type` is an array, it is expanded into a union by cloning the schema per type. (`packages/zod/src/v4/classic/from-json-schema.ts:237-249`)

### No explicit type

- If `type` is missing, Zod returns `z.any()`. (`packages/zod/src/v4/classic/from-json-schema.ts:252-255`)

### Strings

- String format mapping uses `.check(...)` with Zod validators for a fixed set of formats: email, url/uri-reference, uuid/guid, date-time/date/time/duration, ipv4/ipv6, mac, cidr, base64, base64url, e164, jwt, emoji, nanoid, cuid/cuid2/ulid/xid/ksuid. (`packages/zod/src/v4/classic/from-json-schema.ts:263-313`)
- Constraints:
  - `minLength` => `.min(...)`.
  - `maxLength` => `.max(...)`.
  - `pattern` => `.regex(new RegExp(...))` (no implicit anchors). (`packages/zod/src/v4/classic/from-json-schema.ts:318-327`)

### Numbers and integers

- Integer => `z.number().int()`; number => `z.number()`.
- Constraints: `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`. (`packages/zod/src/v4/classic/from-json-schema.ts:334-356`)

### Boolean and null

- `boolean` => `z.boolean()`.
- `null` => `z.null()`. (`packages/zod/src/v4/classic/from-json-schema.ts:363-370`)

### Objects

- Properties are converted to a Zod shape; optionality is based on `required` only. (`packages/zod/src/v4/classic/from-json-schema.ts:373-383`)
- `propertyNames`:
  - If there are no properties, it becomes `z.record(keySchema, valueSchema)`.
  - Otherwise it intersects `z.object(shape).passthrough()` with `z.looseRecord(keySchema, valueSchema)`. (`packages/zod/src/v4/classic/from-json-schema.ts:385-403`)
- `patternProperties`:
  - Produces a chain of `z.intersection(...)` with `z.looseRecord` for each pattern. (`packages/zod/src/v4/classic/from-json-schema.ts:406-439`)
- `additionalProperties`:
  - `false` => `object.strict()`.
  - schema => `object.catchall(schema)`.
  - `true` or omitted => `object.passthrough()`. (`packages/zod/src/v4/classic/from-json-schema.ts:443-456`)

### Arrays

- Tuples:
  - Draft 2020-12 uses `prefixItems`; draft-7 uses `items` array.
  - Additional items use `items` (2020-12) or `additionalItems` (draft-7).
  - `minItems`/`maxItems` applied to tuples via `.check(z.minLength/maxLength)`.
  - Implementation uses `z.tuple(...).rest(...)`. (`packages/zod/src/v4/classic/from-json-schema.ts:467-505`)
- Regular arrays:
  - `items` => `z.array(items)` with min/max constraints.
  - Missing items => `z.array(z.any())`. (`packages/zod/src/v4/classic/from-json-schema.ts:505-521`)
- `uniqueItems`, `contains`, `minContains`, `maxContains` are explicitly TODO (unsupported). (`packages/zod/src/v4/classic/from-json-schema.ts:460-462`)

### Description and default

- `description` => `.describe(...)`.
- `default` => `.default(...)`. (`packages/zod/src/v4/classic/from-json-schema.ts:530-536`)

## Composition (anyOf, oneOf, allOf)

Composition is applied after base conversion in `convertSchema`:

- `anyOf` => `z.union([...])`. (`packages/zod/src/v4/classic/from-json-schema.ts:552-556`)
- `oneOf` => `z.xor([...])` (exclusive union). (`packages/zod/src/v4/classic/from-json-schema.ts:558-563`)
- `allOf` => chain of `z.intersection(...)`. (`packages/zod/src/v4/classic/from-json-schema.ts:565-575`)

If the schema also has an explicit type/enum/const, the base schema is intersected with the composition. Otherwise the composition becomes the base result. (`packages/zod/src/v4/classic/from-json-schema.ts:546-575`)

### Empty allOf behavior

- No explicit type + empty `allOf` => `z.any()`.
- Explicit type + empty `allOf` => base schema only. (`packages/zod/src/v4/classic/from-json-schema.ts:566-575`)

## OpenAPI extensions

- `nullable` (OpenAPI 3.0 only) => `z.nullable(...)`. (`packages/zod/src/v4/classic/from-json-schema.ts:579-582`)
- `readOnly` => `z.readonly(...)`. (`packages/zod/src/v4/classic/from-json-schema.ts:584-587`)

## Metadata capture

- Zod collects additional metadata using a registry. It builds a `extraMeta` object with:
  - Core schema ID keys: `$id`, `id`, `$comment`, `$anchor`, `$vocabulary`, `$dynamicRef`, `$dynamicAnchor`.
  - Content keywords: `contentEncoding`, `contentMediaType`, `contentSchema`.
  - Any unrecognized keys (i.e., keys not in `RECOGNIZED_KEYS`). (`packages/zod/src/v4/classic/from-json-schema.ts:589-616`)
- Those metadata are attached via `ctx.registry.add(baseSchema, extraMeta)`. (`packages/zod/src/v4/classic/from-json-schema.ts:615-616`)
- The recognized key set is defined in `RECOGNIZED_KEYS` (`packages/zod/src/v4/classic/from-json-schema.ts:31-102`).

## Test coverage signals

The following tests illustrate intended behaviors:

- anyOf/oneOf/allOf and empty allOf handling: `packages/zod/src/v4/classic/tests/from-json-schema.test.ts:162-205`.
- Intersection behavior with explicit type: `packages/zod/src/v4/classic/tests/from-json-schema.test.ts:210-242`.

These tests confirm the “base schema then composition” strategy and the exclusive `oneOf` behavior.

## Differences vs our json-schema-to-zod implementation

### Output model

- Zod returns runtime `ZodType` instances (`fromJSONSchema`). (`packages/zod/src/v4/classic/from-json-schema.ts:622-642`)
- Our converter emits TypeScript source code strings. (`src/jsonSchemaToZod.ts:1-20`, `src/core/emitZod.ts:1-120`)

### Pipeline

- Zod uses a single conversion pipeline with a local cache and recursion handling.
- Our converter uses a two-pass analysis for declarations, deps, and cycles, then a separate emission pass. (`src/core/analyzeSchema.ts:39-153`, `src/core/emitZod.ts:1-120`)

### Ref resolution

- Zod only supports local refs under `#/$defs` or `#/definitions` and throws on external refs. (`packages/zod/src/v4/classic/from-json-schema.ts:121-143`)
- Our converter supports `$ref`, `$dynamicRef`, `$recursiveRef`, dynamic anchors, and can load external schemas into a registry. (`src/utils/resolveRef.ts:14-138`)

### Object + required + allOf

- Zod does not merge `allOf` properties into a base object. Required properties are only applied to keys defined in `properties` on the current schema. (`packages/zod/src/v4/classic/from-json-schema.ts:373-383`)
- Our `parseObject` collects properties from `allOf` (including ref targets) via `collectSchemaProperties` and uses those to avoid `any` for required-but-missing keys. (`src/parsers/parseObject.ts:14-41`, `src/utils/collectSchemaProperties.ts:24-83`)

This is the same class of issue described in `/private/tmp/workflow-schema-any-issue.md` (required key defined only in allOf). Zod’s converter would not enforce such a property at the base object level; it relies on `allOf` intersection to validate the property instead.

### Composition logic

- Zod: `anyOf` => union, `oneOf` => xor, `allOf` => intersection, always applied after base conversion. (`packages/zod/src/v4/classic/from-json-schema.ts:541-575`)
- Ours:
  - `anyOf` uses union but may lift inline objects to top-level declarations. (`src/parsers/parseAnyOf.ts:17-41`)
  - `oneOf` supports discriminated-union detection and "required-only" oneOf refinements. (`src/parsers/parseOneOf.ts:12-170`)
  - `allOf` may use a spread merge optimization for inline object-only allOf, otherwise intersection. (`src/parsers/parseAllOf.ts:64-147`)

### Keyword support

- Zod throws on `not`, `if/then/else`, `dependentSchemas`, `dependentRequired`, `unevaluated*`. (`packages/zod/src/v4/classic/from-json-schema.ts:146-165`)
- Our converter implements `not` and `if/then/else` using `refine`/`superRefine` and supports dependent schemas/required with additional refinements. (`src/parsers/parseNot.ts:1-17`, `src/parsers/parseIfThenElse.ts:1-36`, `src/parsers/parseObject.ts:209-257`)

### Arrays

- Zod does not implement `uniqueItems` or `contains` constraints in conversion. (`packages/zod/src/v4/classic/from-json-schema.ts:460-462`)
- Our converter implements `uniqueItems` and `contains` with `superRefine`. (`src/parsers/parseArray.ts:58-170`)

### String format coverage

- Zod supports a fixed list of formats and ignores custom ones. (`packages/zod/src/v4/classic/from-json-schema.ts:263-313`)
- Our converter maps additional formats and implements custom refinements for formats like `ip`, `hostname`, `uri-reference`, etc. (`src/parsers/parseString.ts:12-156`)

### Metadata

- Zod stores extra metadata in a registry and does not modify the schema via `meta()` calls directly. (`packages/zod/src/v4/classic/from-json-schema.ts:589-616`)
- Our converter emits `.describe(...)` and `.meta(...)` calls with a curated allowlist for known keywords. (`src/parsers/parseSchema.ts:203-257`)

## Implications for the current bug class

The issue in `/private/tmp/workflow-schema-any-issue.md` (required keys defined in allOf) is a pattern Zod does not explicitly handle in base object conversion. Zod expects the allOf intersection to enforce those requirements, but it does not rewrite the base object shape to include those properties.

Our converter attempts to merge properties from allOf into the base object shape to avoid falling back to `z.any()` for required-but-missing keys. This is implemented in `collectSchemaProperties` and used in `parseObject` (`src/utils/collectSchemaProperties.ts:24-83`, `src/parsers/parseObject.ts:14-41`).

If we want to align more with Zod’s approach, we would rely on allOf intersections exclusively. If we want stronger typing and explicit properties, we should keep (and expand) our merge strategy but make sure it is comprehensive (e.g., also consider `oneOf`/`anyOf` property merges where they are structurally safe).

## Potential comparison checklist for further analysis

If you want a more systematic parity report, these are the main axes to evaluate between Zod and our implementation:

- $ref support: local-only vs registry-based with external resolution.
- Cycle handling: lazy from ref stack vs full cycle graph detection and two-pass parse.
- Composition ordering: base then composition (Zod) vs parser-first composition rules (ours).
- Required + allOf property merging: absent in Zod, present in our parseObject.
- Conditional schemas: Zod throws; we emulate.
- Unsupported keywords: Zod throws on more features; we implement in refinement.
- Metadata strategy: registry vs emitted `.meta()`/`.describe()`.
