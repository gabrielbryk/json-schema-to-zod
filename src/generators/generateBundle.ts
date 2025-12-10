import { analyzeSchema } from "../core/analyzeSchema.js";
import { emitZod } from "../core/emitZod.js";
import { JsonSchema, JsonSchemaObject, Options, Refs } from "../Types.js";

type DefInfo = {
  name: string;
  pascalName: string;
  schemaName: string;
  typeName?: string;
  dependencies: Set<string>;
  hasCycle: boolean;
};

type BundleTarget = {
  defName: string | null;
  schemaWithDefs: JsonSchemaObject;
  schemaName: string;
  typeName?: string;
  fileName: string;
  usedRefs: Set<string>;
  isRoot: boolean;
};

export type SplitDefsOptions = {
  /** Include a root schema file in addition to $defs */
  includeRoot?: boolean;
  /** Override file name for each schema (default: `${def}.schema.ts`) */
  fileName?: (defName: string, ctx: { isRoot: boolean }) => string;
  /** Override exported schema const name (default: PascalCase(def) + "Schema") */
  schemaName?: (defName: string, ctx: { isRoot: boolean }) => string;
  /** Override exported type name (default: PascalCase(def)) */
  typeName?: (defName: string, ctx: { isRoot: boolean }) => string | undefined;
  /** Optional root schema name (defaults to provided `name` option or "RootSchema") */
  rootName?: string;
  /** Optional root type name (defaults to provided `type` option if string) */
  rootTypeName?: string;
};

export type RefResolutionResult = string;

export type RefResolutionOptions = {
  /** Called for each internal $ref that targets a known $def */
  onRef?: (ctx: {
    ref: string;
    refName: string;
    currentDef: string | null;
    path: (string | number)[];
    isCycle: boolean;
  }) => RefResolutionResult | undefined;
  /**
   * When true, cross-def references that participate in a cycle are emitted as z.lazy(() => Ref)
   * to avoid TDZ issues across files.
   */
  lazyCrossRefs?: boolean;
  /** Called for unknown $refs (outside of $defs/definitions) */
  onUnknownRef?: (ctx: { ref: string; currentDef: string | null }) => RefResolutionResult | undefined;
};

export type NestedTypesOptions = {
  enable?: boolean;
  fileName?: string;
};

export type GenerateBundleOptions = Options & {
  splitDefs?: SplitDefsOptions;
  refResolution?: RefResolutionOptions;
  nestedTypes?: NestedTypesOptions;
  /** Force module kind for generated files (defaults to esm) */
  module?: "esm" | "cjs" | "none";
};

export type GeneratedFile = { fileName: string; contents: string };

export type SchemaBundleResult = {
  files: GeneratedFile[];
  defNames: string[];
};

export const generateSchemaBundle = (schema: JsonSchema, options: GenerateBundleOptions = {}): SchemaBundleResult => {
  const module = options.module ?? "esm";

  if (!schema || typeof schema !== "object") {
    throw new Error("generateSchemaBundle requires an object schema");
  }

  const defs = (schema as JsonSchemaObject).$defs || {};
  const definitions = (schema as JsonSchemaObject).definitions || {};
  const defNames = Object.keys(defs);

  const { rootName, rootTypeName, defInfoMap } = buildBundleContext(defNames, defs, options);

  const files: GeneratedFile[] = [];

  const targets = planBundleTargets(
    schema as JsonSchemaObject,
    defs,
    definitions,
    defNames,
    options,
    rootName,
    rootTypeName,
  );

  for (const target of targets) {
    const usedRefs = target.usedRefs;

    const analysis = analyzeSchema(target.schemaWithDefs, {
      ...options,
      module,
      name: target.schemaName,
      type: target.typeName,
      parserOverride: createRefHandler(
        target.defName,
        defInfoMap,
        usedRefs,
        {
          ...(target.schemaWithDefs.$defs || {}),
          ...(target.schemaWithDefs.definitions || {}),
        },
        options,
      ),
    });

    const zodSchema = emitZod(analysis);
    const finalSchema = buildSchemaFile(zodSchema, usedRefs, defInfoMap, module);

    files.push({ fileName: target.fileName, contents: finalSchema });
  }

  // Nested types extraction (optional)
  const nestedTypesEnabled = options.nestedTypes?.enable;
  if (nestedTypesEnabled) {
    const nestedTypes = collectNestedTypes(schema as JsonSchemaObject, defs, defNames, rootTypeName ?? rootName);
    if (nestedTypes.length > 0) {
      const nestedFileName = options.nestedTypes?.fileName ?? "nested-types.ts";
      const nestedContent = generateNestedTypesFile(nestedTypes);
      files.push({ fileName: nestedFileName, contents: nestedContent });
    }
  }

  return { files, defNames };
};

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const toPascalCase = (str: string): string =>
  str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

