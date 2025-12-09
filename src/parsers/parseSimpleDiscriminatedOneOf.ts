import { SimpleDiscriminatedOneOfSchema, Refs } from "../Types.js";
import { parseSchema } from "./parseSchema.js";

export const parseSimpleDiscriminatedOneOf = (
  schema: SimpleDiscriminatedOneOfSchema,
  refs: Refs,
) => {
  const discriminator = schema.discriminator.propertyName;

  const entries = schema.oneOf.map((option, i) => {
    const discriminatorSchema = option.properties[discriminator];
    const value =
      (discriminatorSchema as any).const ??
      ((discriminatorSchema as any).enum && (discriminatorSchema as any).enum[0]);

    const parsed = parseSchema(option, {
      ...refs,
      path: [...refs.path, "oneOf", i],
    });

    const key = typeof value === "string" ? JSON.stringify(value) : JSON.stringify(String(value));

    return `${key}: ${parsed}`;
  });

  return schema.oneOf.length
    ? schema.oneOf.length === 1
      ? parseSchema(schema.oneOf[0], {
          ...refs,
          path: [...refs.path, "oneOf", 0],
        })
      : `z.discriminatedUnion("${discriminator}", { ${entries.join(", ")} })`
    : "z.any()";
};
