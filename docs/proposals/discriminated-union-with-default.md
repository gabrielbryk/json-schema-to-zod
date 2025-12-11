# Proposal: Discriminated Union with Default Case Detection

## Status: Blocked by Zod v4 Type System

**TL;DR**: The runtime optimization works, but Zod v4's type system prevents `ZodDiscriminatedUnion` from being nested inside `ZodUnion`. Until this is resolved upstream, we cannot implement this optimization while maintaining type safety.

## Summary

Enhance `parseOneOf` to detect and optimize JSON Schema patterns where a oneOf contains multiple variants with constant discriminator values plus a "catch-all" default variant using `not: { enum: [...] }`.

## Motivation

Consider this common JSON Schema pattern (from Serverless Workflow spec):

```yaml
callTask:
  oneOf:
    - title: CallAsyncAPI
      properties:
        call: { const: "asyncapi" }
    - title: CallGRPC
      properties:
        call: { const: "grpc" }
    - title: CallHTTP
      properties:
        call: { const: "http" }
    # ... more known variants
    - title: CallFunction  # Default/catch-all
      properties:
        call:
          not:
            enum: ["asyncapi", "grpc", "http", "openapi", "a2a", "mcp"]
```

The `CallFunction` variant uses `not: { enum: [...] }` where the enum values **exactly match** the const values of other variants. This is semantically a discriminated union with a default case.

### Current Output

```typescript
z.union([
  asyncApiSchema,
  grpcSchema,
  httpSchema,
  openapiSchema,
  a2aSchema,
  mcpSchema,
  callFunctionSchema  // Default case
])
```

This uses O(n) sequential matching - Zod tries each schema until one passes.

### Proposed Output

```typescript
z.union([
  z.discriminatedUnion("call", [
    asyncApiSchema,
    grpcSchema,
    httpSchema,
    openapiSchema,
    a2aSchema,
    mcpSchema
  ]),
  callFunctionSchema  // Default case
])
```

**Benefits:**
- Known values (`"asyncapi"`, `"grpc"`, etc.) use O(1) discriminated union lookup
- Unknown values fail fast from discriminatedUnion, then try the default case
- More efficient runtime validation for the common case

## Detection Algorithm

### Step 1: Identify Discriminator Candidates

For each property key that appears in all oneOf options:
1. Collect options where the property has a constant value (`const` or `enum: [single]`)
2. Identify if exactly ONE option has `not: { enum: [...] }` for the same property

### Step 2: Validate Default Case Pattern

The "default case" pattern is valid when:
1. All other options have constant discriminator values
2. Exactly one option has `not: { enum: values }`
3. The `values` in the negated enum **exactly match** the const values from other options
4. The discriminator property is required in all options

### Step 3: Generate Optimized Output

```typescript
type DiscriminatorResult =
  | { type: 'full'; key: string }
  | { type: 'withDefault'; key: string; defaultIndex: number; constValues: string[] }
  | undefined;
```

## Implementation

### Changes to `parseOneOf.ts`

1. **Enhance `findImplicitDiscriminator`** to detect the default case pattern:

```typescript
const findImplicitDiscriminator = (
  options: JsonSchema[],
  refs: Refs
): DiscriminatorResult => {
  // ... existing logic to collect properties and required fields

  for (const key of candidateKeys) {
    const constValues: string[] = [];
    let defaultIndex: number | undefined;
    let defaultEnumValues: string[] | undefined;

    for (let i = 0; i < resolvedOptions.length; i++) {
      const prop = resolvedOptions[i].properties[key];

      if (prop.const) {
        constValues.push(prop.const);
      } else if (prop.not?.enum) {
        // Potential default case
        if (defaultIndex !== undefined) {
          // Multiple defaults - can't optimize
          break;
        }
        defaultIndex = i;
        defaultEnumValues = prop.not.enum;
      } else {
        // Neither const nor not.enum - can't use discriminated union
        break;
      }
    }

    // Check if default enum matches const values
    if (defaultIndex !== undefined && defaultEnumValues) {
      const constSet = new Set(constValues);
      const enumSet = new Set(defaultEnumValues);
      if (setsEqual(constSet, enumSet)) {
        return { type: 'withDefault', key, defaultIndex, constValues };
      }
    }

    // All have const values
    if (constValues.length === resolvedOptions.length) {
      return { type: 'full', key };
    }
  }

  return undefined;
};
```

