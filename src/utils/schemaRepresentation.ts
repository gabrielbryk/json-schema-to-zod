import { SchemaNode, SchemaRepresentation, Serializable } from "../Types.js";

/**
 * Builder functions for composing SchemaRepresentation objects.
 * These track both the Zod expression and its TypeScript type simultaneously.
 */

const createSchemaRepresentation = (node: SchemaNode): SchemaRepresentation => ({
  node,
  expression: emitExpression(node),
  type: emitType(node),
});

export const fromNode = (node: SchemaNode): SchemaRepresentation =>
  createSchemaRepresentation(node);

const ensureNode = (rep: SchemaRepresentation): SchemaNode => {
  if (!rep.node) {
    throw new Error("SchemaRepresentation node missing (no-fallback mode).");
  }
  return rep.node;
};

const parseJsonLiteral = (value: string): { ok: true; value: Serializable } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(value) as Serializable };
  } catch {
    return { ok: false };
  }
};

// Primitives
export const zodString = (): SchemaRepresentation => createSchemaRepresentation({ kind: "string" });

export const zodNumber = (): SchemaRepresentation => createSchemaRepresentation({ kind: "number" });

export const zodBoolean = (): SchemaRepresentation =>
  createSchemaRepresentation({ kind: "boolean" });

export const zodNull = (): SchemaRepresentation => createSchemaRepresentation({ kind: "null" });

export const zodUndefined = (): SchemaRepresentation =>
  createSchemaRepresentation({ kind: "undefined" });

export const zodAny = (): SchemaRepresentation => createSchemaRepresentation({ kind: "any" });

export const zodUnknown = (): SchemaRepresentation =>
  createSchemaRepresentation({ kind: "unknown" });

export const zodNever = (): SchemaRepresentation => createSchemaRepresentation({ kind: "never" });

export const zodBigInt = (): SchemaRepresentation => createSchemaRepresentation({ kind: "bigint" });

export const zodDate = (): SchemaRepresentation => createSchemaRepresentation({ kind: "date" });

// Reference to another schema (potentially recursive)
export const zodRef = (schemaName: string): SchemaRepresentation =>
  createSchemaRepresentation({ kind: "ref", name: schemaName });

// Lazy wrapper for recursive references
export const zodLazy = (schemaName: string): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "lazy",
    inner: { kind: "ref", name: schemaName },
  });

// Typed lazy wrapper when we know the inner type
export const zodLazyTyped = (schemaName: string, innerType: string): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "lazy",
    inner: { kind: "ref", name: schemaName },
    typeArg: innerType,
  });

// Wrappers that transform inner representations
export const zodArray = (inner: SchemaRepresentation): SchemaRepresentation =>
  createSchemaRepresentation({ kind: "array", inner: ensureNode(inner) });

export const zodOptional = (inner: SchemaRepresentation): SchemaRepresentation =>
  createSchemaRepresentation({ kind: "optional", inner: ensureNode(inner) });

export const zodExactOptional = (inner: SchemaRepresentation): SchemaRepresentation =>
  createSchemaRepresentation({ kind: "exactOptional", inner: ensureNode(inner) });

export const zodNullable = (inner: SchemaRepresentation): SchemaRepresentation =>
  createSchemaRepresentation({ kind: "nullable", inner: ensureNode(inner) });

export const zodNullableWrapper = (inner: SchemaRepresentation): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "nullable",
    inner: ensureNode(inner),
    style: "wrapper",
  });

export const zodDefault = (
  inner: SchemaRepresentation,
  defaultValue: string
): SchemaRepresentation => {
  const parsedDefault = parseJsonLiteral(defaultValue);
  if (!parsedDefault.ok) {
    throw new Error("Invalid default value for zodDefault (no-fallback mode).");
  }

  return createSchemaRepresentation({
    kind: "default",
    inner: ensureNode(inner),
    value: parsedDefault.value,
  });
};

export const zodReadonly = (inner: SchemaRepresentation): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "readonly",
    inner: ensureNode(inner),
  });

// Describe doesn't change the type
export const zodDescribe = (
  inner: SchemaRepresentation,
  description: string
): SchemaRepresentation => ({
  expression: `${inner.expression}.describe(${JSON.stringify(description)})`,
  type: inner.type,
  node: {
    kind: "describe",
    inner: ensureNode(inner),
    description,
  },
});

// Meta doesn't change the type
export const zodMeta = (inner: SchemaRepresentation, meta: string): SchemaRepresentation => ({
  expression: `${inner.expression}.meta(${meta})`,
  type: inner.type,
  node: {
    kind: "meta",
    inner: ensureNode(inner),
    meta,
  },
});

