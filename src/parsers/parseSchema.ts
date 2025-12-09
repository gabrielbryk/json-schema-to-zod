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
} from "../Types.js";

export const parseSchema = (
  schema: JsonSchema,
  refs: Refs = { seen: new Map(), path: [] },
  blockMeta?: boolean,
): string => {
  // Ensure ref bookkeeping exists so $ref declarations and getter-based recursion work
  refs.root = refs.root ?? schema;
  refs.declarations = refs.declarations ?? new Map();
  refs.inProgress = refs.inProgress ?? new Set();
  refs.refNameByPointer = refs.refNameByPointer ?? new Map();
  refs.usedNames = refs.usedNames ?? new Set();

  if (typeof schema !== "object") return schema ? "z.any()" : "z.never()";

  if (refs.parserOverride) {
    const custom = refs.parserOverride(schema, refs);

    if (typeof custom === "string") {
      return custom;
    }
  }

  let seen = refs.seen.get(schema);

  if (seen) {
    if (seen.r !== undefined) {
      return seen.r;
    }

    if (refs.depth === undefined || seen.n >= refs.depth) {
      return "z.any()";
    }

    seen.n += 1;
  } else {
    seen = { r: undefined, n: 0 };
    refs.seen.set(schema, seen);
  }

  if (its.a.ref(schema)) {
    const parsedRef = parseRef(schema, refs);
    seen.r = parsedRef;
    return parsedRef;
  }

  let parsed = selectParser(schema, refs);
  if (!blockMeta) {
    if (!refs.withoutDescribes) {
      parsed = addDescribes(schema, parsed, refs);
    }

    if (!refs.withoutDefaults) {
      parsed = addDefaults(schema, parsed);
    }

    parsed = addAnnotations(schema, parsed)
  }

  seen.r = parsed;

  return parsed;
};

const parseRef = (schema: JsonSchemaObject & { $ref: string }, refs: Refs): string => {
  const resolved = resolveRef(refs.root, schema.$ref);

  if (!resolved) {
    return "z.any()";
  }

  const { schema: target, path } = resolved;
  const refName = getOrCreateRefName(schema.$ref, path, refs);

  if (!refs.declarations!.has(refName) && !refs.inProgress!.has(refName)) {
    refs.inProgress!.add(refName);
    const declaration = parseSchema(target, {
      ...refs,
      path,
      currentSchemaName: refName,
      root: refs.root,
    });
    refs.inProgress!.delete(refName);
    refs.declarations!.set(refName, declaration);
  }

  return refName;
};

const addDescribes = (schema: JsonSchemaObject, parsed: string, refs?: Refs): string => {
  // Use .meta() for richer metadata when withMeta is enabled
  if (refs?.withMeta) {
    const meta: Record<string, unknown> = {};

    if (schema.$id) meta.id = schema.$id;
    if (schema.title) meta.title = schema.title;
    if (schema.description) meta.description = schema.description;
    if (schema.examples) meta.examples = schema.examples;
    if (schema.deprecated) meta.deprecated = schema.deprecated;

    if (Object.keys(meta).length > 0) {
      parsed += `.meta(${JSON.stringify(meta)})`;
    }
  } else if (schema.description) {
    parsed += `.describe(${JSON.stringify(schema.description)})`;
  }

  return parsed;
};

const resolveRef = (
  root: JsonSchema | undefined,
  ref: string,
): { schema: JsonSchema; path: (string | number)[] } | undefined => {
  if (!root || !ref.startsWith("#/")) return undefined;

  const rawSegments = ref
    .slice(2)
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(decodePointerSegment);

  let current: any = root;

  for (const segment of rawSegments) {
    if (typeof current !== "object" || current === null) return undefined;
    current = current[segment as keyof typeof current];
  }

  return { schema: current as JsonSchema, path: rawSegments };
};

const decodePointerSegment = (segment: string) =>
  segment.replace(/~1/g, "/").replace(/~0/g, "~");

const getOrCreateRefName = (
  pointer: string,
  path: (string | number)[],
  refs: Refs,
): string => {
  if (refs.refNameByPointer?.has(pointer)) {
    return refs.refNameByPointer.get(pointer)!;
  }

  const preferred = buildNameFromPath(path, refs.usedNames);
  refs.refNameByPointer?.set(pointer, preferred);
  refs.usedNames?.add(preferred);
  return preferred;
};

