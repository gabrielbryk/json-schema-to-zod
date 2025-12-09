import { SimpleDiscriminatedOneOfSchema, Refs, JsonSchemaObject } from "../Types.js";
import { parseSchema } from "./parseSchema.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";

export const parseSimpleDiscriminatedOneOf = (
  schema: SimpleDiscriminatedOneOfSchema,
  refs: Refs,
) => {
  const discriminator = schema.discriminator.propertyName;

  const options = schema.oneOf.map((option, i) =>
    parseSchema(option, {
      ...refs,
      path: [...refs.path, "oneOf", i],
    }),
  );

  return schema.oneOf.length
    ? schema.oneOf.length === 1
      ? parseSchema(schema.oneOf[0], {
          ...refs,
          path: [...refs.path, "oneOf", 0],
        })
      : `z.discriminatedUnion("${discriminator}", [${options.join(", ")}])`
    : anyOrUnknown(refs);
};