// Literals
export const zodLiteral = (value: Serializable): SchemaRepresentation =>
  createSchemaRepresentation({ kind: "literal", value });

// Enums
export const zodEnum = (
  values: Serializable[],
  options?: { typeStyle?: "array" | "object" }
): SchemaRepresentation =>
  createSchemaRepresentation({ kind: "enum", values, typeStyle: options?.typeStyle });

// Union
export const zodUnion = (
  options: SchemaRepresentation[],
  optionsMeta?: { readonlyType?: boolean }
): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "union",
    options: options.map((o) => ensureNode(o)),
    readonly: optionsMeta?.readonlyType,
  });

// Discriminated union
export const zodDiscriminatedUnion = (
  discriminator: string,
  options: SchemaRepresentation[],
  optionsMeta?: { readonlyType?: boolean }
): SchemaRepresentation => {
  return createSchemaRepresentation({
    kind: "discriminatedUnion",
    discriminator,
    options: options.map((o) => ensureNode(o)),
    readonly: optionsMeta?.readonlyType,
  });
};

export const zodXor = (
  options: SchemaRepresentation[],
  optionsMeta?: { readonlyType?: boolean }
): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "xor",
    options: options.map((o) => ensureNode(o)),
    readonly: optionsMeta?.readonlyType,
  });

// Intersection
export const zodIntersection = (
  left: SchemaRepresentation,
  right: SchemaRepresentation
): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "intersection",
    left: ensureNode(left),
    right: ensureNode(right),
  });

// And method (for chaining)
export const zodAnd = (
  base: SchemaRepresentation,
  other: SchemaRepresentation
): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "and",
    base: ensureNode(base),
    other: ensureNode(other),
  });

// Tuple
export const zodTuple = (
  items: SchemaRepresentation[],
  rest?: SchemaRepresentation | null
): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "tuple",
    items: items.map((i) => ensureNode(i)),
    rest: rest === undefined ? undefined : rest === null ? null : ensureNode(rest),
  });

// Record
export const zodRecord = (
  key: SchemaRepresentation,
  value: SchemaRepresentation,
  options?: { mode?: "default" | "loose" }
): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "record",
    key: ensureNode(key),
    value: ensureNode(value),
    mode: options?.mode,
  });

export const zodLooseRecord = (
  key: SchemaRepresentation,
  value: SchemaRepresentation
): SchemaRepresentation => zodRecord(key, value, { mode: "loose" });

// Map
export const zodMap = (
  key: SchemaRepresentation,
  value: SchemaRepresentation
): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "map",
    key: ensureNode(key),
    value: ensureNode(value),
  });

// Set
export const zodSet = (value: SchemaRepresentation): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "set",
    value: ensureNode(value),
  });

// Object - builds from shape entries
export const zodObject = (
  shape: Array<{
    key: string;
    rep: SchemaRepresentation;
    isGetter?: boolean;
    jsdoc?: string;
  }>
): SchemaRepresentation => {
  return createSchemaRepresentation({
    kind: "object",
    shape: shape.map(({ key, rep, isGetter, jsdoc }) => ({
      key,
      value: ensureNode(rep),
      isGetter,
      jsdoc,
    })),
  });
};

// Strict object
export const zodStrictObject = (
  shape: Array<{
    key: string;
    rep: SchemaRepresentation;
    isGetter?: boolean;
    jsdoc?: string;
  }>
): SchemaRepresentation => {
  return createSchemaRepresentation({
    kind: "object",
    mode: "strict",
    shape: shape.map(({ key, rep, isGetter, jsdoc }) => ({
      key,
      value: ensureNode(rep),
      isGetter,
      jsdoc,
    })),
  });
};

export const zodLooseObject = (
  shape: Array<{
    key: string;
    rep: SchemaRepresentation;
    isGetter?: boolean;
    jsdoc?: string;
  }>
): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "object",
    mode: "loose",
    shape: shape.map(({ key, rep, isGetter, jsdoc }) => ({
      key,
      value: ensureNode(rep),
      isGetter,
      jsdoc,
    })),
  });

// Catchall
export const zodCatchall = (
  base: SchemaRepresentation,
  catchallSchema: SchemaRepresentation
): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "catchall",
    base: ensureNode(base),
    catchall: ensureNode(catchallSchema),
  });

// SuperRefine - doesn't change the type
export const zodSuperRefine = (
  base: SchemaRepresentation,
  refineFn: string
): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "superRefine",
    base: ensureNode(base),
    refine: refineFn,
  });

