import { parseAnyOf } from "./parseAnyOf.js";
import { parseBoolean } from "./parseBoolean.js";
import { parseDefault } from "./parseDefault.js";
import { parseMultipleType } from "./parseMultipleType.js";
import { parseNot } from "./parseNot.js";
import { parseNull } from "./parseNull.js";
import { parseAllOf } from "./parseAllOf.js";
import { parseArray } from "./parseArray.js";
import { parseConst } from "./parseConst.js";
import { parseEnum } from "./parseEnum.js";
import { parseIfThenElse } from "./parseIfThenElse.js";
import { parseNumber } from "./parseNumber.js";
import { parseObject } from "./parseObject.js";
import { parseString } from "./parseString.js";
import { parseOneOf } from "./parseOneOf.js";
import { parseSimpleDiscriminatedOneOf } from "./parseSimpleDiscriminatedOneOf.js";
import { parseNullable } from "./parseNullable.js";
import {
  ParserSelector,
  Refs,
  JsonSchemaObject,
  JsonSchema,
  Serializable,
  SimpleDiscriminatedOneOfSchema,
  SchemaRepresentation,
} from "../Types.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";
import {
  zodDefault,
  zodDescribe,
  zodLazy,
  zodMeta,
  zodNever,
  zodReadonly,
  zodRef,
} from "../utils/schemaRepresentation.js";
import { resolveUri } from "../utils/resolveUri.js";
import { resolveRef } from "../utils/resolveRef.js";
import { ensureUnique, resolveSchemaName, sanitizeIdentifier } from "../utils/schemaNaming.js";

export const parseSchema = (
  schema: JsonSchema,
  refs: Refs = { seen: new Map(), path: [] },
  blockMeta?: boolean
): SchemaRepresentation => {
  // Ensure ref bookkeeping exists so $ref declarations and getter-based recursion work
  refs.root = refs.root ?? schema;
  refs.rootBaseUri = refs.rootBaseUri ?? "root:///";
  refs.declarations = refs.declarations ?? new Map();
  refs.dependencies = refs.dependencies ?? new Map();
  refs.inProgress = refs.inProgress ?? new Set();
  refs.refNameByPointer = refs.refNameByPointer ?? new Map();
  refs.usedNames = refs.usedNames ?? new Set();
  refs.catchallRefNames = refs.catchallRefNames ?? new Set();

  if (typeof schema !== "object") {
    return schema ? anyOrUnknown(refs) : zodNever();
  }

  const parentBase = refs.currentBaseUri ?? refs.rootBaseUri ?? "root:///";
  const baseUri = typeof schema.$id === "string" ? resolveUri(parentBase, schema.$id) : parentBase;

  const dynamicAnchors = Array.isArray(refs.dynamicAnchors) ? [...refs.dynamicAnchors] : [];
  if (typeof schema.$dynamicAnchor === "string") {
    dynamicAnchors.push({
      name: schema.$dynamicAnchor,
      uri: baseUri,
      path: refs.path,
    });
  }

  if (refs.parserOverride) {
    const custom = refs.parserOverride(schema, {
      ...refs,
      currentBaseUri: baseUri,
      dynamicAnchors,
    });

    if (custom) {
      if (!custom.node) {
        throw new Error(
          "parserOverride must return SchemaRepresentation with node (no-fallback mode)."
        );
      }
      return custom;
    }
  }

  let seen = refs.seen.get(schema);

  if (seen) {
    if (seen.r !== undefined) {
      return seen.r;
    }

    if (refs.depth === undefined || seen.n >= refs.depth) {
      return anyOrUnknown(refs);
    }

    seen.n += 1;
  } else {
    seen = { r: undefined, n: 0 };
    refs.seen.set(schema, seen);
  }

  if (its.a.ref(schema)) {
    const parsedRef = parseRef(schema, { ...refs, currentBaseUri: baseUri, dynamicAnchors });
    seen.r = parsedRef;
    return parsedRef;
  }

  let parsed = selectParser(schema, { ...refs, currentBaseUri: baseUri, dynamicAnchors });

  if (!blockMeta) {
    if (!refs.withoutDescribes) {
      parsed = addDescribes(schema, parsed);
    }

    if (!refs.withoutDefaults) {
      parsed = addDefaults(schema, parsed);
    }

    parsed = addAnnotations(schema, parsed);
  }

  seen.r = parsed;

  return parsed;
};

