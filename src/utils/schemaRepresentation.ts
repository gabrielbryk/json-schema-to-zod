import { SchemaRepresentation } from "../Types.js";

/**
 * Builder functions for composing SchemaRepresentation objects.
 * These track both the Zod expression and its TypeScript type simultaneously.
 */

// Primitives
export const zodString = (): SchemaRepresentation => ({
  expression: "z.string()",
  type: "z.ZodString",
});

export const zodNumber = (): SchemaRepresentation => ({
  expression: "z.number()",
  type: "z.ZodNumber",
});

export const zodBoolean = (): SchemaRepresentation => ({
  expression: "z.boolean()",
  type: "z.ZodBoolean",
});

export const zodNull = (): SchemaRepresentation => ({
  expression: "z.null()",
  type: "z.ZodNull",
});

export const zodUndefined = (): SchemaRepresentation => ({
  expression: "z.undefined()",
  type: "z.ZodUndefined",
});

export const zodAny = (): SchemaRepresentation => ({
  expression: "z.any()",
  type: "z.ZodAny",
});

export const zodUnknown = (): SchemaRepresentation => ({
  expression: "z.unknown()",
  type: "z.ZodUnknown",
});

export const zodNever = (): SchemaRepresentation => ({
  expression: "z.never()",
  type: "z.ZodNever",
});

export const zodBigInt = (): SchemaRepresentation => ({
  expression: "z.bigint()",
  type: "z.ZodBigInt",
});

export const zodDate = (): SchemaRepresentation => ({
  expression: "z.date()",
  type: "z.ZodDate",
});

// Reference to another schema (potentially recursive)
export const zodRef = (schemaName: string): SchemaRepresentation => ({
  expression: schemaName,
  type: `typeof ${schemaName}`,
});

// Lazy wrapper for recursive references
export const zodLazy = (schemaName: string): SchemaRepresentation => ({
  expression: `z.lazy(() => ${schemaName})`,
  type: `z.ZodLazy<typeof ${schemaName}>`,
});

// Typed lazy wrapper when we know the inner type
export const zodLazyTyped = (schemaName: string, innerType: string): SchemaRepresentation => ({
  expression: `z.lazy<${innerType}>(() => ${schemaName})`,
  type: `z.ZodLazy<${innerType}>`,
});

// Wrappers that transform inner representations
export const zodArray = (inner: SchemaRepresentation): SchemaRepresentation => ({
  expression: `z.array(${inner.expression})`,
  type: `z.ZodArray<${inner.type}>`,
});

export const zodOptional = (inner: SchemaRepresentation): SchemaRepresentation => ({
  expression: `${inner.expression}.optional()`,
  type: `z.ZodOptional<${inner.type}>`,
});

export const zodNullable = (inner: SchemaRepresentation): SchemaRepresentation => ({
  expression: `${inner.expression}.nullable()`,
  type: `z.ZodNullable<${inner.type}>`,
});

export const zodNullableWrapper = (inner: SchemaRepresentation): SchemaRepresentation => ({
  expression: `z.nullable(${inner.expression})`,
  type: `z.ZodNullable<${inner.type}>`,
});

export const zodDefault = (
  inner: SchemaRepresentation,
  defaultValue: string
): SchemaRepresentation => ({
  expression: `${inner.expression}.default(${defaultValue})`,
  type: `z.ZodDefault<${inner.type}>`,
});

export const zodReadonly = (inner: SchemaRepresentation): SchemaRepresentation => ({
  expression: `${inner.expression}.readonly()`,
  type: `z.ZodReadonly<${inner.type}>`,
});

// Describe doesn't change the type
export const zodDescribe = (
  inner: SchemaRepresentation,
  description: string
): SchemaRepresentation => ({
  expression: `${inner.expression}.describe(${JSON.stringify(description)})`,
  type: inner.type,
});

// Meta doesn't change the type
export const zodMeta = (inner: SchemaRepresentation, meta: string): SchemaRepresentation => ({
  expression: `${inner.expression}.meta(${meta})`,
  type: inner.type,
});

// Literals
export const zodLiteral = (value: string): SchemaRepresentation => ({
  expression: `z.literal(${value})`,
  type: `z.ZodLiteral<${value}>`,
});

// Enums
export const zodEnum = (values: string[]): SchemaRepresentation => {
  const valuesStr = `[${values.join(", ")}]`;
  return {
    expression: `z.enum(${valuesStr})`,
    type: `z.ZodEnum<${valuesStr}>`,
  };
};