// Refine - doesn't change the type
export const zodRefine = (base: SchemaRepresentation, refineFn: string): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "refine",
    base: ensureNode(base),
    refine: refineFn,
  });

// Transform - Zod v4 uses ZodPipe<Base, ZodTransform<Output, Input>>
// Since we don't know the output type at codegen time, use ZodTypeAny for simplicity
export const zodTransform = (
  base: SchemaRepresentation,
  transformFn: string
): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "transform",
    base: ensureNode(base),
    transform: transformFn,
  });

// Pipe
export const zodPipe = (
  first: SchemaRepresentation,
  second: SchemaRepresentation,
  params?: string
): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "pipe",
    first: ensureNode(first),
    second: ensureNode(second),
    params,
  });

// Coerce wrappers
export const zodCoerceString = (): SchemaRepresentation =>
  createSchemaRepresentation({ kind: "coerce", to: "string" });

export const zodCoerceNumber = (): SchemaRepresentation =>
  createSchemaRepresentation({ kind: "coerce", to: "number" });

export const zodCoerceBoolean = (): SchemaRepresentation =>
  createSchemaRepresentation({ kind: "coerce", to: "boolean" });

export const zodCoerceDate = (): SchemaRepresentation =>
  createSchemaRepresentation({ kind: "coerce", to: "date" });

export const zodCall = (callee: string, args: string[], type: string): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "call",
    callee,
    args,
    type,
  });

// Generic method chaining - for any method that doesn't change type
export const zodChain = (base: SchemaRepresentation, method: string): SchemaRepresentation =>
  createSchemaRepresentation({
    kind: "chain",
    base: ensureNode(base),
    method,
  });

export const emitExpression = (node: SchemaNode): string => {
  switch (node.kind) {
    case "string":
      return "z.string()";
    case "number":
      return "z.number()";
    case "boolean":
      return "z.boolean()";
    case "null":
      return "z.null()";
    case "undefined":
      return "z.undefined()";
    case "any":
      return "z.any()";
    case "unknown":
      return "z.unknown()";
    case "never":
      return "z.never()";
    case "bigint":
      return "z.bigint()";
    case "date":
      return "z.date()";
    case "literal":
      return `z.literal(${JSON.stringify(node.value)})`;
    case "enum":
      return `z.enum([${node.values.map((value) => JSON.stringify(value)).join(", ")}])`;
    case "ref":
      return node.name;
    case "lazy": {
      const inner = emitExpression(node.inner);
      if (node.typeArg) {
        return `z.lazy<${node.typeArg}>(() => ${inner})`;
      }
      return `z.lazy(() => ${inner})`;
    }
    case "array":
      return `z.array(${emitExpression(node.inner)})`;
    case "optional":
      return `${emitExpression(node.inner)}.optional()`;
    case "exactOptional":
      return `${emitExpression(node.inner)}.exactOptional()`;
    case "nullable": {
      const inner = emitExpression(node.inner);
      return node.style === "wrapper" ? `z.nullable(${inner})` : `${inner}.nullable()`;
    }
    case "default":
      return `${emitExpression(node.inner)}.default(${JSON.stringify(node.value)})`;
    case "readonly":
      return `${emitExpression(node.inner)}.readonly()`;
    case "describe":
      return `${emitExpression(node.inner)}.describe(${JSON.stringify(node.description)})`;
    case "meta":
      return `${emitExpression(node.inner)}.meta(${node.meta})`;
    case "union":
      return `z.union([${node.options.map(emitExpression).join(", ")}])`;
    case "discriminatedUnion":
      return `z.discriminatedUnion(${JSON.stringify(node.discriminator)}, [${node.options
        .map(emitExpression)
        .join(", ")}])`;
    case "xor":
      return `z.xor([${node.options.map(emitExpression).join(", ")}])`;
    case "intersection":
      return `z.intersection(${emitExpression(node.left)}, ${emitExpression(node.right)})`;
    case "and":
      return `${emitExpression(node.base)}.and(${emitExpression(node.other)})`;
    case "tuple":
      return node.rest === undefined || node.rest === null
        ? `z.tuple([${node.items.map(emitExpression).join(", ")}])`
        : `z.tuple([${node.items.map(emitExpression).join(", ")}]).rest(${emitExpression(
            node.rest
          )})`;
    case "record":
      return `${node.mode === "loose" ? "z.looseRecord" : "z.record"}(${emitExpression(
        node.key
      )}, ${emitExpression(node.value)})`;
    case "map":
      return `z.map(${emitExpression(node.key)}, ${emitExpression(node.value)})`;
    case "set":
      return `z.set(${emitExpression(node.value)})`;
    case "object": {
      const exprParts = node.shape.map(({ key, value, isGetter, jsdoc }) => {
        const quotedKey = JSON.stringify(key);
        const prefix = jsdoc ? `\n${jsdoc}` : "";
        if (isGetter) {
          return `${prefix}get ${quotedKey}(): ${emitType(value)} { return ${emitExpression(value)} }`;
        }
        return `${prefix}${quotedKey}: ${emitExpression(value)}`;
      });
      const mode = node.mode ?? "default";
      const prefix =
        mode === "strict" ? "z.strictObject" : mode === "loose" ? "z.looseObject" : "z.object";
      return `${prefix}({ ${exprParts.join(", ")} })`;
    }
    case "catchall":
      return `${emitExpression(node.base)}.catchall(${emitExpression(node.catchall)})`;
    case "superRefine":
      return `${emitExpression(node.base)}.superRefine(${node.refine})`;
    case "refine":
      return `${emitExpression(node.base)}.refine(${node.refine})`;
    case "transform":
      return `${emitExpression(node.base)}.transform(${node.transform})`;
    case "pipe":
      return `${emitExpression(node.first)}.pipe(${emitExpression(node.second)}${node.params ?? ""})`;
    case "coerce":
      return `z.coerce.${node.to}()`;
    case "call":
      return `${node.callee}(${node.args.join(", ")})`;
    case "chain":
      return `${emitExpression(node.base)}.${node.method}`;
  }
};

