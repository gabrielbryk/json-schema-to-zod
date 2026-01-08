import { JsonSchema, JsonSchemaObject, Refs, SchemaRepresentation } from "../Types.js";
import { parseAnyOf } from "./parseAnyOf.js";
import { parseOneOf } from "./parseOneOf.js";
import { parseSchema } from "./parseSchema.js";

import { addJsdocs } from "../utils/jsdocs.js";

export function parseObject(
  objectSchema: JsonSchemaObject & { type: "object" },
  refs: Refs
): SchemaRepresentation {
  const explicitProps = objectSchema.properties ? Object.keys(objectSchema.properties) : [];
  const requiredProps = Array.isArray(objectSchema.required) ? objectSchema.required : [];
  const allProps = [...new Set([...explicitProps, ...requiredProps])];
  const hasProperties = allProps.length > 0;

  // 1. Process Properties (Base Object)
  let baseObjectExpr = "z.object({";
  const propertyTypes: Array<{ key: string; type: string }> = [];

  if (hasProperties) {
    baseObjectExpr += allProps
      .map((key) => {
        const propSchema = objectSchema.properties?.[key];
        const parsedProp = propSchema
          ? parseSchema(propSchema, { ...refs, path: [...refs.path, "properties", key] })
          : { expression: "z.any()", type: "z.ZodAny" };

        const hasDefault = typeof propSchema === "object" && propSchema.default !== undefined;
        // Check "required" array from parent
        const isRequired = Array.isArray(objectSchema.required)
          ? objectSchema.required.includes(key)
          : typeof propSchema === "object" && propSchema.required === true;

        const isOptional = !hasDefault && !isRequired;

        let valueExpr = parsedProp.expression;
        let valueType = parsedProp.type;
        if (isOptional) {
          valueExpr = `${parsedProp.expression}.exactOptional()`;
          valueType = `z.ZodExactOptional<${parsedProp.type}>`;
        }

        propertyTypes.push({ key, type: valueType });

        if (refs.withJsdocs && typeof propSchema === "object") {
          valueExpr = addJsdocs(propSchema, valueExpr);
        }

        return `${JSON.stringify(key)}: ${valueExpr}`;
      })
      .join(", ");
  }
  baseObjectExpr += "})";

  const additionalProps = objectSchema.additionalProperties;
  let baseObjectModified = baseObjectExpr;
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

  if (manualAdditionalProps) {
    baseObjectModified = baseObjectExpr.replace(/^z\.object\(/, "z.looseObject(");
    if (typeof additionalProps === "object") {
      addPropsSchema = parseSchema(additionalProps, {
        ...refs,
        path: [...refs.path, "additionalProperties"],
      });
    }
  } else {
    if (additionalProps === false) {
      baseObjectModified = baseObjectExpr.replace(/^z\.object\(/, "z.strictObject(");
    } else if (additionalProps && typeof additionalProps === "object") {
      addPropsSchema = parseSchema(additionalProps, {
        ...refs,
        path: [...refs.path, "additionalProperties"],
      });
      baseObjectModified = baseObjectExpr.replace(/^z\.object\(/, "z.looseObject(");
      baseObjectModified += `.catchall(${addPropsSchema.expression})`;
    } else {
      baseObjectModified = baseObjectExpr.replace(/^z\.object\(/, "z.looseObject(");
    }
  }

  // 3. Handle patternProperties using Intersection with z.looseRecord
  let finalExpr = baseObjectModified;
  const intersectionTypes: string[] = [];

  if (hasPattern) {
    for (const [pattern, schema] of Object.entries(patternProps)) {
      const validSchema = parseSchema(schema, {
        ...refs,
        path: [...refs.path, "patternProperties", pattern],
      });
      const keySchema = `z.string().regex(new RegExp(${JSON.stringify(pattern)}))`;
      const recordExpr = `z.looseRecord(${keySchema}, ${validSchema.expression})`;

      finalExpr = `z.intersection(${finalExpr}, ${recordExpr})`;
      intersectionTypes.push(`z.ZodRecord<z.ZodString, ${validSchema.type}>`);
    }
  }

  // 3b. Add manual additionalProperties check if needed
  if (manualAdditionalProps) {
    const definedProps = objectSchema.properties ? Object.keys(objectSchema.properties) : [];

    finalExpr += `.superRefine((value, ctx) => {
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
})`;
  }

  // 4. Handle composition (allOf, oneOf, anyOf) via Intersection

  if (objectSchema.allOf) {
    // Cast because we checked it exists
    const schemaWithAllOf = objectSchema as JsonSchemaObject & { allOf: JsonSchema[] };
    // Note: parseAllOf usually handles the whole schema logic, filtering properties.
    // But typically allOf implies intersection.
    // If we just use simple intersection:
    schemaWithAllOf.allOf.forEach((s, i) => {
      const res = parseSchema(s, { ...refs, path: [...refs.path, "allOf", i] });
      finalExpr = `z.intersection(${finalExpr}, ${res.expression})`;
      intersectionTypes.push(res.type);
    });
  }

  if (objectSchema.oneOf) {
    const schemaWithOneOf = objectSchema as JsonSchemaObject & { oneOf: JsonSchema[] };
    const res = parseOneOf(schemaWithOneOf, refs);
    finalExpr = `z.intersection(${finalExpr}, ${res.expression})`;
    intersectionTypes.push(res.type);
  }

  if (objectSchema.anyOf) {
    const schemaWithAnyOf = objectSchema as JsonSchemaObject & { anyOf: JsonSchema[] };
    const res = parseAnyOf(schemaWithAnyOf, refs);
    finalExpr = `z.intersection(${finalExpr}, ${res.expression})`;
    intersectionTypes.push(res.type);
  }

  // 5. propertyNames, unevaluatedProperties, dependentSchemas etc.

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

    finalExpr += `.superRefine((value, ctx) => {
  for (const key in value) {
    const result = ${propNameSchema.expression}.safeParse(key);
    if (!result.success) {
      ctx.addIssue({
        path: [key],
        code: "custom",
        message: "Invalid property name",
        params: { issues: result.error.issues }
      });
    }
  }
})`;
  }

  // dependentSchemas
  if (objectSchema.dependentSchemas && typeof objectSchema.dependentSchemas === "object") {
    const entries = Object.entries(objectSchema.dependentSchemas);
    if (entries.length) {
      finalExpr += `.superRefine((obj, ctx) => {
  ${entries
    .map(([key, schema]) => {
      const parsed = parseSchema(schema, {
        ...refs,
        path: [...refs.path, "dependentSchemas", key],
      });
      return `if (Object.prototype.hasOwnProperty.call(obj, ${JSON.stringify(key)})) {
    const result = ${parsed.expression}.safeParse(obj);
    if (!result.success) {
      ctx.addIssue({ code: "custom", message: ${(objectSchema as { errorMessage?: Record<string, string | undefined> }).errorMessage?.dependentSchemas ?? JSON.stringify("Dependent schema failed")}, path: [], params: { issues: result.error.issues } });
    }
  }`;
    })
    .join("\n  ")}
})`;
    }
  }

  // dependentRequired
  if (objectSchema.dependentRequired && typeof objectSchema.dependentRequired === "object") {
    const entries = Object.entries(objectSchema.dependentRequired);
    if (entries.length) {
      const depRequiredMessage =
        (objectSchema as { errorMessage?: Record<string, string | undefined> }).errorMessage
          ?.dependentRequired ?? "Dependent required properties missing";
      finalExpr += `.superRefine((obj, ctx) => {
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
})`;
    }
  }

  // Calculate Type
  let type = "z.ZodObject<any>";
  if (propertyTypes.length) {
    const shape = propertyTypes.map((p) => `${JSON.stringify(p.key)}: ${p.type}`).join("; ");
    type = `z.ZodObject<{${shape}}>`;
  }

  // If intersections
  intersectionTypes.forEach((t) => {
    type = `z.ZodIntersection<${type}, ${t}>`;
  });

  return {
    expression: finalExpr,
    type,
  };
}