// Union
export const zodUnion = (options: SchemaRepresentation[]): SchemaRepresentation => {
  const exprs = options.map((o) => o.expression).join(", ");
  const types = options.map((o) => o.type).join(", ");
  return {
    expression: `z.union([${exprs}])`,
    type: `z.ZodUnion<[${types}]>`,
  };
};

// Discriminated union
export const zodDiscriminatedUnion = (
  discriminator: string,
  options: SchemaRepresentation[]
): SchemaRepresentation => {
  const exprs = options.map((o) => o.expression).join(", ");
  const types = options.map((o) => o.type).join(", ");
  return {
    expression: `z.discriminatedUnion(${JSON.stringify(discriminator)}, [${exprs}])`,
    type: `z.ZodDiscriminatedUnion<${JSON.stringify(discriminator)}, [${types}]>`,
  };
};

// Intersection
export const zodIntersection = (
  left: SchemaRepresentation,
  right: SchemaRepresentation
): SchemaRepresentation => ({
  expression: `z.intersection(${left.expression}, ${right.expression})`,
  type: `z.ZodIntersection<${left.type}, ${right.type}>`,
});

// And method (for chaining)
export const zodAnd = (
  base: SchemaRepresentation,
  other: SchemaRepresentation
): SchemaRepresentation => ({
  expression: `${base.expression}.and(${other.expression})`,
  type: `z.ZodIntersection<${base.type}, ${other.type}>`,
});

// Tuple
export const zodTuple = (items: SchemaRepresentation[]): SchemaRepresentation => {
  const exprs = items.map((i) => i.expression).join(", ");
  const types = items.map((i) => i.type).join(", ");
  return {
    expression: `z.tuple([${exprs}])`,
    type: `z.ZodTuple<[${types}]>`,
  };
};

// Record
export const zodRecord = (
  key: SchemaRepresentation,
  value: SchemaRepresentation
): SchemaRepresentation => ({
  expression: `z.record(${key.expression}, ${value.expression})`,
  type: `z.ZodRecord<${key.type}, ${value.type}>`,
});

// Map
export const zodMap = (
  key: SchemaRepresentation,
  value: SchemaRepresentation
): SchemaRepresentation => ({
  expression: `z.map(${key.expression}, ${value.expression})`,
  type: `z.ZodMap<${key.type}, ${value.type}>`,
});

// Set
export const zodSet = (value: SchemaRepresentation): SchemaRepresentation => ({
  expression: `z.set(${value.expression})`,
  type: `z.ZodSet<${value.type}>`,
});

// Object - builds from shape entries
export const zodObject = (
  shape: Array<{
    key: string;
    rep: SchemaRepresentation;
    isGetter?: boolean;
  }>
): SchemaRepresentation => {
  const exprParts: string[] = [];
  const typeParts: string[] = [];

  for (const { key, rep, isGetter } of shape) {
    const quotedKey = JSON.stringify(key);

    if (isGetter) {
      // Getter syntax with explicit type annotation
      exprParts.push(`get ${quotedKey}(): ${rep.type} { return ${rep.expression} }`);
    } else {
      exprParts.push(`${quotedKey}: ${rep.expression}`);
    }

    typeParts.push(`${quotedKey}: ${rep.type}`);
  }

  return {
    expression: `z.object({ ${exprParts.join(", ")} })`,
    type: `z.ZodObject<{ ${typeParts.join(", ")} }>`,
  };
};

