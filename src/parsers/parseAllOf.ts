import { parseSchema } from "./parseSchema.js";
import { half } from "../utils/half.js";
import { JsonSchemaObject, JsonSchema, Refs, SchemaRepresentation } from "../Types.js";

const originalIndexKey = "__originalIndex";

const ensureOriginalIndex = (arr: JsonSchema[]) => {
  const newArr: (JsonSchemaObject & { [originalIndexKey]: number })[] = [];

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (typeof item === "boolean") {
      newArr.push(
        item ? { [originalIndexKey]: i } : { [originalIndexKey]: i, not: {} },
      );
    } else if (
      typeof item === "object" &&
      item !== null &&
      originalIndexKey in item
    ) {
      return arr as (JsonSchemaObject & { [originalIndexKey]: number })[];
    } else {
      newArr.push({ ...(item as JsonSchemaObject), [originalIndexKey]: i });
    }
  }

  return newArr;
};

export function parseAllOf(
  schema: JsonSchemaObject & { allOf: JsonSchema[] },
  refs: Refs,
): SchemaRepresentation {
  if (schema.allOf.length === 0) {
    return { expression: "z.never()", type: "z.ZodNever" };
  } else if (schema.allOf.length === 1) {
    const item = schema.allOf[0];

    return parseSchema(item, {
      ...refs,
      path: [
        ...refs.path,
        "allOf",
        (item as JsonSchemaObject & { [originalIndexKey]?: number })[
          originalIndexKey
        ] ?? 0,
      ],
    });
  } else {
    const [left, right] = half(ensureOriginalIndex(schema.allOf));

    const leftResult = parseAllOf({ allOf: left }, refs);
    const rightResult = parseAllOf({ allOf: right }, refs);

    return {
      expression: `z.intersection(${leftResult.expression}, ${rightResult.expression})`,
      type: `z.ZodIntersection<${leftResult.type}, ${rightResult.type}>`,
    };
  }
}
