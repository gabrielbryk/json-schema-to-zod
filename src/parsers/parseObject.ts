import { JsonSchemaObject, Refs } from "../Types.js";
import { parseAnyOf } from "./parseAnyOf.js";
import { parseOneOf } from "./parseOneOf.js";
import { its, parseSchema } from "./parseSchema.js";
import { parseAllOf } from "./parseAllOf.js";
import { parseIfThenElse } from "./parseIfThenElse.js";
import { addJsdocs } from "../utils/jsdocs.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";

export function parseObject(
  objectSchema: JsonSchemaObject & { type: "object" },
  refs: Refs,
): string {
  let properties: string | undefined = undefined;

  if (objectSchema.properties) {
    if (!Object.keys(objectSchema.properties).length) {
      properties = "z.object({})";
    } else {
      properties = "z.object({ ";

      properties += Object.keys(objectSchema.properties)
        .map((key) => {
          const propSchema = objectSchema.properties![key];

          const parsedProp = parseSchema(propSchema, {
            ...refs,
            path: [...refs.path, "properties", key],
          });

          const hasDefault =
            typeof propSchema === "object" && propSchema.default !== undefined;

          const required = Array.isArray(objectSchema.required)
            ? objectSchema.required.includes(key)
            : typeof propSchema === "object" && propSchema.required === true;

          const optional = !hasDefault && !required;

          const valueWithOptional = optional
            ? `${parsedProp}.optional()`
            : parsedProp;

          let result = shouldUseGetter(valueWithOptional, refs)
            ? `get ${JSON.stringify(key)}(){ return ${valueWithOptional} }`
            : `${JSON.stringify(key)}: ${valueWithOptional}`;

          if (refs.withJsdocs && typeof propSchema === "object") {
            result = addJsdocs(propSchema, result)
          }

          return result;
        })
        .join(", ");

      properties += " })";
    }
  }

  const additionalProperties =
    objectSchema.additionalProperties !== undefined
      ? parseSchema(objectSchema.additionalProperties, {
          ...refs,
          path: [...refs.path, "additionalProperties"],
        })
      : undefined;

  const unevaluated = objectSchema.unevaluatedProperties;

  let patternProperties: string | undefined = undefined;

  if (objectSchema.patternProperties) {
    const parsedPatternProperties = Object.fromEntries(
      Object.entries(objectSchema.patternProperties).map(([key, value]) => {
        return [
          key,
          parseSchema(value, {
            ...refs,
            path: [...refs.path, "patternProperties", key],
          }),
        ];
      }, {}),
    );

    patternProperties = "";

    if (properties) {
      if (additionalProperties) {
        patternProperties += `.catchall(z.union([${[
          ...Object.values(parsedPatternProperties),
          additionalProperties,
        ].join(", ")}]))`;
      } else if (Object.keys(parsedPatternProperties).length > 1) {
        patternProperties += `.catchall(z.union([${Object.values(
          parsedPatternProperties,
        ).join(", ")}]))`;
      } else {
        patternProperties += `.catchall(${Object.values(
          parsedPatternProperties,
        )})`;
      }
    } else {
      if (additionalProperties) {
        patternProperties += `z.record(z.string(), z.union([${[
          ...Object.values(parsedPatternProperties),
          additionalProperties,
        ].join(", ")}]))`;
      } else if (Object.keys(parsedPatternProperties).length > 1) {
        patternProperties += `z.record(z.string(), z.union([${Object.values(
          parsedPatternProperties,
        ).join(", ")}]))`;
      } else {
        patternProperties += `z.record(z.string(), ${Object.values(
          parsedPatternProperties,
        )})`;
      }
    }

    patternProperties += ".superRefine((value, ctx) => {\n";

    patternProperties += "for (const key in value) {\n";

    if (additionalProperties) {
      if (objectSchema.properties) {
        patternProperties += `let evaluated = [${Object.keys(
          objectSchema.properties,
        )
          .map((key) => JSON.stringify(key))
          .join(", ")}].includes(key)\n`;
      } else {
        patternProperties += `let evaluated = false\n`;
      }
    }

    for (const key in objectSchema.patternProperties) {
      patternProperties +=
        "if (key.match(new RegExp(" + JSON.stringify(key) + "))) {\n";
      if (additionalProperties) {
        patternProperties += "evaluated = true\n";
      }
      patternProperties +=
        "const result = " +
        parsedPatternProperties[key] +
        ".safeParse(value[key])\n";
      patternProperties += "if (!result.success) {\n";

      patternProperties += `ctx.addIssue({
          path: [...(ctx.path ?? []), key],
          code: 'custom',
          message: \`Invalid input: Key matching regex /\${key}/ must match schema\`,
          params: {
            issues: result.error.issues
          }
        })\n`;

      patternProperties += "}\n";
      patternProperties += "}\n";
    }

    if (additionalProperties) {
      patternProperties += "if (!evaluated) {\n";
      patternProperties +=
        "const result = " + additionalProperties + ".safeParse(value[key])\n";
      patternProperties += "if (!result.success) {\n";

      patternProperties += `ctx.addIssue({
          path: [...(ctx.path ?? []), key],
          code: 'custom',
          message: \`Invalid input: must match catchall schema\`,
          params: {
            issues: result.error.issues
          }
        })\n`;

      patternProperties += "}\n";
      patternProperties += "}\n";
    }
    patternProperties += "}\n";
    patternProperties += "})";

    // Store original patternProperties in meta for JSON Schema round-trip
    if (refs.preserveJsonSchemaForRoundTrip) {
      const patternPropsJson = JSON.stringify(
        Object.fromEntries(
          Object.entries(objectSchema.patternProperties).map(([pattern, schema]) => [
            pattern,
            schema
          ])
        )
      );
      patternProperties += `.meta({ __jsonSchema: { patternProperties: ${patternPropsJson} } })`;
    }
  }

  // Check if there will be an .and() call that adds properties from oneOf/anyOf/allOf/if-then-else
  // In that case, we should NOT use .strict() because it will reject the additional keys
  // before the union gets a chance to validate them.
  const hasCompositionKeywords = its.an.anyOf(objectSchema) || its.a.oneOf(objectSchema) || its.an.allOf(objectSchema) || its.a.conditional(objectSchema);

  let output = properties
    ? patternProperties
      ? properties + patternProperties
      : additionalProperties
        ? additionalProperties === "z.never()"
          // Don't use .strict() if there are composition keywords that add properties
          ? hasCompositionKeywords
            ? properties
            : properties + ".strict()"
          : properties + `.catchall(${additionalProperties})`
        : properties
    : patternProperties
      ? patternProperties
      : additionalProperties
        ? `z.record(z.string(), ${additionalProperties})`
        : `z.record(z.string(), ${anyOrUnknown(refs)})`;

  if (unevaluated === false && properties && !hasCompositionKeywords) {
    output += ".strict()";
  } else if (unevaluated && typeof unevaluated !== 'boolean') {
    const unevaluatedSchema = parseSchema(unevaluated, {
      ...refs,
      path: [...refs.path, "unevaluatedProperties"],
    });

    const knownKeys = objectSchema.properties ? Object.keys(objectSchema.properties) : [];
    const patterns = objectSchema.patternProperties
      ? Object.keys(objectSchema.patternProperties).map((p) => new RegExp(p))
      : [];

    output += `.superRefine((value, ctx) => {
  for (const key in value) {
    const isKnown = ${JSON.stringify(knownKeys)}.includes(key);
    const matchesPattern = ${patterns.length ? "[" + patterns.map((r) => r.toString()).join(",") + "]" : "[]"}.some((r) => r.test(key));
    if (!isKnown && !matchesPattern) {
      const result = ${unevaluatedSchema}.safeParse(value[key]);
      if (!result.success) {
        ctx.addIssue({ code: "custom", path: [key], message: "Invalid unevaluated property", params: { issues: result.error.issues } });
      }
    }
  }
})`;
  }

  if (its.an.anyOf(objectSchema)) {
    output += `.and(${parseAnyOf(
      {
        ...objectSchema,
        anyOf: objectSchema.anyOf.map((x) =>
          typeof x === "object" &&
          x !== null &&
          !x.type &&
          ((x as JsonSchemaObject).properties || (x as JsonSchemaObject).additionalProperties || (x as JsonSchemaObject).patternProperties)
            ? { ...(x as JsonSchemaObject), type: "object" }
            : x,
        ),
      },
      refs,
    )})`;
  }

  if (its.a.oneOf(objectSchema)) {
    output += `.and(${parseOneOf(
      {
        ...objectSchema,
        oneOf: objectSchema.oneOf.map((x) =>
          typeof x === "object" &&
          x !== null &&
          !x.type &&
          ((x as JsonSchemaObject).properties || (x as JsonSchemaObject).additionalProperties || (x as JsonSchemaObject).patternProperties)
            ? { ...(x as JsonSchemaObject), type: "object" }
            : x,
        ),
      },
      refs,
    )})`;
  }

  if (its.an.allOf(objectSchema)) {
    output += `.and(${parseAllOf(
      {
        ...objectSchema,
        allOf: objectSchema.allOf.map((x) =>
          typeof x === "object" &&
          x !== null &&
          !x.type &&
          ((x as JsonSchemaObject).properties || (x as JsonSchemaObject).additionalProperties || (x as JsonSchemaObject).patternProperties)
            ? { ...(x as JsonSchemaObject), type: "object" }
            : x,
        ),
      },
      refs,
    )})`;
  }

  // Handle if/then/else conditionals on object schemas
  if (its.a.conditional(objectSchema)) {
    output += `.and(${parseIfThenElse(
      objectSchema as Parameters<typeof parseIfThenElse>[0],
      refs,
    )})`;
  }

  // propertyNames
  if (objectSchema.propertyNames) {
    const normalizedPropNames =
      typeof objectSchema.propertyNames === "object" &&
      objectSchema.propertyNames !== null &&
      !objectSchema.propertyNames.type &&
      (objectSchema.propertyNames as JsonSchemaObject).pattern
        ? { ...(objectSchema.propertyNames as JsonSchemaObject), type: "string" }
        : objectSchema.propertyNames;

    const propNameSchema = parseSchema(normalizedPropNames, {
      ...refs,
      path: [...refs.path, "propertyNames"],
    });

    output += `.superRefine((value, ctx) => {
  for (const key in value) {
    const result = ${propNameSchema}.safeParse(key);
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
      output += `.superRefine((obj, ctx) => {
  ${entries
    .map(([key, schema]) => {
      const parsed = parseSchema(schema, { ...refs, path: [...refs.path, "dependentSchemas", key] });
      return `if (Object.prototype.hasOwnProperty.call(obj, ${JSON.stringify(key)})) {
    const result = ${parsed}.safeParse(obj);
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
        (objectSchema as { errorMessage?: Record<string, string | undefined> }).errorMessage?.dependentRequired ??
        "Dependent required properties missing";
      output += `.superRefine((obj, ctx) => {
  ${entries
    .map(([prop, deps]) => {
      const arr = Array.isArray(deps) ? deps : [];
      if (!arr.length) return "";
      const jsonDeps = JSON.stringify(arr);
      return `if (Object.prototype.hasOwnProperty.call(obj, ${JSON.stringify(prop)})) {
    const missing = ${jsonDeps}.filter((d) => !Object.prototype.hasOwnProperty.call(obj, d));
    if (missing.length) {
      ctx.addIssue({ code: "custom", message: ${JSON.stringify(
        depRequiredMessage,
      )}, path: [], params: { missing } });
    }
  }`;
    })
    .filter(Boolean)
    .join("\n  ")}
})`;
    }
  }

  return output;
}

const shouldUseGetter = (parsed: string, refs: Refs): boolean => {
  if (!parsed) return false;

  if (refs.currentSchemaName && parsed.includes(refs.currentSchemaName)) {
    return true;
  }

  if (refs.cycleRefNames?.has(parsed)) {
    return true;
  }

  return Boolean(refs.inProgress && refs.inProgress.has(parsed));
};
