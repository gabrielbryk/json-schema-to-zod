import { JsonSchemaObject, SchemaRepresentation } from "../Types.js";
import { withMessage } from "../utils/withMessage.js";

export const parseNumber = (
  schema: JsonSchemaObject & { type: "number" | "integer" }
): SchemaRepresentation => {
  const formatMessage = schema.errorMessage?.format;
  const formatParams = formatMessage ? `{ message: ${JSON.stringify(formatMessage)} }` : "";

  const formatMap: Record<string, { expression: string; type: string }> = {
    int32: { expression: `z.int32(${formatParams})`, type: "z.ZodNumber" },
    uint32: { expression: `z.uint32(${formatParams})`, type: "z.ZodNumber" },
    float32: { expression: `z.float32(${formatParams})`, type: "z.ZodNumber" },
    float64: { expression: `z.float64(${formatParams})`, type: "z.ZodNumber" },
    safeint: { expression: `z.safeint(${formatParams})`, type: "z.ZodNumber" },
    int64: { expression: `z.int64(${formatParams})`, type: "z.ZodBigInt" },
    uint64: { expression: `z.uint64(${formatParams})`, type: "z.ZodBigInt" },
  };

  let r = schema.type === "integer" ? "z.int()" : "z.number()";
  let zodType = schema.type === "integer" ? "z.ZodInt" : "z.ZodNumber";

  if (schema.format && formatMap[schema.format]) {
    const mapped = formatMap[schema.format];
    r = mapped.expression;
    zodType = mapped.type;
  }

  r += withMessage(schema, "multipleOf", ({ json }) => ({
    opener: `.multipleOf(${json}`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));

  const minimum = schema.minimum;
  const maximum = schema.maximum;
  const exclusiveMinimum = schema.exclusiveMinimum;
  const exclusiveMaximum = schema.exclusiveMaximum;

  const minMessage = schema.errorMessage?.minimum;
  const maxMessage = schema.errorMessage?.maximum;
  const exclMinMessage = schema.errorMessage?.exclusiveMinimum;
  const exclMaxMessage = schema.errorMessage?.exclusiveMaximum;

  if (typeof exclusiveMinimum === "number") {
    r += `.gt(${exclusiveMinimum}${exclMinMessage ? `, { message: ${JSON.stringify(exclMinMessage)} }` : ""})`;
  } else if (exclusiveMinimum === true && typeof minimum === "number") {
    r += `.gt(${minimum}${exclMinMessage ? `, { message: ${JSON.stringify(exclMinMessage)} }` : ""})`;
  } else if (typeof minimum === "number") {
    r += `.min(${minimum}${minMessage ? `, { message: ${JSON.stringify(minMessage)} }` : ""})`;
  }

  if (typeof exclusiveMaximum === "number") {
    r += `.lt(${exclusiveMaximum}${exclMaxMessage ? `, { message: ${JSON.stringify(exclMaxMessage)} }` : ""})`;
  } else if (exclusiveMaximum === true && typeof maximum === "number") {
    r += `.lt(${maximum}${exclMaxMessage ? `, { message: ${JSON.stringify(exclMaxMessage)} }` : ""})`;
  } else if (typeof maximum === "number") {
    r += `.max(${maximum}${maxMessage ? `, { message: ${JSON.stringify(maxMessage)} }` : ""})`;
  }

  return {
    expression: r,
    type: zodType,
  };
};
