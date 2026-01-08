import { SimpleDiscriminatedOneOfSchema, Refs, SchemaRepresentation } from "../Types.js";
import { parseSchema } from "./parseSchema.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";

export const parseSimpleDiscriminatedOneOf = (
  schema: SimpleDiscriminatedOneOfSchema,
  refs: Refs
): SchemaRepresentation => {
  const discriminator = schema.discriminator.propertyName;

  const options = schema.oneOf.map((option, i) =>
    parseSchema(option, {
      ...refs,
      path: [...refs.path, "oneOf", i],
    })
  );

  if (!schema.oneOf.length) {
    return anyOrUnknown(refs);
  }

  if (schema.oneOf.length === 1) {
    return parseSchema(schema.oneOf[0], {
      ...refs,
      path: [...refs.path, "oneOf", 0],
    });
  }

  const expressions = options.map((o) => o.expression).join(", ");
  const types = options.map((o) => o.type).join(", ");

  return {
    expression: `z.discriminatedUnion("${discriminator}", [${expressions}])`,
    type: `z.ZodDiscriminatedUnion<"${discriminator}", [${types}]>`,
  };
};
