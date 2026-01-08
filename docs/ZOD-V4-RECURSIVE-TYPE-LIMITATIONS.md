# Zod v4 Recursive Type Inference: TypeScript Limitations & Workarounds

## Executive Summary

Zod v4 introduced a new getter-based approach for recursive schemas that eliminates the need for `z.lazy()` in many cases. However, **this approach has significant TypeScript limitations**, particularly when recursive schemas are used within unions, discriminated unions, records, or when chaining multiple methods.

This document consolidates findings from multiple GitHub issues to inform our code generation strategy.

---

## The Core Problem

**TypeScript's type inference breaks when recursive schemas are embedded inside certain Zod APIs.**

From Colin McDonnell (Zod creator) in [#4691](https://github.com/colinhacks/zod/issues/4691):

> "You're hitting against TypeScript limitations, not Zod limitations."

### What Works (Standalone Recursive Object)

```typescript
const Category = z.object({
  name: z.string(),
  get subcategories() {
    return z.array(Category);
  },
});

type Category = z.infer<typeof Category>;
// { name: string; subcategories: Category[] }  ✅ Correct inference
```

### What Breaks (Recursive Object in Union)

```typescript
const ActivityUnion = z.union([
  z.object({
    name: z.string(),
    get subactivities() {
      return z.nullable(z.array(ActivityUnion));
    },
  }),
  z.string(),
]);

type Activity = z.infer<typeof ActivityUnion>;
// string | { name: string; subactivities: unknown[] | null }  ❌ Lost type info
```

---

## Affected Scenarios

Based on issues [#4691](https://github.com/colinhacks/zod/issues/4691), [#4351](https://github.com/colinhacks/zod/issues/4351), [#4561](https://github.com/colinhacks/zod/issues/4561), [#4264](https://github.com/colinhacks/zod/issues/4264), [#4502](https://github.com/colinhacks/zod/issues/4502), [#4881](https://github.com/colinhacks/zod/issues/4881):

| Scenario                                     | Getter Works? | Notes                            |
| -------------------------------------------- | ------------- | -------------------------------- |
| Self-recursive object property               | ✅ Yes        | The happy path                   |
| Mutually recursive objects                   | ✅ Yes        | With explicit type annotations   |
| Recursive inside `z.union()`                 | ❌ No         | Falls back to `unknown`          |
| Recursive inside `z.discriminatedUnion()`    | ❌ No         | Requires `z.lazy()`              |
| Recursive inside `z.record()`                | ❌ No         | Must use `z.lazy()`              |
| Recursive inside `z.array()` nested in union | ❌ No         | Complex nesting breaks inference |
| Chaining methods on recursive type           | ⚠️ Partial    | `.optional()` often breaks it    |
| Using `.extend()` with recursive getters     | ⚠️ Partial    | Can cause TDZ errors             |
| Using spread operator `{...schema.shape}`    | ❌ No         | Breaks recursive inference       |

---

## Key Rules from Colin McDonnell

### Rule 1: Put Object Types at Top-Level

From [#4691](https://github.com/colinhacks/zod/issues/4691):

> "Embedding the object schema declaration inside other APIs can break things."

**Bad:**

```typescript
const Schema = z.union([
  z.object({
    get recursive() {
      return Schema;
    },
  }), // Inside union
  z.string(),
]);
```

**Good:**

```typescript
const RecursiveObject = z.object({
  get recursive() {
    return RecursiveObject;
  },
});
const Schema = z.union([RecursiveObject, z.string()]);
```

### Rule 2: Don't Chain Methods on Recursive Types

From [#4570](https://github.com/colinhacks/zod/issues/4570):

> "Rule of thumb: do not directly chain method calls on the recursive types"

**Bad:**

```typescript
const Category = z
  .object({
    get subcategories() {
      return z.array(Category);
    },
  })
  .meta({ description: "..." }); // .meta() forces eager evaluation
```

**Good:**

```typescript
const _Category = z.object({
  get subcategories() {
    return z.array(_Category);
  },
});
const Category = _Category.meta({ description: "..." });
```

### Rule 3: Avoid Nesting Function Calls in Getters

From [#4264](https://github.com/colinhacks/zod/issues/4264):

> "You'll have a hard time using top-level functions like `z.optional()` or `z.discriminatedUnion()` inside getters. [...] type checking is the enemy of recursive type inference"

**Bad:**

```typescript
get children() {
  return z.optional(z.array(Schema));  // Function call
}
```

**Good:**

```typescript
get children() {
  return z.array(Schema).optional();  // Method chain
}
```

### Rule 4: Use Explicit Type Annotations When Needed

From [#4351](https://github.com/colinhacks/zod/issues/4351):

```typescript
const Activity = z.object({
  name: z.string(),
  get subactivities(): z.ZodNullable<z.ZodArray<typeof Activity>> {
    return z.nullable(z.array(Activity));
  },
});
```

### Rule 5: Use `readonly` in Union Type Annotations

From [#4502](https://github.com/colinhacks/zod/issues/4502):

```typescript
// Without readonly - FAILS
get children(): ZodArray<ZodUnion<[typeof span, typeof tagB]>> { ... }

// With readonly - WORKS
get children(): ZodArray<ZodUnion<readonly [typeof span, typeof tagB]>> { ... }
```

---

## When `z.lazy()` Is Still Required

From [#4881](https://github.com/colinhacks/zod/issues/4881), Colin confirms:

> "Stick with `z.lazy` as you're doing. Getters provided a clean way to 'lazify' object types [...] I could add callback-style APIs to every `z` factory [...] but it would be a big lift for comparatively minimal upside."

**`z.lazy()` is required for:**

1. Recursive types inside `z.record()`
2. Complex recursive unions where getters fail
3. Non-object recursive schemas (arrays, tuples used at top-level)
4. When TypeScript inference completely fails

---

## Working Patterns

### Pattern 1: Extract and Compose (Recommended for Unions)

From [#4691](https://github.com/colinhacks/zod/issues/4691):

```typescript
const ActivitySchemaBase = z.object({
  name: z.string(),
});

const Subactivity = ActivitySchemaBase.extend({
  get subactivities(): z.ZodNullable<z.ZodArray<typeof ActivitySchema>> {
    return z.nullable(z.array(ActivitySchema));
  },
});

const ActivitySchema = z.union([z.string(), Subactivity]);
```

### Pattern 2: Explicit Input/Output Types

From [#4691](https://github.com/colinhacks/zod/issues/4691):

```typescript
type IActivityInput = string | { name: string; subactivities: IActivityInput[] | null };
type IActivityOutput = string | { name: string; subactivities: IActivityOutput[] | null };

const ActivitySchema: z.ZodType<IActivityOutput, IActivityInput> = z.union([
  z.string(),
  z.object({
    name: z.string(),
    get subactivities() {
      return z.nullable(z.array(ActivitySchema));
    },
  }),
]);
```

### Pattern 3: Use `z.lazy()` for Records

From [#4881](https://github.com/colinhacks/zod/issues/4881):

```typescript
const TreeNode = z.object({
  value: z.string(),
  children: z.record(
    z.string(),
    z.lazy(() => TreeNode)
  ),
});
```

### Pattern 4: Avoid `.extend()` TDZ Issues

From [#4691](https://github.com/colinhacks/zod/issues/4691) (kfranqueiro's comment):

**Bad (TDZ error at runtime):**

```typescript
const Recursive = z.object({
  get children() {
    return ArrayOfThings.optional();
  },
});
const ArrayOfThings = z.array(Reusable.extend(Recursive.shape)); // TDZ!
```

**Good:**

```typescript
const ArrayOfThings = z.array(
  Reusable.extend({
    get children() {
      return ArrayOfThings.optional();
    },
  })
);
```

---

## Implications for json-schema-to-zod

### What We Should Do

1. **For recursive object properties**: Use getters with explicit type annotations

   ```typescript
   get subcategories(): z.ZodArray<typeof Category> {
     return z.array(Category);
   }
   ```

2. **For unions containing recursive schemas**: Define member schemas at top-level first, then compose

   ```typescript
   export const CallTask = z.object({ ... });
   export const DoTask = z.object({ ... });
   export const Task = z.union([CallTask, DoTask, ...]);  // Direct refs
   ```

3. **For `z.record()` with recursive values**: Use `z.lazy()`

   ```typescript
   z.record(
     z.string(),
     z.lazy(() => Task)
   );
   ```

4. **For type annotations**: Use correct types with `readonly` where needed

   ```typescript
   z.ZodUnion<readonly [typeof A, typeof B]>; // Not z.ZodTypeAny!
   ```

5. **Avoid chaining methods** on schemas that contain recursive getters

### What We Should NOT Do

1. Don't wrap union members in `z.lazy()` if they're already defined
2. Don't use `z.ZodTypeAny` as a type annotation - it defeats the purpose
3. Don't embed object schema definitions inside union calls
4. Don't use spread operator for recursive schema composition

---

## References

- [#4691](https://github.com/colinhacks/zod/issues/4691) - Recursive union type inference (main issue)
- [#4351](https://github.com/colinhacks/zod/issues/4351) - Recursive record inference
- [#4561](https://github.com/colinhacks/zod/issues/4561) - z.lazy with discriminatedUnion
- [#4570](https://github.com/colinhacks/zod/issues/4570) - Method chaining breaks recursion
- [#4592](https://github.com/colinhacks/zod/issues/4592) - Optional breaking inference
- [#4610](https://github.com/colinhacks/zod/issues/4610) - Complex nesting exceeds TS limits
- [#4625](https://github.com/colinhacks/zod/issues/4625) - `.optional()` breaks mutual recursion
- [#4264](https://github.com/colinhacks/zod/issues/4264) - Discriminated union recursion
- [#4502](https://github.com/colinhacks/zod/issues/4502) - Mapped type circular reference
- [#4783](https://github.com/colinhacks/zod/issues/4783) - discriminatedUnion inference
- [#4881](https://github.com/colinhacks/zod/issues/4881) - Recursive types in z.record()
- [Zod v4 Docs: Recursive Objects](https://zod.dev/api#recursive-objects)
- [Zod v4 Docs: Circularity Errors](https://zod.dev/api#circularity-errors)