const parseRef = (
  schema: JsonSchemaObject & { $ref?: string; $dynamicRef?: string },
  refs: Refs
): SchemaRepresentation => {
  const refValue = schema.$dynamicRef ?? schema.$ref;

  if (typeof refValue !== "string") {
    return anyOrUnknown(refs);
  }

  const resolved = resolveRef(schema, refValue, refs);

  if (!resolved) {
    refs.onUnresolvedRef?.(refValue, refs.path);
    return anyOrUnknown(refs);
  }

  const { schema: target, path, pointerKey } = resolved;
  const refName = getOrCreateRefName(pointerKey, path, refs);

  if (!refs.declarations!.has(refName) && !refs.inProgress!.has(refName)) {
    refs.inProgress!.add(refName);
    const result = parseSchema(target, {
      ...refs,
      path,
      currentBaseUri: resolved.baseUri,
      currentSchemaName: refName,
      root: refs.root,
    });
    refs.inProgress!.delete(refName);
    refs.declarations!.set(refName, result);
  }

  const current = refs.currentSchemaName;
  if (current) {
    const deps = refs.dependencies!;
    const set = deps.get(current) ?? new Set<string>();
    set.add(refName);
    deps.set(current, set);
  }

  const currentComponent = refs.currentSchemaName
    ? refs.cycleComponentByName?.get(refs.currentSchemaName)
    : undefined;
  const targetComponent = refs.cycleComponentByName?.get(refName);

  const isSameCycle =
    currentComponent !== undefined &&
    targetComponent !== undefined &&
    currentComponent === targetComponent &&
    refs.cycleRefNames?.has(refName);

  // Check if this is a true forward reference (target not yet declared)
  // We only need z.lazy() for forward refs, not for back-refs to already-declared schemas
  const isForwardRef = refs.inProgress!.has(refName);

  // Check context: are we inside a named object property where getters work?
  // IMPORTANT: additionalProperties/patternProperties become z.record() (or .catchall())
  // and do NOT support getters for deferred evaluation.
  const inNamedProperty = refs.path.includes("properties");

  // additionalProperties becomes z.record() value - getters don't work there
  // Per Zod issue #4881: z.record() with recursive values REQUIRES z.lazy()
  const inRecordContext = refs.path.includes("additionalProperties");
  const inCatchallContext = inRecordContext || refs.path.includes("patternProperties");

  if (inCatchallContext) {
    refs.catchallRefNames?.add(refName);
  }

  const isSelfRecursion = refName === refs.currentSchemaName;
  const isRecursive = isSameCycle || isForwardRef || isSelfRecursion;

  // Use deferred/lazy logic if recursive or in a context that requires it (record/catchall)
  if (isRecursive) {
    const needsLazy = isForwardRef || inRecordContext || !inNamedProperty;

    // Self-recursion in named object properties: use direct ref (getter handles deferred eval)
    if (inNamedProperty && isSelfRecursion) {
      return zodRef(refName);
    }

    // Cross-schema refs in named object properties within same cycle: use direct ref
    // The getter in parseObject.ts will handle deferred evaluation
    if (inNamedProperty && isSameCycle && !isForwardRef) {
      return zodRef(refName);
    }

    if (needsLazy) {
      // z.record() values with recursive refs MUST use z.lazy() (Colin confirmed in #4881)
      // Also arrays, unions, and other non-object contexts with forward refs need z.lazy()
      return zodLazy(refName);
    }
  }

  return zodRef(refName);
};

