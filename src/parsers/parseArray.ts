import { JsonSchemaObject, Refs } from "../Types.js";
import { withMessage } from "../utils/withMessage.js";
import { parseSchema } from "./parseSchema.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";

export const parseArray = (
  schema: JsonSchemaObject & { type: "array" },
  refs: Refs,
) => {
  if (Array.isArray(schema.items)) {
    let tuple = `z.tuple([${schema.items.map((v, i) =>
      parseSchema(v, { ...refs, path: [...refs.path, "items", i] }),
    )}])`;

    if (schema.contains) {
      const containsSchema = parseSchema(schema.contains, {
        ...refs,
        path: [...refs.path, "contains"],
      });
      const minContains = schema.minContains ?? (schema.contains ? 1 : undefined);
      const maxContains = schema.maxContains;

      tuple += `.superRefine((arr, ctx) => {
  const matches = arr.filter((item) => ${containsSchema}.safeParse(item).success).length;
  if (${minContains ?? 0} && matches < ${minContains ?? 0}) {
    ctx.addIssue({ code: "custom", message: "Array contains too few matching items" });
  }
  if (${maxContains ?? "undefined"} !== undefined && matches > ${maxContains ?? "undefined"}) {
    ctx.addIssue({ code: "custom", message: "Array contains too many matching items" });
  }
})`;
    }

    return tuple;
  }

  let r = !schema.items
    ? `z.array(${anyOrUnknown(refs)})`
    : `z.array(${parseSchema(schema.items, {
        ...refs,
        path: [...refs.path, "items"],
      })})`;

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
    const containsSchema = parseSchema(schema.contains, {
      ...refs,
      path: [...refs.path, "contains"],
    });

    const minContains = schema.minContains ?? (schema.contains ? 1 : undefined);
    const maxContains = schema.maxContains;

    r += `.superRefine((arr, ctx) => {
  const matches = arr.filter((item) => ${containsSchema}.safeParse(item).success).length;
  if (${minContains ?? 0} && matches < ${minContains ?? 0}) {
    ctx.addIssue({ code: "custom", message: "Array contains too few matching items" });
  }
  if (${maxContains ?? "undefined"} !== undefined && matches > ${maxContains ?? "undefined"}) {
    ctx.addIssue({ code: "custom", message: "Array contains too many matching items" });
  }
})`;
  }
  
  return r;
};
