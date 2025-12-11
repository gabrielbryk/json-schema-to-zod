import { JsonSchemaObject, SchemaRepresentation } from "../Types.js";
import { withMessage } from "../utils/withMessage.js";

export const parseNumber = (
  schema: JsonSchemaObject & { type: "number" | "integer" },
): SchemaRepresentation => {
  const formatError = schema.errorMessage?.format;

  const numericFormatMap: Record<string, string> = {
    int32: "z.int32",
    uint32: "z.uint32",
    float32: "z.float32",
    float64: "z.float64",
    safeint: "z.safeint",
    int64: "z.int64",
    uint64: "z.uint64",
  };

  const mappedFormat =
    schema.format && numericFormatMap[schema.format] ? numericFormatMap[schema.format] : undefined;

  const formatParams =
    formatError !== undefined ? `{ error: ${JSON.stringify(formatError)} }` : "";

  let r = mappedFormat ? `${mappedFormat}(${formatParams})` : "z.number()";

  if (schema.type === "integer") {
    if (!mappedFormat) {
      r += withMessage(schema, "type", () => ({
        opener: ".int(",
        closer: ")",
        messagePrefix: "{ error: ",
        messageCloser: " })",
      }));
    }
  } else {
    if (!mappedFormat) {
      r += withMessage(schema, "format", ({ value }) => {
        if (value === "int64") {
          return {
            opener: ".int(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        }
      });
    }
  }

  r += withMessage(schema, "multipleOf", ({ value, json }) => {
    if (value === 1) {
      if (r.startsWith("z.number().int(")) {
        return;
      }

      return {
        opener: ".int(",
        closer: ")",
        messagePrefix: "{ error: ",
        messageCloser: " })",
      };
    }

    return {
      opener: `.multipleOf(${json}`,
      closer: ")",
      messagePrefix: ", { error: ",
      messageCloser: " })",
    };
  });

  if (typeof schema.minimum === "number") {
    if (schema.exclusiveMinimum === true) {
      r += withMessage(schema, "minimum", ({ json }) => ({
        opener: `.gt(${json}`,
        closer: ")",
        messagePrefix: ", { error: ",
        messageCloser: " })",
      }));
    } else {
      r += withMessage(schema, "minimum", ({ json }) => ({
        opener: `.gte(${json}`,
        closer: ")",
        messagePrefix: ", { error: ",
        messageCloser: " })",
      }));
    }
  } else if (typeof schema.exclusiveMinimum === "number") {
    r += withMessage(schema, "exclusiveMinimum", ({ json }) => ({
      opener: `.gt(${json}`,
      closer: ")",
      messagePrefix: ", { error: ",
      messageCloser: " })",
    }));
  }

  if (typeof schema.maximum === "number") {
    if (schema.exclusiveMaximum === true) {
      r += withMessage(schema, "maximum", ({ json }) => ({
        opener: `.lt(${json}`,
        closer: ")",
        messagePrefix: ", { error: ",
        messageCloser: " })",
      }));
    } else {
      r += withMessage(schema, "maximum", ({ json }) => ({
        opener: `.lte(${json}`,
        closer: ")",
        messagePrefix: ", { error: ",
        messageCloser: " })",
      }));
    }
  } else if (typeof schema.exclusiveMaximum === "number") {
    r += withMessage(schema, "exclusiveMaximum", ({ json }) => ({
      opener: `.lt(${json}`,
      closer: ")",
      messagePrefix: ", { error: ",
      messageCloser: " })",
    }));
  }

  return {
    expression: r,
    type: "z.ZodNumber",
  };
};
