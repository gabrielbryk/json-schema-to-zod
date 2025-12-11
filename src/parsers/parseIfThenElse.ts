import { JsonSchemaObject, JsonSchema, Refs, SchemaRepresentation } from "../Types.js";
import { parseSchema } from "./parseSchema.js";

export const parseIfThenElse = (
  schema: JsonSchemaObject & {
    if: JsonSchema;
    then: JsonSchema;
    else: JsonSchema;
  },
  refs: Refs,
): SchemaRepresentation => {
  const $if = parseSchema(schema.if, { ...refs, path: [...refs.path, "if"] });
  const $then = parseSchema(schema.then, {
    ...refs,
    path: [...refs.path, "then"],
  });
  const $else = parseSchema(schema.else, {
    ...refs,
    path: [...refs.path, "else"],
  });

  let expression = `z.union([${$then.expression}, ${$else.expression}]).superRefine((value,ctx) => {
  const result = ${$if.expression}.safeParse(value).success
    ? ${$then.expression}.safeParse(value)
    : ${$else.expression}.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues;
    issues.forEach((issue) => ctx.addIssue({ ...issue }))
  }
})`;

  // Store original if/then/else for JSON Schema round-trip
  if (refs.preserveJsonSchemaForRoundTrip) {
    const conditionalMeta = JSON.stringify({
      if: schema.if,
      then: schema.then,
      else: schema.else,
    });
    expression += `.meta({ __jsonSchema: { conditional: ${conditionalMeta} } })`;
  }

  return {
    expression,
    type: `z.ZodEffects<z.ZodUnion<[${$then.type}, ${$else.type}]>>`,
  };
};
