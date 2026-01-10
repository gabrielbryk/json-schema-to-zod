import { JsonSchema, JsonSchemaObject, Refs, SchemaRepresentation } from "../Types.js";
import { parseAnyOf } from "./parseAnyOf.js";
import { parseOneOf } from "./parseOneOf.js";
import { parseSchema } from "./parseSchema.js";

import { expandJsdocs } from "../utils/jsdocs.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";
import { buildIntersectionTree } from "../utils/buildIntersectionTree.js";
import { collectSchemaProperties } from "../utils/collectSchemaProperties.js";
import {
  shouldUseGetter,
  zodCatchall,
  zodChain,
  zodExactOptional,
  zodLooseObject,
  zodLooseRecord,
  zodStrictObject,
  zodString,
  zodSuperRefine,
} from "../utils/schemaRepresentation.js";

export function parseObject(
  objectSchema: JsonSchemaObject & { type: "object" },
  refs: Refs
): SchemaRepresentation {
  const collectedProperties = objectSchema.allOf
    ? collectSchemaProperties(objectSchema, refs)
    : undefined;
  const explicitProps = objectSchema.properties ? Object.keys(objectSchema.properties) : [];
  const collectedProps = collectedProperties ? Object.keys(collectedProperties.properties) : [];
  const requiredProps = collectedProperties
    ? collectedProperties.required
    : Array.isArray(objectSchema.required)
      ? objectSchema.required
      : [];
  const allProps = [...new Set([...explicitProps, ...requiredProps, ...collectedProps])];
  const hasProperties = allProps.length > 0;
  const requiredSet = new Set(requiredProps);

  const isPropertyOnlyAllOfMember = (member: JsonSchema): boolean => {
    if (typeof member !== "object" || member === null) return false;
    const obj = member as JsonSchemaObject;
    if (obj.$ref || obj.$dynamicRef) return false;
    const keys = Object.keys(obj);
    if (keys.length === 0) return false;
    return keys.every((key) => key === "properties" || key === "required");
  };

  const propertyOnlyOverlapKeys = new Set<string>();
  const propertyOnlyKeysByIndex = new Map<number, string[]>();
  if (objectSchema.allOf) {
    const keyCounts = new Map<string, number>();
    const addKey = (key: string) => {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    };

    for (const key of Object.keys(objectSchema.properties ?? {})) {
      addKey(key);
    }

    objectSchema.allOf.forEach((member, index) => {
      if (!isPropertyOnlyAllOfMember(member)) return;
      const obj = member as JsonSchemaObject;
      const keys = Object.keys(obj.properties ?? {});
      if (keys.length) {
        propertyOnlyKeysByIndex.set(index, keys);
        keys.forEach(addKey);
      }
    });

    for (const [key, count] of keyCounts) {
      if (count > 1) {
        propertyOnlyOverlapKeys.add(key);
      }
    }
  }

  // 1. Process Properties (Base Object)
  const shapeEntries: Array<{
    key: string;
    rep: SchemaRepresentation;
    isGetter?: boolean;
    jsdoc?: string;
  }> = [];

  if (hasProperties) {
    for (const key of allProps) {
      const hasDirectProp = Object.prototype.hasOwnProperty.call(
        objectSchema.properties ?? {},
        key
      );
      const propSchema = hasDirectProp
        ? objectSchema.properties?.[key]
        : collectedProperties?.properties[key];
      const propPath = hasDirectProp
        ? [...refs.path, "properties", key]
        : (collectedProperties?.propertyPaths[key] ?? [...refs.path, "properties", key]);
      const parsedProp =
        propSchema !== undefined
          ? parseSchema(propSchema, { ...refs, path: propPath })
          : anyOrUnknown(refs);

      const hasDefault = typeof propSchema === "object" && propSchema.default !== undefined;
      // Check "required" array from parent
      const isRequired = requiredSet.has(key)
        ? true
        : typeof propSchema === "object" && propSchema.required === true;

      const isOptional = !hasDefault && !isRequired;

      const valueRep = isOptional ? zodExactOptional(parsedProp) : parsedProp;
      const jsdoc =
        refs.withJsdocs &&
        typeof propSchema === "object" &&
        typeof propSchema.description === "string"
          ? expandJsdocs(propSchema.description)
          : undefined;

      const useGetter = shouldUseGetter(
        valueRep,
        refs.currentSchemaName,
        refs.cycleRefNames,
        refs.cycleComponentByName
      );

      shapeEntries.push({
        key,
        rep: valueRep,
        isGetter: useGetter,
        jsdoc,
      });
    }
  }

  const additionalProps = objectSchema.additionalProperties;
  const patternProps = objectSchema.patternProperties || {};
  const patterns = Object.keys(patternProps);
  const hasPattern = patterns.length > 0;

  // Logic to determine if we need manual handling of additionalProperties
  // This is required if we have patternProperties AND additionalProperties is restrictive (false or schema)
  // because Zod's .catchall() or .strict() would incorrectly rejeect/validate pattern-matched keys.
  const isAdPropsRestrictive =
    additionalProps === false || (additionalProps && typeof additionalProps === "object");
  const manualAdditionalProps = hasPattern && isAdPropsRestrictive;

  let addPropsSchema: SchemaRepresentation | undefined;
  let baseObject: SchemaRepresentation;

  if (manualAdditionalProps) {
    baseObject = zodLooseObject(shapeEntries);
    if (typeof additionalProps === "object") {
      addPropsSchema = parseSchema(additionalProps, {
        ...refs,
        path: [...refs.path, "additionalProperties"],
      });
    }
  } else {
    if (additionalProps === false) {
      baseObject = zodStrictObject(shapeEntries);
    } else if (additionalProps && typeof additionalProps === "object") {
      addPropsSchema = parseSchema(additionalProps, {
        ...refs,
        path: [...refs.path, "additionalProperties"],
      });
      baseObject = zodCatchall(zodLooseObject(shapeEntries), addPropsSchema);
    } else {
      baseObject = zodLooseObject(shapeEntries);
    }
  }

  // 3. Handle patternProperties using Intersection with z.looseRecord
  const intersectionMembers: SchemaRepresentation[] = [];

  intersectionMembers.push(baseObject);

  // 3b. Add manual additionalProperties check if needed
  let manualAdditionalRefine: string | undefined;
  let oneOfRefinement: string | undefined;
  if (manualAdditionalProps) {
    const definedProps = objectSchema.properties ? Object.keys(objectSchema.properties) : [];

    manualAdditionalRefine = `(value, ctx) => {
  for (const key in value) {
    if (${JSON.stringify(definedProps)}.includes(key)) continue;
    let matched = false;
    ${patterns.map((p) => `if (new RegExp(${JSON.stringify(p)}).test(key)) matched = true;`).join("\n    ")}
    if (matched) continue;

    ${
      additionalProps === false
        ? `ctx.addIssue({ code: "custom", message: "Invalid key/Strict", path: [...ctx.path, key] });`
        : `const result = ${addPropsSchema!.expression}.safeParse(value[key]);
    if (!result.success) {
        ctx.addIssue({ path: [...ctx.path, key], code: "custom", message: "Invalid additional property", params: { issues: result.error.issues } });
    }`
    }
  }
}`;
  }

  // 4. Handle composition (allOf, oneOf, anyOf) via Intersection

  if (hasPattern) {
    for (const [pattern, schema] of Object.entries(patternProps)) {
      const validSchema = parseSchema(schema, {
        ...refs,
        path: [...refs.path, "patternProperties", pattern],
      });
      const keySchema = zodChain(zodString(), `regex(new RegExp(${JSON.stringify(pattern)}))`);
      const recordRep = zodLooseRecord(keySchema, validSchema);

      intersectionMembers.push(recordRep);
    }
  }

  if (objectSchema.allOf) {
    // Cast because we checked it exists
    const schemaWithAllOf = objectSchema as JsonSchemaObject & { allOf: JsonSchema[] };
    // Note: parseAllOf usually handles the whole schema logic, filtering properties.
    // But typically allOf implies intersection.
    // If we just use simple intersection:
    schemaWithAllOf.allOf.forEach((s, i) => {
      if (isPropertyOnlyAllOfMember(s)) {
        const keys = propertyOnlyKeysByIndex.get(i) ?? [];
        const hasOverlap = keys.some((key) => propertyOnlyOverlapKeys.has(key));
        if (!hasOverlap) {
          return;
        }
      }
      const res = parseSchema(s, { ...refs, path: [...refs.path, "allOf", i] });
      intersectionMembers.push(res);
    });
  }

  if (objectSchema.oneOf) {
    const schemaWithOneOf = objectSchema as JsonSchemaObject & { oneOf: JsonSchema[] };
    const res = parseOneOf(schemaWithOneOf, refs);
    const refinementBody = (res as { refinementBody?: unknown }).refinementBody;
    if (
      "isRefinementOnly" in res &&
      res.isRefinementOnly === true &&
      typeof refinementBody === "string"
    ) {
      oneOfRefinement = refinementBody;
    } else {
      intersectionMembers.push(res);
    }
  }

  if (objectSchema.anyOf) {
    const schemaWithAnyOf = objectSchema as JsonSchemaObject & { anyOf: JsonSchema[] };
    const res = parseAnyOf(schemaWithAnyOf, refs);
    intersectionMembers.push(res);
  }

  // 5. propertyNames, unevaluatedProperties, dependentSchemas etc.
  let result = buildIntersectionTree(intersectionMembers);

  if (manualAdditionalRefine) {
    result = zodSuperRefine(result, manualAdditionalRefine);
  }

  if (oneOfRefinement) {
    result = zodSuperRefine(result, oneOfRefinement);
  }

  if (objectSchema.propertyNames) {
    const normalizedPropNames =
      typeof objectSchema.propertyNames === "object" &&
      objectSchema.propertyNames !== null &&
      !objectSchema.propertyNames.type &&
      (objectSchema.propertyNames as JsonSchemaObject).pattern
        ? { ...(objectSchema.propertyNames as JsonSchemaObject), type: "string" }
        : objectSchema.propertyNames;

    const propNameSchema = parseSchema(normalizedPropNames as JsonSchemaObject, {
      ...refs,
      path: [...refs.path, "propertyNames"],
    });

    result = zodSuperRefine(
      result,
      `(value, ctx) => {
  for (const key in value) {
    const parseResult = ${propNameSchema.expression}.safeParse(key);
    if (!parseResult.success) {
      ctx.addIssue({
        path: [key],
        code: "custom",
        message: "Invalid property name",
        params: { issues: parseResult.error.issues }
      });
    }
  }
}`
    );
  }

  // dependentSchemas
  if (objectSchema.dependentSchemas && typeof objectSchema.dependentSchemas === "object") {
    const entries = Object.entries(objectSchema.dependentSchemas);
    if (entries.length) {
      result = zodSuperRefine(
        result,
        `(obj, ctx) => {
  ${entries
    .map(([key, schema]) => {
      const parsed = parseSchema(schema, {
        ...refs,
        path: [...refs.path, "dependentSchemas", key],
      });
      return `if (Object.prototype.hasOwnProperty.call(obj, ${JSON.stringify(key)})) {
    const parseResult = ${parsed.expression}.safeParse(obj);
    if (!parseResult.success) {
      ctx.addIssue({ code: "custom", message: ${(objectSchema as { errorMessage?: Record<string, string | undefined> }).errorMessage?.dependentSchemas ?? JSON.stringify("Dependent schema failed")}, path: [], params: { issues: parseResult.error.issues } });
    }
  }`;
    })
    .join("\n  ")}
}`
      );
    }
  }

  // dependentRequired
  if (objectSchema.dependentRequired && typeof objectSchema.dependentRequired === "object") {
    const entries = Object.entries(objectSchema.dependentRequired);
    if (entries.length) {
      const depRequiredMessage =
        (objectSchema as { errorMessage?: Record<string, string | undefined> }).errorMessage
          ?.dependentRequired ?? "Dependent required properties missing";
      result = zodSuperRefine(
        result,
        `(obj, ctx) => {
  ${entries
    .map(([prop, deps]) => {
      const arr = Array.isArray(deps) ? deps : [];
      if (!arr.length) return "";
      const jsonDeps = JSON.stringify(arr);
      return `if (Object.prototype.hasOwnProperty.call(obj, ${JSON.stringify(prop)})) {
    const missing = ${jsonDeps}.filter((d) => !Object.prototype.hasOwnProperty.call(obj, d));
    if (missing.length) {
      ctx.addIssue({ code: "custom", message: ${JSON.stringify(
        depRequiredMessage
      )}, path: [], params: { missing } });
    }
  }`;
    })
    .filter(Boolean)
    .join("\n  ")}
}`
      );
    }
  }

  return result;
}
