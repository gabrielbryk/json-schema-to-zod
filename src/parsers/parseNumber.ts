import { JsonSchemaObject, SchemaRepresentation } from "../Types.js";
import { withMessage } from "../utils/withMessage.js";
import { zodCall, zodChain, zodNumber } from "../utils/schemaRepresentation.js";

export const parseNumber = (
  schema: JsonSchemaObject & { type: "number" | "integer" }
): SchemaRepresentation => {
  const formatMessage = schema.errorMessage?.format;
  const formatParams = formatMessage ? `{ message: ${JSON.stringify(formatMessage)} }` : undefined;

  const formatMap: Record<string, { callee: string; type: string }> = {
    int32: { callee: "z.int32", type: "z.ZodNumber" },
    uint32: { callee: "z.uint32", type: "z.ZodNumber" },
    float32: { callee: "z.float32", type: "z.ZodNumber" },
    float64: { callee: "z.float64", type: "z.ZodNumber" },
    safeint: { callee: "z.safeint", type: "z.ZodNumber" },
    int64: { callee: "z.int64", type: "z.ZodBigInt" },
    uint64: { callee: "z.uint64", type: "z.ZodBigInt" },
  };

  let result =
    schema.format && formatMap[schema.format]
      ? zodCall(
          formatMap[schema.format].callee,
          formatParams ? [formatParams] : [],
          formatMap[schema.format].type
        )
      : schema.type === "integer"
        ? zodCall("z.int", [], "z.ZodInt")
        : zodNumber();

  const multipleOf = withMessage(schema, "multipleOf", ({ json }) => ({
    opener: `.multipleOf(${json}`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));
  if (multipleOf) {
    result = zodChain(result, multipleOf.slice(1));
  }

  const minimum = schema.minimum;
  const maximum = schema.maximum;
  const exclusiveMinimum = schema.exclusiveMinimum;
  const exclusiveMaximum = schema.exclusiveMaximum;

  const minMessage = schema.errorMessage?.minimum;
  const maxMessage = schema.errorMessage?.maximum;
  const exclMinMessage = schema.errorMessage?.exclusiveMinimum;
  const exclMaxMessage = schema.errorMessage?.exclusiveMaximum;

  if (typeof exclusiveMinimum === "number") {
    result = zodChain(
      result,
      `gt(${exclusiveMinimum}${exclMinMessage ? `, { message: ${JSON.stringify(exclMinMessage)} }` : ""})`
    );
  } else if (exclusiveMinimum === true && typeof minimum === "number") {
    result = zodChain(
      result,
      `gt(${minimum}${exclMinMessage ? `, { message: ${JSON.stringify(exclMinMessage)} }` : ""})`
    );
  } else if (typeof minimum === "number") {
    result = zodChain(
      result,
      `min(${minimum}${minMessage ? `, { message: ${JSON.stringify(minMessage)} }` : ""})`
    );
  }

  if (typeof exclusiveMaximum === "number") {
    result = zodChain(
      result,
      `lt(${exclusiveMaximum}${exclMaxMessage ? `, { message: ${JSON.stringify(exclMaxMessage)} }` : ""})`
    );
  } else if (exclusiveMaximum === true && typeof maximum === "number") {
    result = zodChain(
      result,
      `lt(${maximum}${exclMaxMessage ? `, { message: ${JSON.stringify(exclMaxMessage)} }` : ""})`
    );
  } else if (typeof maximum === "number") {
    result = zodChain(
      result,
      `max(${maximum}${maxMessage ? `, { message: ${JSON.stringify(maxMessage)} }` : ""})`
    );
  }

  return result;
};