2. **Update `parseOneOf`** to handle the `withDefault` case:

```typescript
export const parseOneOf = (schema, refs) => {
  const discriminator = findImplicitDiscriminator(schema.oneOf, refs);

  if (discriminator?.type === 'withDefault') {
    const { key, defaultIndex, constValues } = discriminator;

    // Parse all options
    const allParsed = schema.oneOf.map((s, i) => parseSchema(s, {...}));

    // Separate known variants from default
    const knownVariants = allParsed.filter((_, i) => i !== defaultIndex);
    const defaultVariant = allParsed[defaultIndex];

    // Generate discriminated union with default fallback
    const discriminatedExpr = `z.discriminatedUnion("${key}", [${knownVariants.map(v => v.expression).join(", ")}])`;

    return {
      expression: `z.union([${discriminatedExpr}, ${defaultVariant.expression}])`,
      type: `z.ZodUnion<readonly [z.ZodDiscriminatedUnion<"${key}", readonly [${knownVariants.map(v => v.type).join(", ")}]>, ${defaultVariant.type}]>`
    };
  }

  // ... existing logic for full discriminated union or regular union
};
```

## Zod v4 Type System Limitation

**Problem**: In Zod v4, `ZodDiscriminatedUnion` cannot be used as a member of `ZodUnion` at the type level.

When we generate:
```typescript
z.union([
  z.discriminatedUnion("call", [known1, known2, ...]),
  defaultVariant
])
```

The runtime works correctly, but TypeScript fails with:
```
Type 'ZodDiscriminatedUnion<...>' is not assignable to type 'SomeType'.
The types of '_zod.values' are incompatible between these types.
```

**Root Cause**: Zod v4's internal `SomeType` constraint doesn't include `ZodDiscriminatedUnion`. This appears to be an intentional design decision, as discriminated unions are meant to be "leaf" schemas, not composable with regular unions.

**Workaround Attempted**: Use a type annotation listing all individual variants while keeping the optimized runtime expression. This fails because Zod v4's strict tuple checking requires the type annotation tuple length to match the runtime tuple length.

**Potential Solutions**:
1. **Wait for Zod v4 update**: If Zod adds `ZodDiscriminatedUnion` to `SomeType`, this would work
2. **Use type assertion**: Cast the result with `as unknown as ZodUnion<...>` - unsafe but functional
3. **Request Zod feature**: Open an issue requesting discriminated union composability

For now, we fall back to regular `z.union()` for schemas with a default case.

## Edge Cases

1. **Multiple default cases**: If more than one option has `not: { enum }`, fall back to regular union
2. **Partial enum match**: If `not: { enum }` doesn't exactly match other const values, fall back to regular union
3. **Non-string discriminators**: Only string values are supported (same as current discriminated union)
4. **Nested allOf**: Must resolve properties from allOf members (already implemented)

## Type Safety

The generated type correctly represents the union structure:

```typescript
z.ZodUnion<readonly [
  z.ZodDiscriminatedUnion<"call", readonly [
    z.ZodIntersection<typeof TaskBase, z.ZodObject<{call: z.ZodLiteral<"asyncapi">, ...}>>,
    z.ZodIntersection<typeof TaskBase, z.ZodObject<{call: z.ZodLiteral<"grpc">, ...}>>,
    // ... other known variants
  ]>,
  z.ZodIntersection<typeof TaskBase, z.ZodObject<{call: z.ZodAny, ...}>>  // Default
]>
```

## Testing

Add test cases for:
1. Basic discriminated union with default case
2. Default case with exact enum match
3. Default case with partial enum match (should fall back to union)
4. Multiple potential defaults (should fall back to union)
5. Real-world workflow spec CallTask schema

## Future Considerations

- Could extend to support multiple "catch-all" patterns beyond `not: { enum }`
- Could support numeric discriminators if needed
- Could potentially use Zod's `.catch()` for even more efficient default handling