const addDescribes = (
  schema: JsonSchemaObject,
  parsed: SchemaRepresentation
): SchemaRepresentation => {
  let result = parsed;

  const meta: Record<string, unknown> = {};

  if (schema.$id) meta.id = schema.$id;
  if (schema.title) meta.title = schema.title;
  if (schema.description) meta.description = schema.description;
  if (schema.examples) meta.examples = schema.examples;
  if (schema.deprecated) meta.deprecated = schema.deprecated;

  // Collect other unknown keywords as metadata if configured
  // This aligns with Zod v4 "Custom metadata is preserved"
  // We can filter out known keywords to find the "unknown" ones.
  // This list needs to be comprehensive to avoid polluting meta with standard logic keywords.
  const knownKeywords = new Set([
    "type",
    "properties",
    "additionalProperties",
    "patternProperties",
    "items",
    "prefixItems",
    "additionalItems",
    "contains",
    "minContains",
    "maxContains",
    "required",
    "enum",
    "const",
    "format",
    "minLength",
    "maxLength",
    "pattern",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "if",
    "then",
    "else",
    "allOf",
    "anyOf",
    "oneOf",
    "not",
    "$id",
    "$ref",
    "$dynamicRef",
    "$dynamicAnchor",
    "$schema",
    "$defs",
    "definitions",
    "title",
    "description",
    "default",
    "examples",
    "deprecated",
    "readOnly",
    "writeOnly",
    "contentEncoding",
    "contentMediaType",
    "contentSchema",
    "dependentRequired",
    "dependentSchemas",
    "propertyNames",
    "unevaluatedProperties",
    "unevaluatedItems",
    "nullable",
    "discriminator",
    "errorMessage",
    "externalDocs",
    "__originalIndex",
  ]);

  Object.keys(schema).forEach((key) => {
    if (!knownKeywords.has(key)) {
      meta[key] = schema[key];
    }
  });

  if (Object.keys(meta).length > 0) {
    // Only add .meta() if there is something to add
    // Note: Zod v4 .describe() writes to description too, which meta does too?
    // Zod .describe() sets the description property of the schema def.
    // .meta() is for custom metadata.
    // If strict on description, use .describe().

    // Zod v4: schema.describe("foo") sets description.
    // schema.meta({ ... }) is for other stuff?
    // Actually, Zod documentation says: "Custom metadata is preserved".

    if (meta.description) {
      result = zodDescribe(result, String(meta.description));
      delete meta.description; // Don't duplicate in meta object if using describe
    }

    if (Object.keys(meta).length > 0) {
      result = zodMeta(result, JSON.stringify(meta));
    }
  }

  return result;
};

const getOrCreateRefName = (pointer: string, path: (string | number)[], refs: Refs): string => {
  if (refs.refNameByPointer?.has(pointer)) {
    return refs.refNameByPointer.get(pointer)!;
  }

  if (!refs.naming) {
    const preferred = buildNameFromPath(path, refs.usedNames);
    refs.refNameByPointer?.set(pointer, preferred);
    refs.usedNames?.add(preferred);
    return preferred;
  }

  const baseName = buildBaseNameFromPath(path, refs.usedBaseNames);
  const schemaName = resolveSchemaName(
    baseName,
    refs.naming,
    { isRoot: false, isLifted: true },
    refs.usedNames
  );

  refs.refNameByPointer?.set(pointer, schemaName);
  refs.refBaseNameByPointer?.set(pointer, baseName);
  refs.baseNameBySchema?.set(schemaName, baseName);
  refs.usedNames?.add(schemaName);
  refs.usedBaseNames?.add(baseName);

  return schemaName;
};

