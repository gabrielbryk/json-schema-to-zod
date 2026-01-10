import { JsonSchemaObject, Refs, SchemaRepresentation } from "../Types.js";
import { withMessage } from "../utils/withMessage.js";
import { parseSchema } from "./parseSchema.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";
import { zodArray, zodChain, zodSuperRefine, zodTuple } from "../utils/schemaRepresentation.js";

export const parseArray = (
  schema: JsonSchemaObject & { type: "array" },
  refs: Refs
): SchemaRepresentation => {
  // JSON Schema 2020-12 uses `prefixItems` for tuples.
  // Older drafts used `items` as an array.
  const prefixItems =
    schema.prefixItems || (Array.isArray(schema.items) ? schema.items : undefined);

  if (prefixItems) {
    // Tuple case
    const itemResults = prefixItems.map((v, i) =>
      parseSchema(v, { ...refs, path: [...refs.path, "prefixItems", i] })
    );

    // Handle "additionalItems" (older drafts) or "items" (2020-12 when prefixItems is used)
    // If prefixItems is present, `items` acts as the schema for additional items.
    // If prefixItems came from `items` (array form), then `additionalItems` controls the rest.
    const additionalSchema = schema.prefixItems ? schema.items : schema.additionalItems;
    let rest: SchemaRepresentation | null;

    if (additionalSchema === false) {
      // Closed tuple
      rest = null;
    } else if (additionalSchema) {
      rest =
        additionalSchema === true
          ? anyOrUnknown(refs)
          : parseSchema(additionalSchema as JsonSchemaObject, {
              ...refs,
              path: [...refs.path, "items"],
            });
    } else {
      // Open by default
      rest = anyOrUnknown(refs);
    }

    let result = zodTuple(itemResults, rest);

    if (schema.contains) {
      const containsResult = parseSchema(schema.contains, {
        ...refs,
        path: [...refs.path, "contains"],
      });
      const minContains = schema.minContains ?? (schema.contains ? 1 : undefined);
      const maxContains = schema.maxContains;

      result = zodSuperRefine(
        result,
        `(arr, ctx) => {
  const matches = arr.filter((item) => ${containsResult.expression}.safeParse(item).success).length;
  if (${minContains ?? 0} && matches < ${minContains ?? 0}) {
    ctx.addIssue({ code: "custom", message: "Array contains too few matching items" });
  }
  if (${maxContains ?? "undefined"} !== undefined && matches > ${maxContains ?? "undefined"}) {
    ctx.addIssue({ code: "custom", message: "Array contains too many matching items" });
  }
}`
      );
    }

    return result;
  }

  // Regular Array case
  const itemsSchema = schema.items;

  const anyOrUnknownResult = anyOrUnknown(refs);
  const itemResult =
    !itemsSchema || itemsSchema === true
      ? anyOrUnknownResult
      : parseSchema(itemsSchema as JsonSchemaObject, {
          ...refs,
          path: [...refs.path, "items"],
        });

  let result = zodArray(itemResult);

  const minItems = withMessage(schema, "minItems", ({ json }) => ({
    opener: `.min(${json}`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));
  if (minItems) {
    result = zodChain(result, minItems.slice(1));
  }

  const maxItems = withMessage(schema, "maxItems", ({ json }) => ({
    opener: `.max(${json}`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));
  if (maxItems) {
    result = zodChain(result, maxItems.slice(1));
  }

  if (schema.uniqueItems === true) {
    result = zodSuperRefine(
      result,
      `(arr, ctx) => {
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
}`
    );
  }

  if (schema.contains) {
    const containsResult = parseSchema(schema.contains, {
      ...refs,
      path: [...refs.path, "contains"],
    });

    const minContains = schema.minContains ?? (schema.contains ? 1 : undefined);
    const maxContains = schema.maxContains;

    result = zodSuperRefine(
      result,
      `(arr, ctx) => {
  const matches = arr.filter((item) => ${containsResult.expression}.safeParse(item).success).length;
  if (${minContains ?? 0} && matches < ${minContains ?? 0}) {
    ctx.addIssue({ code: "custom", message: "Array contains too few matching items" });
  }
  if (${maxContains ?? "undefined"} !== undefined && matches > ${maxContains ?? "undefined"}) {
    ctx.addIssue({ code: "custom", message: "Array contains too many matching items" });
  }
}`
    );
  }

  return result;
};