export const emitType = (node: SchemaNode): string => {
  switch (node.kind) {
    case "string":
      return "z.ZodString";
    case "number":
      return "z.ZodNumber";
    case "boolean":
      return "z.ZodBoolean";
    case "null":
      return "z.ZodNull";
    case "undefined":
      return "z.ZodUndefined";
    case "any":
      return "z.ZodAny";
    case "unknown":
      return "z.ZodUnknown";
    case "never":
      return "z.ZodNever";
    case "bigint":
      return "z.ZodBigInt";
    case "date":
      return "z.ZodDate";
    case "literal":
      return `z.ZodLiteral<${JSON.stringify(node.value)}>`;
    case "enum":
      if (node.typeStyle === "object") {
        const entries = node.values
          .map((value) => `${JSON.stringify(value)}: ${JSON.stringify(value)}`)
          .join("; ");
        return `z.ZodEnum<{ ${entries} }>`;
      }
      return `z.ZodEnum<[${node.values.map((value) => JSON.stringify(value)).join(", ")}]>`;
    case "ref":
      return `typeof ${node.name}`;
    case "lazy":
      return node.typeArg ? `z.ZodLazy<${node.typeArg}>` : `z.ZodLazy<${emitType(node.inner)}>`;
    case "array":
      return `z.ZodArray<${emitType(node.inner)}>`;
    case "optional":
      return `z.ZodOptional<${emitType(node.inner)}>`;
    case "exactOptional":
      return `z.ZodExactOptional<${emitType(node.inner)}>`;
    case "nullable":
      return `z.ZodNullable<${emitType(node.inner)}>`;
    case "default":
      return `z.ZodDefault<${emitType(node.inner)}>`;
    case "readonly":
      return `z.ZodReadonly<${emitType(node.inner)}>`;
    case "describe":
    case "meta":
      return emitType(node.inner);
    case "union":
      return `z.ZodUnion<${node.readonly ? "readonly " : ""}[${node.options
        .map(emitType)
        .join(", ")}]>`;
    case "discriminatedUnion":
      return `z.ZodDiscriminatedUnion<${JSON.stringify(node.discriminator)}, ${node.readonly ? "readonly " : ""}[${node.options
        .map(emitType)
        .join(", ")}]>`;
    case "xor":
      return `z.ZodXor<${node.readonly ? "readonly " : ""}[${node.options.map(emitType).join(", ")}]>`;
    case "intersection":
      return `z.ZodIntersection<${emitType(node.left)}, ${emitType(node.right)}>`;
    case "and":
      return `z.ZodIntersection<${emitType(node.base)}, ${emitType(node.other)}>`;
    case "tuple":
      if (node.rest === null) {
        return `z.ZodTuple<[${node.items.map(emitType).join(", ")}], null>`;
      }
      if (node.rest === undefined) {
        return `z.ZodTuple<[${node.items.map(emitType).join(", ")}]>`;
      }
      return `z.ZodTuple<[${node.items.map(emitType).join(", ")}], ${emitType(node.rest)}>`;
    case "record":
      return `z.ZodRecord<${emitType(node.key)}, ${emitType(node.value)}>`;
    case "map":
      return `z.ZodMap<${emitType(node.key)}, ${emitType(node.value)}>`;
    case "set":
      return `z.ZodSet<${emitType(node.value)}>`;
    case "object": {
      const typeParts = node.shape.map(
        ({ key, value }) => `${JSON.stringify(key)}: ${emitType(value)}`
      );
      const config =
        node.mode === "loose"
          ? ", z.core.$loose"
          : node.mode === "strict"
            ? ", z.core.$strict"
            : "";
      return `z.ZodObject<{ ${typeParts.join(", ")} }${config}>`;
    }
    case "catchall":
    case "superRefine":
    case "refine":
      return emitType(node.base);
    case "transform":
      return `z.ZodPipe<${emitType(node.base)}, z.ZodTypeAny>`;
    case "pipe":
      return `z.ZodPipeline<${emitType(node.first)}, ${emitType(node.second)}>`;
    case "coerce":
      if (node.to === "date") return "z.ZodDate";
      if (node.to === "string") return "z.ZodString";
      if (node.to === "number") return "z.ZodNumber";
      return "z.ZodBoolean";
    case "call":
      return node.type;
    case "chain":
      return emitType(node.base);
  }
};