// Strict object
export const zodStrictObject = (
  shape: Array<{
    key: string;
    rep: SchemaRepresentation;
    isGetter?: boolean;
  }>
): SchemaRepresentation => {
  const base = zodObject(shape);
  return {
    expression: base.expression.replace(/^z\.object\(/, "z.strictObject("),
    type: base.type, // strict() doesn't change the type signature
  };
};

// Catchall
export const zodCatchall = (
  base: SchemaRepresentation,
  catchallSchema: SchemaRepresentation
): SchemaRepresentation => ({
  expression: `${base.expression}.catchall(${catchallSchema.expression})`,
  type: base.type, // catchall doesn't change the base type for inference purposes
});

// SuperRefine - doesn't change the type
export const zodSuperRefine = (
  base: SchemaRepresentation,
  refineFn: string
): SchemaRepresentation => ({
  expression: `${base.expression}.superRefine(${refineFn})`,
  type: base.type,
});

// Refine - doesn't change the type
export const zodRefine = (base: SchemaRepresentation, refineFn: string): SchemaRepresentation => ({
  expression: `${base.expression}.refine(${refineFn})`,
  type: base.type,
});

// Transform - Zod v4 uses ZodPipe<Base, ZodTransform<Output, Input>>
// Since we don't know the output type at codegen time, use ZodTypeAny for simplicity
export const zodTransform = (
  base: SchemaRepresentation,
  transformFn: string
): SchemaRepresentation => ({
  expression: `${base.expression}.transform(${transformFn})`,
  type: `z.ZodPipe<${base.type}, z.ZodTypeAny>`,
});

// Pipe
export const zodPipe = (
  first: SchemaRepresentation,
  second: SchemaRepresentation
): SchemaRepresentation => ({
  expression: `${first.expression}.pipe(${second.expression})`,
  type: `z.ZodPipeline<${first.type}, ${second.type}>`,
});

// Coerce wrappers
export const zodCoerceString = (): SchemaRepresentation => ({
  expression: "z.coerce.string()",
  type: "z.ZodString",
});

export const zodCoerceNumber = (): SchemaRepresentation => ({
  expression: "z.coerce.number()",
  type: "z.ZodNumber",
});

export const zodCoerceBoolean = (): SchemaRepresentation => ({
  expression: "z.coerce.boolean()",
  type: "z.ZodBoolean",
});

export const zodCoerceDate = (): SchemaRepresentation => ({
  expression: "z.coerce.date()",
  type: "z.ZodDate",
});

// Generic method chaining - for any method that doesn't change type
export const zodChain = (base: SchemaRepresentation, method: string): SchemaRepresentation => ({
  expression: `${base.expression}.${method}`,
  type: base.type,
});

// Create a raw representation from expression string (for backward compatibility)
// This infers the type from the expression using pattern matching
export const fromExpression = (expression: string): SchemaRepresentation => ({
  expression,
  type: inferTypeFromExpression(expression),
});

/**
 * Infers the TypeScript type from a Zod expression string.
 * This is used for backward compatibility during migration.
 */
export const inferTypeFromExpression = (expr: string): string => {
  const applyOptionality = (type: string, methods: string): string => {
    if (methods.includes(".exactOptional()")) {
      type = `z.ZodExactOptional<${type}>`;
    } else if (methods.includes(".optional()")) {
      type = `z.ZodOptional<${type}>`;
    }
    if (methods.includes(".nullable()")) {
      type = `z.ZodNullable<${type}>`;
    }
    return type;
  };

  // Handle z.lazy with explicit type (possibly with method chains like .optional())
  const lazyTypedMatch = expr.match(
    /^z\.lazy<([^>]+)>\(\s*\(\)\s*=>\s*([A-Za-z0-9_.$]+)\s*\)(\.[a-z]+\(\))*$/
  );
  if (lazyTypedMatch) {
    let type = `z.ZodLazy<${lazyTypedMatch[1]}>`;
    const methods = lazyTypedMatch[3] || "";
    return applyOptionality(type, methods);
  }

  // Handle z.lazy without explicit type (possibly with method chains like .optional())
  const lazyMatch = expr.match(/^z\.lazy\(\s*\(\)\s*=>\s*([A-Za-z0-9_.$]+)\s*\)(\.[a-z]+\(\))*$/);
  if (lazyMatch) {
    let type = `z.ZodLazy<typeof ${lazyMatch[1]}>`;
    const methods = lazyMatch[2] || "";
    return applyOptionality(type, methods);
  }

  // Handle .and() method chains - this creates an intersection type
  // Need to find the .and( that's not inside nested parentheses
  const andIndex = findTopLevelMethod(expr, ".and(");
  if (andIndex !== -1) {
    const baseExpr = expr.substring(0, andIndex);
    // Extract the argument to .and() - find the matching closing paren
    const argsStart = andIndex + 5; // length of ".and("
    const argsEnd = findMatchingParen(expr, argsStart - 1);
    if (argsEnd !== -1) {
      const andArg = expr.substring(argsStart, argsEnd);
      const remainder = expr.substring(argsEnd + 1);

      const baseType = inferTypeFromExpression(baseExpr);
      const andType = inferTypeFromExpression(andArg);
      let type = `z.ZodIntersection<${baseType}, ${andType}>`;

      // Handle trailing methods
      return applyOptionality(type, remainder);
    }
  }

  // Handle z.intersection(X, Y)
  if (expr.startsWith("z.intersection(")) {
    const argsStart = 15; // length of "z.intersection("
    const argsEnd = findMatchingParen(expr, argsStart - 1);
    if (argsEnd !== -1) {
      const args = expr.substring(argsStart, argsEnd);
      // Split on comma at top level (not inside parentheses)
      const commaIndex = findTopLevelComma(args);
      if (commaIndex !== -1) {
        const leftExpr = args.substring(0, commaIndex).trim();
        const rightExpr = args.substring(commaIndex + 1).trim();
        const leftType = inferTypeFromExpression(leftExpr);
        const rightType = inferTypeFromExpression(rightExpr);
        return `z.ZodIntersection<${leftType}, ${rightType}>`;
      }
    }
  }

  // Handle z.object({...})/z.strictObject({...})/z.looseObject({...})
  const objectPrefixes = ["z.object(", "z.strictObject(", "z.looseObject("];
  const objectPrefix = objectPrefixes.find((prefix) => expr.startsWith(prefix));
  if (objectPrefix) {
    // Find the end of z.object({...})
    const argsStart = objectPrefix.length; // length of prefix
    const argsEnd = findMatchingParen(expr, argsStart - 1);
    if (argsEnd !== -1) {
      const remainder = expr.substring(argsEnd + 1);
      // Base type for any z.object
      let type = "z.ZodObject<Record<string, z.ZodTypeAny>>";

      // Handle method chains after z.object({...})
      return applyOptionality(type, remainder);
    }
  }

  // Handle z.record(K, V)
  if (expr.startsWith("z.record(")) {
    const argsStart = 9; // length of "z.record("
    const argsEnd = findMatchingParen(expr, argsStart - 1);
    if (argsEnd !== -1) {
      const args = expr.substring(argsStart, argsEnd);
      const commaIndex = findTopLevelComma(args);
      if (commaIndex !== -1) {
        const keyExpr = args.substring(0, commaIndex).trim();
        const valueExpr = args.substring(commaIndex + 1).trim();
        const keyType = inferTypeFromExpression(keyExpr);
        const valueType = inferTypeFromExpression(valueExpr);
        return `z.ZodRecord<${keyType}, ${valueType}>`;
      }
    }
  }

  // Primitives - MUST come before refMatch which would incorrectly match z.string() as "typeof z"
  if (expr === "z.string()" || expr.startsWith("z.string().")) return "z.ZodString";
  if (expr === "z.number()" || expr.startsWith("z.number().")) return "z.ZodNumber";
  if (expr === "z.boolean()" || expr.startsWith("z.boolean().")) return "z.ZodBoolean";
  if (expr === "z.null()") return "z.ZodNull";
  if (expr === "z.undefined()") return "z.ZodUndefined";
  if (expr === "z.any()") return "z.ZodAny";
  if (expr === "z.unknown()") return "z.ZodUnknown";
  if (expr === "z.never()") return "z.ZodNever";
  if (expr.startsWith("z.literal(")) return "z.ZodLiteral<unknown>";
  if (expr.startsWith("z.enum(")) return "z.ZodEnum<[string, ...string[]]>";

  // Handle simple schema reference (possibly with .optional())
  const refMatch = expr.match(/^([A-Za-z_$][A-Za-z0-9_$]*)(\.[a-z]+\(\))*$/);
  if (refMatch) {
    const baseName = refMatch[1];
    const methods = refMatch[2] || "";

    let type = `typeof ${baseName}`;
    return applyOptionality(type, methods);
  }

  // Handle z.array(X)
  const arrayMatch = expr.match(/^z\.array\((.+)\)(\.[a-z]+\(\))*$/);
  if (arrayMatch) {
    const innerType = inferTypeFromExpression(arrayMatch[1]);
    let type = `z.ZodArray<${innerType}>`;

    const methods = arrayMatch[2] || "";
    return applyOptionality(type, methods);
  }

  // Handle z.nullable(X)
  const nullableMatch = expr.match(/^z\.nullable\((.+)\)$/);
  if (nullableMatch) {
    const innerType = inferTypeFromExpression(nullableMatch[1]);
    return `z.ZodNullable<${innerType}>`;
  }

  // Handle z.union([...]) - Zod v4 uses readonly arrays for union options
  // Also handle method chains like .optional(), .nullable()
  if (expr.startsWith("z.union([")) {
    const bracketStart = 8; // position of [
    const bracketEnd = findMatchingParen(expr, bracketStart); // position of ]
    if (bracketEnd !== -1) {
      const arrayContent = expr.substring(bracketStart + 1, bracketEnd); // inside the []
      const memberTypes = parseTopLevelArrayElements(arrayContent);
      const types = memberTypes.map((m) => inferTypeFromExpression(m.trim()));
      let baseType = `z.ZodUnion<readonly [${types.join(", ")}]>`;

      const remainder = expr.substring(bracketEnd + 2); // skip ] and )
      return applyOptionality(baseType, remainder);
    }
  }

  // Handle z.discriminatedUnion(...) - Zod v4 uses readonly arrays
  if (expr.startsWith("z.discriminatedUnion(")) {
    let baseType = "z.ZodDiscriminatedUnion<readonly z.ZodTypeAny[], string>";
    if (expr.endsWith(".optional()")) {
      baseType = `z.ZodOptional<${baseType}>`;
    }
    if (expr.endsWith(".nullable()")) {
      baseType = `z.ZodNullable<${baseType}>`;
    }
    return baseType;
  }

  // Fallback
  return "z.ZodTypeAny";
};

/**
 * Find a method call at the top level (not inside nested parentheses)
 */
const findTopLevelMethod = (expr: string, method: string): number => {
  let depth = 0;
  for (let i = 0; i < expr.length - method.length; i++) {
    if (expr[i] === "(" || expr[i] === "[" || expr[i] === "{") {
      depth++;
    } else if (expr[i] === ")" || expr[i] === "]" || expr[i] === "}") {
      depth--;
    } else if (depth === 0 && expr.substring(i, i + method.length) === method) {
      return i;
    }
  }
  return -1;
};

/**
 * Find the matching closing parenthesis
 */
const findMatchingParen = (expr: string, openIndex: number): number => {
  let depth = 0;
  for (let i = openIndex; i < expr.length; i++) {
    if (expr[i] === "(" || expr[i] === "[" || expr[i] === "{") {
      depth++;
    } else if (expr[i] === ")" || expr[i] === "]" || expr[i] === "}") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
};

/**
 * Find a comma at the top level (not inside nested parentheses)
 */
const findTopLevelComma = (expr: string): number => {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === "(" || expr[i] === "[" || expr[i] === "{") {
      depth++;
    } else if (expr[i] === ")" || expr[i] === "]" || expr[i] === "}") {
      depth--;
    } else if (depth === 0 && expr[i] === ",") {
      return i;
    }
  }
  return -1;
};

