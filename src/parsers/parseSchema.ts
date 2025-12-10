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
import { anyOrUnknown } from "../utils/anyOrUnknown.js";
import { resolveUri } from "../utils/resolveUri.js";
import { buildRefRegistry } from "../utils/buildRefRegistry.js";

export const parseSchema = (
  schema: JsonSchema,
  refs: Refs = { seen: new Map(), path: [] },
  blockMeta?: boolean,
): string => {
  // Ensure ref bookkeeping exists so $ref declarations and getter-based recursion work
  refs.root = refs.root ?? schema;
  refs.rootBaseUri = refs.rootBaseUri ?? "root:///";
  refs.declarations = refs.declarations ?? new Map();
  refs.dependencies = refs.dependencies ?? new Map();
  refs.inProgress = refs.inProgress ?? new Set();
  refs.refNameByPointer = refs.refNameByPointer ?? new Map();
  refs.usedNames = refs.usedNames ?? new Set();

  if (typeof schema !== "object") return schema ? anyOrUnknown(refs) : "z.never()";

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
    const custom = refs.parserOverride(schema, { ...refs, currentBaseUri: baseUri, dynamicAnchors });

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
      parsed = addDescribes(schema, parsed, { ...refs, currentBaseUri: baseUri, dynamicAnchors });
    }

    if (!refs.withoutDefaults) {
      parsed = addDefaults(schema, parsed);
    }

    parsed = addAnnotations(schema, parsed)
  }

  seen.r = parsed;

  return parsed;
};

const parseRef = (
  schema: JsonSchemaObject & { $ref?: string; $dynamicRef?: string },
  refs: Refs,
): string => {
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
    const declaration = parseSchema(target, {
      ...refs,
      path,
      currentBaseUri: resolved.baseUri,
      currentSchemaName: refName,
      root: refs.root,
    });
    refs.inProgress!.delete(refName);
    refs.declarations!.set(refName, declaration);
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

  // Only lazy if the ref stays inside the current strongly-connected component
  // (or is currently being resolved). This avoids TDZ on true cycles while
  // letting ordered, acyclic refs stay direct.
  if (isSameCycle || refs.inProgress!.has(refName)) {
    return `z.lazy(() => ${refName})`;
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
  schemaNode: JsonSchemaObject,
  ref: string,
  refs: Refs,
): { schema: JsonSchema; path: (string | number)[]; baseUri: string; pointerKey: string } | undefined => {
  const base = refs.currentBaseUri ?? refs.rootBaseUri ?? "root:///";

  // Handle dynamicRef lookup via dynamicAnchors stack
  const isDynamic = typeof schemaNode.$dynamicRef === "string";
  if (isDynamic && refs.dynamicAnchors && ref.startsWith("#")) {
    const name = ref.slice(1);
    for (let i = refs.dynamicAnchors.length - 1; i >= 0; i -= 1) {
      const entry = refs.dynamicAnchors[i];
      if (entry.name === name) {
        const key = `${entry.uri}#${name}`;
        const target = refs.refRegistry?.get(key);
        if (target) {
          return { schema: target.schema, path: target.path, baseUri: target.baseUri, pointerKey: key };
        }
      }
    }
  }

  // Resolve URI against base
  const resolvedUri = resolveUri(base, ref);
  const [uriBase, fragment] = resolvedUri.split("#");
  const key = fragment ? `${uriBase}#${fragment}` : uriBase;

  let regEntry = refs.refRegistry?.get(key);
  if (regEntry) {
    return { schema: regEntry.schema, path: regEntry.path, baseUri: regEntry.baseUri, pointerKey: key };
  }

  // Legacy recursive ref: treat as dynamic to __recursive__
  if (schemaNode.$recursiveRef) {
    const recursiveKey = `${base}#__recursive__`;
    regEntry = refs.refRegistry?.get(recursiveKey);
    if (regEntry) {
      return {
        schema: regEntry.schema,
        path: regEntry.path,
        baseUri: regEntry.baseUri,
        pointerKey: recursiveKey,
      };
    }
  }

  // External resolver hook
  const extBase = uriBaseFromRef(resolvedUri);
  if (refs.resolveExternalRef && extBase && !isLocalBase(extBase, refs.rootBaseUri ?? "")) {
    const loaded = refs.resolveExternalRef(extBase);
    if (loaded) {
      // If async resolver is used synchronously here, it will be ignored; keep simple sync for now
      const maybePromise = loaded as { then?: unknown };
      const schema =
        typeof maybePromise.then === "function"
          ? undefined
          : (loaded as JsonSchema);
      if (schema) {
        const { registry } = buildRefRegistry(schema, extBase);
        registry.forEach((entry, k) => refs.refRegistry?.set(k, entry));
        regEntry = refs.refRegistry?.get(key);
        if (regEntry) {
          return {
            schema: regEntry.schema,
            path: regEntry.path,
            baseUri: regEntry.baseUri,
            pointerKey: key,
          };
        }
      }
    }
  }

  // Backward compatibility: JSON Pointer into root
  if (refs.root && ref.startsWith("#/")) {
    const rawSegments = ref
      .slice(2)
      .split("/")
      .filter((segment) => segment.length > 0)
      .map(decodePointerSegment);

    let current: unknown = refs.root;

    for (const segment of rawSegments) {
      if (typeof current !== "object" || current === null) return undefined;
      current = (current as Record<string, unknown>)[segment as keyof typeof current];
    }

    return { schema: current as JsonSchema, path: rawSegments, baseUri: base, pointerKey: ref };
  }

  return undefined;
};

const decodePointerSegment = (segment: string) =>
  segment.replace(/~1/g, "/").replace(/~0/g, "~");

const uriBaseFromRef = (resolvedUri: string): string | undefined => {
  const hashIdx = resolvedUri.indexOf("#");
  return hashIdx === -1 ? resolvedUri : resolvedUri.slice(0, hashIdx);
};

const isLocalBase = (base: string, rootBase: string): boolean => {
  if (!rootBase) return false;
  return base === rootBase;
};

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
    return parseString(schema, refs);
  } else if (
    its.a.primitive(schema, "number") ||
    its.a.primitive(schema, "integer")
  ) {
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
      (x as { nullable?: boolean }).nullable === true,
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
      $ref?: string;
      $dynamicRef?: string;
    } => typeof x.$ref === "string" || typeof x.$dynamicRef === "string",
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
