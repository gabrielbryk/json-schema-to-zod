import { parseSchema } from "./parseSchema.js";
import { half } from "../utils/half.js";
import { JsonSchemaObject, JsonSchema, Refs } from "../Types.js";

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
): string {
  if (schema.allOf.length === 0) {
    return "z.never()";
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

    return `z.intersection(${parseAllOf({ allOf: left }, refs)}, ${parseAllOf(
      {
        allOf: right,
      },
      refs,
    )})`;
  }
}