/**
 * Parse array elements at the top level, respecting nested brackets/parens
 */
const parseTopLevelArrayElements = (content: string): string[] => {
  const elements: string[] = [];
  let depth = 0;
  let current = "";

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === "(" || char === "[" || char === "{") {
      depth++;
      current += char;
    } else if (char === ")" || char === "]" || char === "}") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      if (current.trim()) {
        elements.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    elements.push(current.trim());
  }

  return elements;
};

/**
 * Check if an expression contains a reference to a recursive schema.
 */
export const containsRecursiveRef = (
  expr: string,
  cycleRefNames: Set<string> | undefined
): boolean => {
  if (!cycleRefNames || cycleRefNames.size === 0) return false;

  for (const refName of cycleRefNames) {
    // Check for direct reference or reference within z.lazy, z.array, etc.
    const pattern = new RegExp(`\\b${refName}\\b`);
    if (pattern.test(expr)) {
      return true;
    }
  }

  return false;
};

/**
 * Determines if a property should use getter syntax based on its representation
 * and the current schema context.
 */
export const shouldUseGetter = (
  rep: SchemaRepresentation,
  currentSchemaName: string | undefined,
  cycleRefNames: Set<string> | undefined,
  cycleComponentByName: Map<string, number> | undefined
): boolean => {
  if (!currentSchemaName) return false;

  // Check if the expression directly references the current schema (self-recursion)
  if (rep.expression === currentSchemaName) return true;

  // Check if expression contains a reference to a cycle member in the same SCC
  if (!cycleRefNames || cycleRefNames.size === 0) return false;

  const currentComponent = cycleComponentByName?.get(currentSchemaName);
  if (currentComponent === undefined) return false;

  for (const refName of cycleRefNames) {
    const pattern = new RegExp(`\\b${refName}\\b`);
    if (pattern.test(rep.expression)) {
      const refComponent = cycleComponentByName?.get(refName);
      if (refComponent === currentComponent) {
        return true;
      }
    }
  }

  return false;
};