const isObjectPropertyPath = (path: (string | number)[]): boolean =>
  path.some((segment, index) => segment === "properties" && typeof path[index + 1] === "string");

const buildDefInfoMap = (
  defNames: string[],
  defs: Record<string, JsonSchema>,
  options: GenerateBundleOptions,
): Map<string, DefInfo> => {
  const map = new Map<string, DefInfo>();

  for (const defName of defNames) {
    const dependencies = findRefDependencies(defs[defName], defNames);
    const pascalName = toPascalCase(defName);

    const schemaName = options.splitDefs?.schemaName?.(defName, { isRoot: false }) ?? `${pascalName}Schema`;
    const typeName = options.splitDefs?.typeName?.(defName, { isRoot: false }) ?? pascalName;

    map.set(defName, {
      name: defName,
      pascalName,
      schemaName,
      typeName,
      dependencies,
      hasCycle: false,
    });
  }

  return map;
};

const buildBundleContext = (
  defNames: string[],
  defs: Record<string, JsonSchema>,
  options: GenerateBundleOptions,
) => {
  const defInfoMap = buildDefInfoMap(defNames, defs, options);
  const cycles = detectCycles(defInfoMap);

  for (const defName of cycles) {
    const info = defInfoMap.get(defName);
    if (info) info.hasCycle = true;
  }

  const rootName = options.splitDefs?.rootName ?? options.name ?? "RootSchema";
  const rootTypeName =
    typeof options.type === "string"
      ? options.type
      : options.splitDefs?.rootTypeName ?? (typeof options.type === "boolean" && options.type ? rootName : undefined);

  return { defInfoMap, rootName, rootTypeName };
};

