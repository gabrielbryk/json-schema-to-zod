import { JsonSchemaObject, Refs, SchemaRepresentation } from "../Types.js";
import { withMessage } from "../utils/withMessage.js";
import { parseSchema } from "./parseSchema.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";

export const parseArray = (
  schema: JsonSchemaObject & { type: "array" },
  refs: Refs,
): SchemaRepresentation => {
  if (Array.isArray(schema.items)) {
    // Tuple case
    const itemResults = schema.items.map((v, i) =>
      parseSchema(v, { ...refs, path: [...refs.path, "items", i] }),
    );

    let tuple = `z.tuple([${itemResults.map(r => r.expression).join(", ")}])`;
    const tupleTypes = itemResults.map(r => r.type).join(", ");
    let tupleType = `z.ZodTuple<[${tupleTypes}]>`;

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
      // In Zod v4, .superRefine() doesn't change the type
    }

    return {
      expression: tuple,
      type: tupleType,
    };
  }

  // Array case
  const anyOrUnknownResult = anyOrUnknown(refs);
  const itemResult = !schema.items
    ? anyOrUnknownResult
    : parseSchema(schema.items, {
        ...refs,
        path: [...refs.path, "items"],
      });

  let r = `z.array(${itemResult.expression})`;
  let arrayType = `z.ZodArray<${itemResult.type}>`;

  r += withMessage(schema, "minItems", ({ json }) => ({
    opener: `.min(${json}`,
    closer: ")",
    messagePrefix: ", { error: ",
    messageCloser: " })",
  }));

  r += withMessage(schema, "maxItems", ({ json }) => ({
    opener: `.max(${json}`,
    closer: ")",
    messagePrefix: ", { error: ",
    messageCloser: " })",
  }));

  let hasRefinement = false;

  if (schema.uniqueItems === true) {
    hasRefinement = true;
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
    hasRefinement = true;
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

  // In Zod v4, .superRefine() doesn't change the type, so no wrapping needed

  return {
    expression: r,
    type: arrayType,
  };
};
