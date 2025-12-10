import { Options, JsonSchema } from "./Types.js";
import { analyzeSchema } from "./core/analyzeSchema.js";
import { emitZod } from "./core/emitZod.js";

export const jsonSchemaToZod = (schema: JsonSchema, options: Options = {}): string => {
  const analysis = analyzeSchema(schema, options);
  return emitZod(analysis);
};