const createRefHandler = (
  currentDefName: string | null,
  defInfoMap: Map<string, DefInfo>,
  usedRefs: Set<string>,
  allDefs: Record<string, JsonSchema>,
  options: GenerateBundleOptions,
) => {
  const useLazyCrossRefs = options.refResolution?.lazyCrossRefs ?? true;

  return (schema: Record<string, unknown>, refs: Refs): string | undefined => {
    if (typeof schema["$ref"] === "string") {
      const refPath = schema["$ref"] as string;
      const match = refPath.match(/^#\/(?:\$defs|definitions)\/(.+)$/);

      if (match) {
        const refName = match[1];
        // Only intercept top-level def refs (no nested path like a/$defs/x)
        if (refName.includes("/")) {
          return undefined;
        }
        const refInfo = defInfoMap.get(refName);

        if (refInfo) {
          // Track imports when referencing other defs
          if (refName !== currentDefName) {
            usedRefs.add(refName);
          }

          const isCycle = refName === currentDefName || (refInfo.hasCycle && !!currentDefName);
          const resolved = options.refResolution?.onRef?.({
            ref: refPath,
            refName,
            currentDef: currentDefName,
            path: refs.path,
            isCycle,
          });

          if (resolved) return resolved;

          if (isCycle && useLazyCrossRefs) {
            return `z.lazy(() => ${refInfo.schemaName})`;
          }

          return refInfo.schemaName;
        }

        // If the ref points to a local/inline $def (not part of top-level defs),
        // let the default parser resolve it normally.
        if (allDefs && Object.prototype.hasOwnProperty.call(allDefs, refName)) {
          return undefined;
        }
      }

      const unknown = options.refResolution?.onUnknownRef?.({ ref: refPath, currentDef: currentDefName });
      if (unknown) return unknown;

      return options.useUnknown ? "z.unknown()" : "z.any()";
    }

    return undefined;
  };
};

const buildSchemaFile = (
  zodCode: string,
  usedRefs: Set<string>,
  defInfoMap: Map<string, DefInfo>,
  module: "esm" | "cjs" | "none",
): string => {
  if (module !== "esm") return zodCode;

  const imports: string[] = [];

  for (const refName of [...usedRefs].sort()) {
    const refInfo = defInfoMap.get(refName);
    if (refInfo) {
      imports.push(`import { ${refInfo.schemaName} } from './${refName}.schema.js';`);
    }
  }

  if (!imports.length) return zodCode;

  return zodCode.replace(
    'import { z } from "zod"',
    `import { z } from "zod"\n${imports.join("\n")}`,
  );
};

const planBundleTargets = (
  rootSchema: JsonSchemaObject,
  defs: Record<string, JsonSchema>,
  definitions: Record<string, JsonSchema>,
  defNames: string[],
  options: GenerateBundleOptions,
  rootName: string,
  rootTypeName?: string,
): BundleTarget[] => {
  const targets: BundleTarget[] = [];

  for (const defName of defNames) {
    const defSchema = defs[defName] as JsonSchemaObject;
    const defSchemaWithDefs: JsonSchemaObject = {
      ...defSchema,
      $defs: { ...(defs as Record<string, JsonSchema>), ...(defSchema?.$defs as Record<string, JsonSchema> | undefined) },
      definitions: {
        ...((defSchema as JsonSchemaObject).definitions as Record<string, JsonSchema> | undefined),
        ...(definitions as Record<string, JsonSchema>),
      },
    };

    const pascalName = toPascalCase(defName);
    const schemaName = options.splitDefs?.schemaName?.(defName, { isRoot: false }) ?? `${pascalName}Schema`;
    const typeName = options.splitDefs?.typeName?.(defName, { isRoot: false }) ?? pascalName;
    const fileName = options.splitDefs?.fileName?.(defName, { isRoot: false }) ?? `${defName}.schema.ts`;

    targets.push({
      defName,
      schemaWithDefs: defSchemaWithDefs,
      schemaName,
      typeName,
      fileName,
      usedRefs: new Set<string>(),
      isRoot: false,
    });
  }

  if (options.splitDefs?.includeRoot ?? true) {
    const rootFile = options.splitDefs?.fileName?.("root", { isRoot: true }) ?? "workflow.schema.ts";

    targets.push({
      defName: null,
      schemaWithDefs: {
        ...rootSchema,
        definitions: {
          ...(rootSchema.definitions as Record<string, JsonSchema> | undefined),
          ...(definitions as Record<string, JsonSchema>),
        },
      },
      schemaName: rootName,
      typeName: rootTypeName,
      fileName: rootFile,
      usedRefs: new Set<string>(),
      isRoot: true,
    });
  }

  return targets;
};

const findRefDependencies = (schema: JsonSchema | undefined, validDefNames: string[]): Set<string> => {
  const deps = new Set<string>();

  function traverse(obj: unknown): void {
    if (obj === null || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      obj.forEach(traverse);
      return;
    }

    const record = obj as Record<string, unknown>;

    if (typeof record["$ref"] === "string") {
      const ref = record["$ref"];
      const match = ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/);
      if (match && validDefNames.includes(match[1])) {
        deps.add(match[1]);
      }
    }

    for (const value of Object.values(record)) {
      traverse(value);
    }
  }

  traverse(schema);
  return deps;
};

const detectCycles = (defInfoMap: Map<string, DefInfo>): Set<string> => {
  const cycleNodes = new Set<string>();
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(node: string, path: string[]): boolean {
    if (recursionStack.has(node)) {
      const cycleStart = path.indexOf(node);
      for (let i = cycleStart; i < path.length; i++) {
        cycleNodes.add(path[i]);
      }
      cycleNodes.add(node);
      return true;
    }

    if (visited.has(node)) return false;

    visited.add(node);
    recursionStack.add(node);

    const info = defInfoMap.get(node);
    if (info) {
      for (const dep of info.dependencies) {
        dfs(dep, [...path, node]);
      }
    }

    recursionStack.delete(node);
    return false;
  }

  for (const defName of defInfoMap.keys()) {
    if (!visited.has(defName)) {
      dfs(defName, []);
    }
  }

  return cycleNodes;
};

type NestedTypeInfo = {
  typeName: string;
  parentType: string;
  propertyPath: string[];
  file: string;
};