const buildNameFromPath = (
  path: (string | number)[],
  used?: Set<string>,
): string => {
  const filtered = path.filter(
    (segment) => segment !== "$defs" && segment !== "definitions" && segment !== "properties",
  );

  const base = filtered.length
    ? filtered
        .map((segment) =>
          typeof segment === "number"
            ? `Ref${segment}`
            : segment
                .replace(/[^a-zA-Z0-9_$]/g, " ")
                .split(" ")
                .filter(Boolean)
                .map(capitalize)
                .join(""),
        )
        .join("")
    : "Ref";

  const sanitized = sanitizeIdentifier(base || "Ref");

  if (!used || !used.has(sanitized)) return sanitized;

  let counter = 2;
  let candidate = `${sanitized}${counter}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${sanitized}${counter}`;
  }

  return candidate;
};

const sanitizeIdentifier = (value: string): string => {
  const cleaned = value.replace(/^[^a-zA-Z_$]+/, "").replace(/[^a-zA-Z0-9_$]/g, "");
  return cleaned || "Ref";
};

const capitalize = (value: string) =>
  value.length ? value[0].toUpperCase() + value.slice(1) : value;

const addDefaults = (schema: JsonSchemaObject, parsed: string): string => {
  if (schema.default !== undefined) {
    parsed += `.default(${JSON.stringify(schema.default)})`;
  }

  return parsed;
};

const addAnnotations = (schema: JsonSchemaObject, parsed: string): string => {
  if (schema.readOnly) {
    parsed += ".readonly()";
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
    return parseEnum(schema); //<-- needs to come before primitives
  } else if (its.a.const(schema)) {
    return parseConst(schema);
  } else if (its.a.multipleType(schema)) {
    return parseMultipleType(schema, refs);
  } else if (its.a.primitive(schema, "string")) {
    return parseString(schema);
  } else if (
    its.a.primitive(schema, "number") ||
    its.a.primitive(schema, "integer")
  ) {
    return parseNumber(schema);
  } else if (its.a.primitive(schema, "boolean")) {
    return parseBoolean(schema);
  } else if (its.a.primitive(schema, "null")) {
    return parseNull(schema);
  } else if (its.a.conditional(schema)) {
    return parseIfThenElse(schema, refs);
  } else {
    return parseDefault(schema);
  }
};

export const its = {
  an: {
    object: (x: JsonSchemaObject): x is JsonSchemaObject & { type: "object" } =>
      x.type === "object",
    array: (x: JsonSchemaObject): x is JsonSchemaObject & { type: "array" } =>
      x.type === "array",
    anyOf: (
      x: JsonSchemaObject,
    ): x is JsonSchemaObject & {
      anyOf: JsonSchema[];
    } => x.anyOf !== undefined,
    allOf: (
      x: JsonSchemaObject,
    ): x is JsonSchemaObject & {
      allOf: JsonSchema[];
    } => x.allOf !== undefined,
    enum: (
      x: JsonSchemaObject,
    ): x is JsonSchemaObject & {
      enum: Serializable | Serializable[];
    } => x.enum !== undefined,
  },
  a: {
    nullable: (
      x: JsonSchemaObject,
    ): x is JsonSchemaObject & { nullable: true } =>
      (x as any).nullable === true,
    multipleType: (
      x: JsonSchemaObject,
    ): x is JsonSchemaObject & { type: string[] } => Array.isArray(x.type),
    not: (
      x: JsonSchemaObject,
    ): x is JsonSchemaObject & {
      not: JsonSchema;
    } => x.not !== undefined,
    ref: (
      x: JsonSchemaObject,
    ): x is JsonSchemaObject & {
      $ref: string;
    } => typeof (x as any).$ref === "string",
    const: (
      x: JsonSchemaObject,
    ): x is JsonSchemaObject & {
      const: Serializable;
    } => x.const !== undefined,
    primitive: <T extends "string" | "number" | "integer" | "boolean" | "null">(
      x: JsonSchemaObject,
      p: T,
    ): x is JsonSchemaObject & { type: T } => x.type === p,
    conditional: (
      x: JsonSchemaObject,
    ): x is JsonSchemaObject & {
      if: JsonSchema;
      then: JsonSchema;
      else: JsonSchema;
    } =>
      Boolean(
        "if" in x && x.if && "then" in x && "else" in x && x.then && x.else,
      ),
    simpleDiscriminatedOneOf: (
      x: JsonSchemaObject,
    ): x is SimpleDiscriminatedOneOfSchema => {
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
      x: JsonSchemaObject,
    ): x is JsonSchemaObject & {
      oneOf: JsonSchema[];
    } => x.oneOf !== undefined,
  },
};
