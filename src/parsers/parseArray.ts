import { JsonSchemaObject, Refs, SchemaRepresentation } from "../Types.js";
import { withMessage } from "../utils/withMessage.js";
import { parseSchema } from "./parseSchema.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";

export const parseArray = (
  schema: JsonSchemaObject & { type: "array" },
  refs: Refs,
): SchemaRepresentation => {
  // JSON Schema 2020-12 uses `prefixItems` for tuples.
  // Older drafts used `items` as an array.
  const prefixItems = schema.prefixItems || (Array.isArray(schema.items) ? schema.items : undefined);

  if (prefixItems) {
    // Tuple case
    const itemResults = prefixItems.map((v, i) =>
      parseSchema(v, { ...refs, path: [...refs.path, "prefixItems", i] }),
    );

    let tuple = `z.tuple([${itemResults.map(r => r.expression).join(", ")}])`;
    // We construct the type manually for the tuple part
    let tupleTypes = itemResults.map(r => r.type).join(", ");
    let tupleType = `z.ZodTuple<[${tupleTypes}], null>`; // Default null rest

    // Handle "additionalItems" (older drafts) or "items" (2020-12 when prefixItems is used)
    // If prefixItems is present, `items` acts as the schema for additional items.
    // If prefixItems came from `items` (array form), then `additionalItems` controls the rest.
    const additionalSchema = schema.prefixItems ? schema.items : schema.additionalItems;

    if (additionalSchema === false) {
      // Closed tuple
    } else if (additionalSchema) {
      const restSchema = (additionalSchema === true)
        ? anyOrUnknown(refs)
        : parseSchema(additionalSchema as JsonSchemaObject, { ...refs, path: [...refs.path, "items"] });

      tuple += `.rest(${restSchema.expression})`;
      tupleType = `z.ZodTuple<[${tupleTypes}], ${restSchema.type}>`;
    } else {
      // Open by default
      const anyRes = anyOrUnknown(refs);
      tuple += `.rest(${anyRes.expression})`;
      tupleType = `z.ZodTuple<[${tupleTypes}], ${anyRes.type}>`;
    }

    if (schema.contains) {
      const containsResult = parseSchema(schema.contains, {
        ...refs,
        path: [...refs.path, "contains"],
      });
      const minContains = schema.minContains ?? (schema.contains ? 1 : undefined);
      const maxContains = schema.maxContains;

      tuple += `.superRefine((arr, ctx) => {
  const matches = arr.filter((item) => ${containsResult.expression}.safeParse(item).success).length;
  if (${minContains ?? 0} && matches < ${minContains ?? 0}) {
    ctx.addIssue({ code: "custom", message: "Array contains too few matching items" });
  }
  if (${maxContains ?? "undefined"} !== undefined && matches > ${maxContains ?? "undefined"}) {
    ctx.addIssue({ code: "custom", message: "Array contains too many matching items" });
  }
})`;
    }

    return {
      expression: tuple,
      type: tupleType,
    };
  }

  // Regular Array case
  const itemsSchema = schema.items;

  const anyOrUnknownResult = anyOrUnknown(refs);
  const itemResult = (!itemsSchema || itemsSchema === true)
    ? anyOrUnknownResult
    : parseSchema(itemsSchema as JsonSchemaObject, {
      ...refs,
      path: [...refs.path, "items"],
    });

  let r = `z.array(${itemResult.expression})`;
  let arrayType = `z.ZodArray<${itemResult.type}>`;

  r += withMessage(schema, "minItems", ({ json }) => ({
    opener: `.min(${json}`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));

  r += withMessage(schema, "maxItems", ({ json }) => ({
    opener: `.max(${json}`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));

  if (schema.uniqueItems === true) {
    r += `.superRefine((arr, ctx) => {
  const seen = new Set();
  for (const [index, value] of arr.entries()) {
    let key;
    if (value && typeof value === "object") {
      try {
        key = JSON.stringify(value);
      } catch {
        key = String(value);
      }
    } else {
      key = JSON.stringify(value);
    }

    if (seen.has(key)) {
      ctx.addIssue({ code: "custom", message: "Array items must be unique", path: [index] });
      return;
    }

    seen.add(key);
  }
})`;
  }

  if (schema.contains) {
    const containsResult = parseSchema(schema.contains, {
      ...refs,
      path: [...refs.path, "contains"],
    });

    const minContains = schema.minContains ?? (schema.contains ? 1 : undefined);
    const maxContains = schema.maxContains;

    r += `.superRefine((arr, ctx) => {
  const matches = arr.filter((item) => ${containsResult.expression}.safeParse(item).success).length;
  if (${minContains ?? 0} && matches < ${minContains ?? 0}) {
    ctx.addIssue({ code: "custom", message: "Array contains too few matching items" });
  }
  if (${maxContains ?? "undefined"} !== undefined && matches > ${maxContains ?? "undefined"}) {
    ctx.addIssue({ code: "custom", message: "Array contains too many matching items" });
  }
})`;
  }

  return {
    expression: r,
    type: arrayType,
  };
};
