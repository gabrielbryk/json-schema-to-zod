# Improvement Plan: Aligning with Zod v4 Best Practices

Based on analysis of our generated output and Zod v4 limitations research.

---

## Current Problems in Our Generated Output

### Problem 1: `z.record()` with recursive values lacks `z.lazy()`

**Current output:**

```typescript
export const TaskList: z.ZodArray<z.ZodRecord<typeof z, typeof Task>> =
  z.array(z.record(z.string(), Task).meta({...}))
```

**Issues:**

1. `Task` referenced directly in `z.record()` - Colin confirmed in #4881 this REQUIRES `z.lazy()`
2. Type annotation is completely wrong - `typeof z` as key type is nonsense
3. This will cause runtime TDZ errors if Task isn't declared yet

**Should be:**

```typescript
export const TaskList = z.array(
  z.record(z.string(), z.lazy(() => Task)).meta({...})
)
```

---

### Problem 2: Union type annotations use `z.ZodTypeAny`

**Current output:**

```typescript
export const CallTask: z.ZodUnion<readonly z.ZodTypeAny[]> = z.union([...])
```

**Issues:**

1. `z.ZodTypeAny[]` defeats the entire purpose of type safety
2. Loses all type information about what's actually in the union

**Should be:**
Either remove the type annotation entirely:

```typescript
export const CallTask = z.union([...])
```

Or if we must have one (for circular reference reasons), at least don't use `ZodTypeAny`.

---

### Problem 3: Object type annotations use `Record<string, z.ZodTypeAny>`

**Current output:**

```typescript
export const DoTask: z.ZodIntersection<
  z.ZodObject<Record<string, z.ZodTypeAny>>,
  z.ZodIntersection<typeof TaskBase, z.ZodObject<Record<string, z.ZodTypeAny>>>
> = ...
```

**Issues:**

1. `Record<string, z.ZodTypeAny>` loses all property type information
2. The intersection type is overly complex and still loses info

**Should be:**
Remove the type annotation and let TypeScript infer:

```typescript
export const DoTask = z.object({}).and(z.intersection(TaskBase, z.object({...})))
```

---

### Problem 4: Getters ARE being used correctly ✅

**Current output (GOOD):**

```typescript
get "do"(): z.ZodOptional<typeof TaskList>{ return TaskList.optional() }
```

This follows the Zod v4 pattern correctly! The getter with explicit return type annotation.

---

### Problem 5: Empty object base with `.and()` is wasteful

**Current output:**

```typescript
z.object({}).and(z.intersection(TaskBase, z.object({...})))
```

**Issue:**
Starting with `z.object({})` then using `.and()` is unnecessary when there are no direct properties.

**Should be:**

```typescript
z.intersection(TaskBase, z.object({...}))
// OR
TaskBase.and(z.object({...}))
```

---

## Specific Code Changes Required

### Change 1: Fix `z.record()` recursive handling

**File:** `src/parsers/parseSchema.ts`

When reference is inside a `z.record()` context AND the target is recursive, use `z.lazy()`:

```typescript
// Check if we're inside a record value context
const inRecordValue = refs.path.some(
  (p, i) => p === "additionalProperties" || (refs.path[i - 1] === "record" && p === "1") // second arg to z.record
);

if (inRecordValue && (isSameCycle || isForwardRef)) {
  return `z.lazy(() => ${refName})`;
}
```

---

### Change 2: Remove bad type annotations

**File:** `src/core/emitZod.ts`

Current logic adds type annotations when there's a cycle/lazy/getter. Change to:

1. Only add type annotation if we can infer a GOOD type
2. Never use `z.ZodTypeAny` - either infer correctly or don't annotate

```typescript
if (isCycle || hasLazy || hasGetter) {
  const inferredType = inferTypeFromExpression(value);
  // Skip annotation if it's useless or wrong
  if (
    inferredType !== "z.ZodTypeAny" &&
    !inferredType.includes("Record<string, z.ZodTypeAny>") &&
    !inferredType.includes("typeof z,")
  ) {
    return `${shouldExport ? "export " : ""}const ${refName}: ${inferredType} = ${value}`;
  }
}
// Let TypeScript infer instead
return `${shouldExport ? "export " : ""}const ${refName} = ${value}`;
```

---

### Change 3: Fix `inferTypeFromExpression` for records

**File:** `src/utils/schemaRepresentation.ts`

The current inference for `z.record()` is broken. Fix it:

```typescript
// Handle z.record(K, V)
if (expr.startsWith("z.record(")) {
  const argsStart = 9;
  const argsEnd = findMatchingParen(expr, argsStart - 1);
  if (argsEnd !== -1) {
    const args = expr.substring(argsStart, argsEnd);
    const commaIndex = findTopLevelComma(args);
    if (commaIndex !== -1) {
      const keyExpr = args.substring(0, commaIndex).trim();
      const valueExpr = args.substring(commaIndex + 1).trim();

      // CRITICAL: Don't use "typeof z" - that's nonsense
      const keyType = keyExpr === "z.string()" ? "z.ZodString" : inferTypeFromExpression(keyExpr);
      const valueType = inferTypeFromExpression(valueExpr);

      return `z.ZodRecord<${keyType}, ${valueType}>`;
    }
  }
}
```

---

### Change 4: Remove unnecessary `z.object({}).and()`

**File:** `src/parsers/parseObject.ts`

When there are no direct properties but there IS composition (allOf), don't create empty object:

```typescript
// Current (line ~218):
: hasCompositionKeywords
  ? "z.object({})"  // Creates empty object unnecessarily
  : `z.record(z.string(), ${anyOrUnknown(refs)})`;

// Should be:
: hasCompositionKeywords
  ? null  // Let composition be the base, not empty object
  : `z.record(z.string(), ${anyOrUnknown(refs)})`;
```

Then when building output with `.and()`:

```typescript
if (output === null && its.an.allOf(objectSchema)) {
  // No base object, just use the composition directly
  output = parseAllOf(...);
} else if (its.an.allOf(objectSchema)) {
  output += `.and(${parseAllOf(...)})`;
}
```

---

## Summary of Changes

| File                      | Change                                      | Priority |
| ------------------------- | ------------------------------------------- | -------- |
| `parseSchema.ts`          | Add `z.lazy()` for refs inside `z.record()` | HIGH     |
| `emitZod.ts`              | Don't add `z.ZodTypeAny` annotations        | HIGH     |
| `schemaRepresentation.ts` | Fix `z.record()` type inference             | HIGH     |
| `parseObject.ts`          | Remove unnecessary `z.object({}).and()`     | MEDIUM   |

---

## Expected Outcome

**Before:**

```typescript
export const TaskList: z.ZodArray<z.ZodRecord<typeof z, typeof Task>> =
  z.array(z.record(z.string(), Task).meta({...}))

export const CallTask: z.ZodUnion<readonly z.ZodTypeAny[]> = z.union([...])
```

**After:**

```typescript
export const TaskList = z.array(
  z.record(z.string(), z.lazy(() => Task)).meta({...})
)

export const CallTask = z.union([...])  // Let TS infer
```

This aligns with:

1. Colin's guidance that `z.record()` REQUIRES `z.lazy()` for recursive values
2. Best practice of not using `z.ZodTypeAny` which defeats type safety
3. Zod v4's getter pattern for recursive object properties (which we already do)