const collectNestedTypes = (
  rootSchema: JsonSchemaObject,
  defs: Record<string, JsonSchema>,
  defNames: string[],
  rootTypeName: string,
): NestedTypeInfo[] => {
  const allNestedTypes: NestedTypeInfo[] = [];

  for (const defName of defNames) {
    const defSchema = defs[defName];
    const parentTypeName = toPascalCase(defName);
    const nestedTypes = findNestedTypesInSchema(defSchema, parentTypeName, defNames);

    for (const nested of nestedTypes) {
      nested.file = defName;
      nested.parentType = parentTypeName;
      allNestedTypes.push(nested);
    }
  }

  const workflowNestedTypes = findNestedTypesInSchema(
    { properties: rootSchema.properties, required: rootSchema.required },
    rootTypeName,
    defNames,
  );

  for (const nested of workflowNestedTypes) {
    nested.file = "workflow";
    nested.parentType = rootTypeName;
    allNestedTypes.push(nested);
  }

  const uniqueNestedTypes = new Map<string, NestedTypeInfo>();
  for (const nested of allNestedTypes) {
    if (!uniqueNestedTypes.has(nested.typeName) && nested.propertyPath.length > 0) {
      uniqueNestedTypes.set(nested.typeName, nested);
    }
  }

  return [...uniqueNestedTypes.values()];
};

const findNestedTypesInSchema = (
  schema: unknown,
  parentTypeName: string,
  defNames: string[],
  currentPath: string[] = [],
): NestedTypeInfo[] => {
  const nestedTypes: NestedTypeInfo[] = [];

  if (schema === null || typeof schema !== "object") return nestedTypes;

  const record = schema as Record<string, unknown>;

  if (record.title && typeof record.title === "string") {
    const title = record.title as string;
    if (title !== parentTypeName && !defNames.map((d) => toPascalCase(d)).includes(title)) {
      nestedTypes.push({
        typeName: title,
        parentType: parentTypeName,
        propertyPath: [...currentPath],
        file: "",
      });
    }
  }

  // inline $defs
  if (record.$defs && typeof record.$defs === "object") {
    for (const [, defSchema] of Object.entries(record.$defs as Record<string, unknown>)) {
      nestedTypes.push(...findNestedTypesInSchema(defSchema, parentTypeName, defNames, currentPath));
    }
  }

  if (record.properties && typeof record.properties === "object") {
    for (const [propName, propSchema] of Object.entries(record.properties as Record<string, unknown>)) {
      nestedTypes.push(...findNestedTypesInSchema(propSchema, parentTypeName, defNames, [...currentPath, propName]));
    }
  }

  if (Array.isArray(record.allOf)) {
    for (const item of record.allOf as unknown[]) {
      nestedTypes.push(...findNestedTypesInSchema(item, parentTypeName, defNames, currentPath));
    }
  }

  if (record.items) {
    nestedTypes.push(...findNestedTypesInSchema(record.items, parentTypeName, defNames, [...currentPath, "items"]));
  }

  if (record.additionalProperties && typeof record.additionalProperties === "object") {
    nestedTypes.push(
      ...findNestedTypesInSchema(record.additionalProperties, parentTypeName, defNames, [...currentPath, "additionalProperties"]),
    );
  }

  return nestedTypes;
};

const generateNestedTypesFile = (nestedTypes: NestedTypeInfo[]): string => {
  const lines: string[] = [
    "/**",
    " * Auto-generated nested type exports",
    " * ",
    " * These types are inline within parent schemas but commonly needed separately.",
    " * They are extracted using TypeScript indexed access types.",
    " */",
    "",
  ];

  const byParent = new Map<string, NestedTypeInfo[]>();
  for (const info of nestedTypes) {
    if (!byParent.has(info.parentType)) {
      byParent.set(info.parentType, []);
    }
    byParent.get(info.parentType)!.push(info);
  }

  const imports = new Map<string, string>(); // file -> type name
  for (const info of nestedTypes) {
    if (!imports.has(info.file)) {
      imports.set(info.file, info.parentType);
    }
  }

  for (const [file, typeName] of [...imports.entries()].sort()) {
    lines.push(`import type { ${typeName} } from './${file}.schema.js';`);
  }

  lines.push("");

  const buildAccessExpr = (parentType: string, propertyPath: (string | number)[]): string => {
    let accessExpr = parentType;
    for (const prop of propertyPath) {
      const accessor =
        prop === "items"
          ? "[number]"
          : typeof prop === "number"
            ? `[${prop}]`
            : `[${JSON.stringify(prop)}]`;
      accessExpr = `NonNullable<${accessExpr}${accessor}>`;
    }
    return accessExpr;
  };

  for (const [parentType, types] of [...byParent.entries()].sort()) {
    lines.push(`// From ${parentType}`);

    for (const info of types.sort(
      (a: NestedTypeInfo, b: NestedTypeInfo) => a.typeName.localeCompare(b.typeName),
    )) {
      if (info.propertyPath.length > 0) {
        const accessExpr = buildAccessExpr(parentType, info.propertyPath);
        lines.push(`export type ${info.typeName} = ${accessExpr};`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
};
