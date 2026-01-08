import { JsonSchemaObject, Refs, SchemaRepresentation } from "../Types.js";
import { parseSchema } from "./parseSchema.js";

export const parseMultipleType = (
  schema: JsonSchemaObject & { type: string[] },
  refs: Refs
): SchemaRepresentation => {
  const schemas = schema.type.map((type) =>
    parseSchema({ ...schema, type }, { ...refs, withoutDefaults: true })
  );

  const expressions = schemas.map((s) => s.expression).join(", ");
  const types = schemas.map((s) => s.type).join(", ");

  return {
    expression: `z.union([${expressions}])`,
    type: `z.ZodUnion<[${types}]>`,
  };
};