type NodeVisitor = (node: SchemaNode) => void;

const walkNode = (node: SchemaNode, visit: NodeVisitor): void => {
  visit(node);

  switch (node.kind) {
    case "lazy":
      walkNode(node.inner, visit);
      break;
    case "array":
    case "optional":
    case "exactOptional":
    case "nullable":
    case "default":
    case "readonly":
    case "describe":
    case "meta":
      walkNode(node.inner, visit);
      break;
    case "union":
    case "discriminatedUnion":
    case "xor":
      node.options.forEach((option) => walkNode(option, visit));
      break;
    case "intersection":
      walkNode(node.left, visit);
      walkNode(node.right, visit);
      break;
    case "and":
      walkNode(node.base, visit);
      walkNode(node.other, visit);
      break;
    case "tuple":
      node.items.forEach((item) => walkNode(item, visit));
      if (node.rest) {
        walkNode(node.rest, visit);
      }
      break;
    case "record":
    case "map":
      walkNode(node.key, visit);
      walkNode(node.value, visit);
      break;
    case "set":
      walkNode(node.value, visit);
      break;
    case "object":
      node.shape.forEach(({ value }) => walkNode(value, visit));
      break;
    case "catchall":
      walkNode(node.base, visit);
      walkNode(node.catchall, visit);
      break;
    case "superRefine":
    case "refine":
    case "transform":
      walkNode(node.base, visit);
      break;
    case "pipe":
      walkNode(node.first, visit);
      walkNode(node.second, visit);
      break;
    case "chain":
      walkNode(node.base, visit);
      break;
    case "string":
    case "number":
    case "boolean":
    case "null":
    case "undefined":
    case "any":
    case "unknown":
    case "never":
    case "bigint":
    case "date":
    case "literal":
    case "enum":
    case "ref":
    case "coerce":
    case "call":
      break;
  }
};

export const collectRefNames = (node: SchemaNode): Set<string> => {
  const refs = new Set<string>();
  walkNode(node, (current) => {
    if (current.kind === "ref") {
      refs.add(current.name);
    }
  });
  return refs;
};

export const nodeHasLazy = (node: SchemaNode): boolean => {
  let found = false;
  walkNode(node, (current) => {
    if (current.kind === "lazy") {
      found = true;
    }
  });
  return found;
};

export const nodeHasGetter = (node: SchemaNode): boolean => {
  let found = false;
  walkNode(node, (current) => {
    if (current.kind === "object" && current.shape.some((entry) => entry.isGetter)) {
      found = true;
    }
  });
  return found;
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
  if (!rep.node) {
    throw new Error("SchemaRepresentation node missing (no-fallback mode).");
  }

  const nodeRefs = collectRefNames(rep.node);
  if (nodeRefs.has(currentSchemaName)) return true;

  // Check if expression contains a reference to a cycle member in the same SCC
  if (!cycleRefNames || cycleRefNames.size === 0) return false;

  const currentComponent = cycleComponentByName?.get(currentSchemaName);
  if (currentComponent === undefined) return false;

  for (const refName of nodeRefs) {
    if (!cycleRefNames.has(refName)) continue;
    const refComponent = cycleComponentByName?.get(refName);
    if (refComponent === currentComponent) {
      return true;
    }
  }

  return false;
};
