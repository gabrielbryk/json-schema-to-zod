import { Options, JsonSchema, SchemaRepresentation } from "../Types.js";
import { parseSchema } from "../parsers/parseSchema.js";
import { detectCycles, computeScc } from "../utils/cycles.js";
import { buildRefRegistry } from "../utils/buildRefRegistry.js";

export type NormalizedOptions = Options & {
  exportRefs: boolean;
  withMeta: boolean;
  module: "esm";
};

export type AnalysisResult = {
  schema: JsonSchema;
  options: NormalizedOptions;
  refNameByPointer: Map<string, string>;
  usedNames: Set<string>;
  declarations: Map<string, SchemaRepresentation>;
  dependencies: Map<string, Set<string>>;
  cycleRefNames: Set<string>;
  cycleComponentByName: Map<string, number>;
  refRegistry: Map<string, { schema: JsonSchema; path: (string | number)[]; baseUri: string; dynamic?: boolean; anchor?: string }>;
  rootBaseUri: string;
};

export const analyzeSchema = (
  schema: JsonSchema,
  options: Options = {},
): AnalysisResult => {
  const { name, type, ...rest } = options;

  if (type && !name) {
    throw new Error("Option `type` requires `name` to be set");
  }

  const normalized: NormalizedOptions = {
    name,
    type,
    module: "esm",
    ...rest,
    exportRefs: rest.exportRefs ?? true,
    withMeta: rest.withMeta ?? true,
  };

  const refNameByPointer = new Map<string, string>();
  const usedNames = new Set<string>();

  if (name) {
    usedNames.add(name);
  }

  const declarations = new Map<string, SchemaRepresentation>();
  const dependencies = new Map<string, Set<string>>();
  const { registry: refRegistry, rootBaseUri } = buildRefRegistry(schema);

  const pass1 = {
    name,
    path: [],
    seen: new Map(),
    declarations,
    dependencies,
    inProgress: new Set<string>(),
    refNameByPointer,
    usedNames,
    root: schema,
    currentSchemaName: name,
    refRegistry,
    rootBaseUri,
    ...rest,
    withMeta: normalized.withMeta,
  };

  parseSchema(schema, pass1);

  const names = Array.from(declarations.keys());
  const cycleRefNames = detectCycles(names, dependencies);
  const { componentByName } = computeScc(names, dependencies);

  return {
    schema,
    options: normalized,
    refNameByPointer,
    usedNames,
    declarations,
    dependencies,
    cycleRefNames,
    cycleComponentByName: componentByName,
    refRegistry,
    rootBaseUri,
  };
};
