import { Options, JsonSchema } from "./Types.js";
import { analyzeSchema } from "./core/analyzeSchema.js";
import { emitZod } from "./core/emitZod.js";
import { liftInlineObjects } from "./utils/liftInlineObjects.js";
export const jsonSchemaToZod = (schema: JsonSchema, options: Options = {}): string => {
  const liftOpts = options.liftInlineObjects ?? {};
  const sourceSchema =
    liftOpts.enable !== false
      ? liftInlineObjects(schema, {
          enable: true,
          nameForPath: liftOpts.nameForPath,
          parentName: options.name,
          dedup: liftOpts.dedup === true,
          allowInDefs: liftOpts.allowInDefs,
        }).schema
      : schema;

  const analysis = analyzeSchema(sourceSchema, options);
  return emitZod(analysis);
};