const buildNameFromPath = (path: (string | number)[], used?: Set<string>): string => {
  const filtered = path
    .map((segment, idx) => {
      if (idx === 0 && (segment === "$defs" || segment === "definitions")) {
        return undefined; // root-level defs prefix is redundant for naming
      }
      if (segment === "properties") return undefined; // skip noisy properties segment
      if (segment === "$defs" || segment === "definitions") return "Defs";
      return segment;
    })
    .filter((segment) => segment !== undefined) as (string | number)[];

  const base = filtered.length
    ? filtered
        .map((segment) =>
          typeof segment === "number"
            ? `Ref${segment}`
            : segment
                .toString()
                .replace(/[^a-zA-Z0-9_$]/g, " ")
                .split(" ")
                .filter(Boolean)
                .map(capitalize)
                .join("")
        )
        .join("")
    : "Ref";

  let finalName = base;
  if (!finalName.endsWith("Schema")) {
    finalName += "Schema";
  }
  const sanitized = sanitizeIdentifier(finalName);
  return ensureUnique(sanitized, used);
};

const buildBaseNameFromPath = (path: (string | number)[], used?: Set<string>): string => {
  const filtered = path
    .map((segment, idx) => {
      if (idx === 0 && (segment === "$defs" || segment === "definitions")) {
        return undefined; // root-level defs prefix is redundant for naming
      }
      if (segment === "properties") return undefined; // skip noisy properties segment
      if (segment === "$defs" || segment === "definitions") return "Defs";
      return segment;
    })
    .filter((segment) => segment !== undefined) as (string | number)[];

  const base = filtered.length
    ? filtered
        .map((segment) =>
          typeof segment === "number"
            ? `Ref${segment}`
            : segment
                .toString()
                .replace(/[^a-zA-Z0-9_$]/g, " ")
                .split(" ")
                .filter(Boolean)
                .map(capitalize)
                .join("")
        )
        .join("")
    : "Ref";

  const sanitized = sanitizeIdentifier(base);
  return ensureUnique(sanitized, used);
};

const capitalize = (value: string) =>
  value.length ? value[0].toUpperCase() + value.slice(1) : value;

const addDefaults = (
  schema: JsonSchemaObject,
  parsed: SchemaRepresentation
): SchemaRepresentation => {
  if (schema.default !== undefined) {
    return zodDefault(parsed, JSON.stringify(schema.default));
  }

  return parsed;
};

const addAnnotations = (
  schema: JsonSchemaObject,
  parsed: SchemaRepresentation
): SchemaRepresentation => {
  if (schema.readOnly) {
    return zodReadonly(parsed);
  }

  return parsed;
};

const selectParser: ParserSelector = (schema, refs) => {
  if (its.a.nullable(schema)) {
    return parseNullable(schema, refs);
  } else if (its.an.object(schema)) {
    return parseObject(schema, refs);
  } else if (its.an.array(schema)) {
    return parseArray(schema, refs);
  } else if (its.an.anyOf(schema)) {
    return parseAnyOf(schema, refs);
  } else if (its.an.allOf(schema)) {
    return parseAllOf(schema, refs);
  } else if (its.a.simpleDiscriminatedOneOf(schema)) {
    return parseSimpleDiscriminatedOneOf(schema, refs);
  } else if (its.a.oneOf(schema)) {
    return parseOneOf(schema, refs);
  } else if (its.a.not(schema)) {
    return parseNot(schema, refs);
  } else if (its.an.enum(schema)) {
    return parseEnum(schema);
  } else if (its.a.const(schema)) {
    return parseConst(schema);
  } else if (its.a.multipleType(schema)) {
    return parseMultipleType(schema, refs);
  } else if (its.a.primitive(schema, "string")) {
    return parseString(schema, refs);
  } else if (its.a.primitive(schema, "number") || its.a.primitive(schema, "integer")) {
    return parseNumber(schema);
  } else if (its.a.primitive(schema, "boolean")) {
    return parseBoolean();
  } else if (its.a.primitive(schema, "null")) {
    return parseNull();
  } else if (its.a.conditional(schema)) {
    return parseIfThenElse(schema, refs);
  } else {
    return parseDefault(schema, refs);
  }
};

