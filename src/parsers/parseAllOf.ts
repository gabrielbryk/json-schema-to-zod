import { parseSchema } from "./parseSchema.js";
import { half } from "../utils/half.js";
import { JsonSchemaObject, JsonSchema, Refs } from "../Types.js";

const originalIndex = Symbol("Original index");

const ensureOriginalIndex = (arr: JsonSchema[]) => {
  const newArr: JsonSchemaObject[] = [];

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (typeof item === "boolean") {
      newArr.push(
        item ? { [originalIndex]: i } : { [originalIndex]: i, not: {} },
      );
    } else if (typeof item === "object" && item !== null && originalIndex in item) {
      return arr as JsonSchemaObject[];
    } else {
      newArr.push({ ...(item as JsonSchemaObject), [originalIndex]: i });
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
      path: [...refs.path, "allOf", (item as JsonSchemaObject)[originalIndex] ?? 0],
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