export const its = {
  an: {
    object: (x: JsonSchemaObject): x is JsonSchemaObject & { type: "object" } =>
      x.type === "object" ||
      x.properties !== undefined ||
      x.additionalProperties !== undefined ||
      x.patternProperties !== undefined ||
      x.required !== undefined,
    array: (x: JsonSchemaObject): x is JsonSchemaObject & { type: "array" } => x.type === "array",
    anyOf: (
      x: JsonSchemaObject
    ): x is JsonSchemaObject & {
      anyOf: JsonSchema[];
    } => x.anyOf !== undefined,
    allOf: (
      x: JsonSchemaObject
    ): x is JsonSchemaObject & {
      allOf: JsonSchema[];
    } => x.allOf !== undefined,
    enum: (
      x: JsonSchemaObject
    ): x is JsonSchemaObject & {
      enum: Serializable | Serializable[];
    } => x.enum !== undefined,
  },
  a: {
    nullable: (x: JsonSchemaObject): x is JsonSchemaObject & { nullable: true } =>
      (x as { nullable?: boolean }).nullable === true,
    multipleType: (x: JsonSchemaObject): x is JsonSchemaObject & { type: string[] } =>
      Array.isArray(x.type),
    not: (
      x: JsonSchemaObject
    ): x is JsonSchemaObject & {
      not: JsonSchema;
    } => x.not !== undefined,
    ref: (
      x: JsonSchemaObject
    ): x is JsonSchemaObject & {
      $ref?: string;
      $dynamicRef?: string;
    } => typeof x.$ref === "string" || typeof x.$dynamicRef === "string",
    const: (
      x: JsonSchemaObject
    ): x is JsonSchemaObject & {
      const: Serializable;
    } => x.const !== undefined,
    primitive: <T extends "string" | "number" | "integer" | "boolean" | "null">(
      x: JsonSchemaObject,
      p: T
    ): x is JsonSchemaObject & { type: T } => x.type === p,
    conditional: (
      x: JsonSchemaObject
    ): x is JsonSchemaObject & {
      if: JsonSchema;
      then: JsonSchema;
      else: JsonSchema;
    } => Boolean("if" in x && x.if && "then" in x && "else" in x && x.then && x.else),
    simpleDiscriminatedOneOf: (x: JsonSchemaObject): x is SimpleDiscriminatedOneOfSchema => {
      if (
        !x.oneOf ||
        !Array.isArray(x.oneOf) ||
        x.oneOf.length === 0 ||
        !x.discriminator ||
        typeof x.discriminator !== "object" ||
        !("propertyName" in x.discriminator) ||
        typeof x.discriminator.propertyName !== "string"
      ) {
        return false;
      }

      const discriminatorProp = x.discriminator.propertyName;

      return x.oneOf.every((schema) => {
        if (
          !schema ||
          typeof schema !== "object" ||
          schema.type !== "object" ||
          !schema.properties ||
          typeof schema.properties !== "object" ||
          !(discriminatorProp in schema.properties)
        ) {
          return false;
        }

        const property = schema.properties[discriminatorProp];
        return (
          property &&
          typeof property === "object" &&
          (property.type === undefined || property.type === "string") &&
          // Ensure discriminator has a constant value (const or single-value enum)
          (property.const !== undefined ||
            (property.enum && Array.isArray(property.enum) && property.enum.length === 1)) &&
          // Ensure discriminator property is required
          Array.isArray(schema.required) &&
          schema.required.includes(discriminatorProp)
        );
      });
    },
    oneOf: (
      x: JsonSchemaObject
    ): x is JsonSchemaObject & {
      oneOf: JsonSchema[];
    } => x.oneOf !== undefined,
  },
};
