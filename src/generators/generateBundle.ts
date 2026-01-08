import { analyzeSchema } from "../core/analyzeSchema.js";
import { emitZod } from "../core/emitZod.js";
import { JsonSchema, JsonSchemaObject, Options, Refs } from "../Types.js";
import { liftInlineObjects } from "../utils/liftInlineObjects.js";

type DefInfo = {
  name: string;
  pascalName: string;
  schemaName: string;
  typeName?: string;
  fileName: string;
  dependencies: Set<string>;
  hasCycle: boolean;
  groupId: string;
};

type BundleTarget = {
  groupId: string;
  fileName: string;
  members: {
    defName: string | null;
    schemaWithDefs: JsonSchemaObject;
    schemaName: string;
    typeName?: string;
  }[];
  usedRefs: Set<string>;
  isRoot: boolean;
};

export type SplitDefsOptions = {
  /** Include a root schema file in addition to $defs */
  includeRoot?: boolean;
  /** Override file name for each schema (default: `${ def }.schema.ts`) */
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
  onUnknownRef?: (ctx: {
    ref: string;
    currentDef: string | null;
  }) => RefResolutionResult | undefined;
};

export type NestedTypesOptions = {
  enable?: boolean;
  fileName?: string;
};

export type GenerateBundleOptions = Options & {
  splitDefs?: SplitDefsOptions;
  refResolution?: RefResolutionOptions;
  nestedTypes?: NestedTypesOptions;
};

export type GeneratedFile = { fileName: string; contents: string };

export type SchemaBundleResult = {
  files: GeneratedFile[];
  defNames: string[];
};

export const generateSchemaBundle = (
  schema: JsonSchema,
  options: GenerateBundleOptions = {}
): SchemaBundleResult => {
  if (!schema || typeof schema !== "object") {
    throw new Error("generateSchemaBundle requires an object schema");
  }

  const liftOpts = options.liftInlineObjects ?? {};
  const useLift = liftOpts.enable !== false;
  const liftedSchema = useLift
    ? (liftInlineObjects(schema, {
        enable: true,
        nameForPath: liftOpts.nameForPath,
        parentName:
          options.splitDefs?.rootTypeName ??
          options.splitDefs?.rootName ??
          (schema as JsonSchemaObject).title,
        dedup: liftOpts.dedup === true,
        allowInDefs: liftOpts.allowInDefs,
      }).schema as JsonSchemaObject)
    : (schema as JsonSchemaObject);

  const allDefs: Record<string, JsonSchema> = {
    ...(liftedSchema.definitions as Record<string, JsonSchema> | undefined),
    ...(liftedSchema.$defs as Record<string, JsonSchema> | undefined),
  };
  const defNames = Object.keys(allDefs);

  const { rootName, rootTypeName, defInfoMap } = buildBundleContext(defNames, allDefs, options);

  const files: GeneratedFile[] = [];

  const targets = planBundleTargets(
    liftedSchema,
    allDefs,
    {},
    defNames,
    options,
    rootName,
    defInfoMap,
    rootTypeName
  );

  for (const target of targets) {
    const usedRefs = new Set<string>();

    const zodParts: string[] = [];

    for (const member of target.members) {
      const analysis = analyzeSchema(member.schemaWithDefs, {
        ...options,
        name: member.schemaName,
        type: member.typeName,
        documentRoot: liftedSchema,
        parserOverride: createRefHandler(
          member.defName,
          defInfoMap,
          usedRefs,
          allDefs,
          options,
          target.groupId
        ),
      });

      const zodSchema = emitZod(analysis);
      zodParts.push(zodSchema);
    }

    const finalSchema = buildSchemaFile(zodParts, usedRefs, defInfoMap);

    files.push({ fileName: target.fileName, contents: finalSchema });
  }

  // Nested types extraction (optional)
  const nestedTypesEnabled = options.nestedTypes?.enable;
  if (nestedTypesEnabled) {
    const nestedTypes = collectNestedTypes(
      liftedSchema as JsonSchemaObject,
      allDefs,
      defNames,
      rootTypeName ?? rootName
    );
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

const buildDefInfoMap = (
  defNames: string[],
  defs: Record<string, JsonSchema>,
  options: GenerateBundleOptions
): Map<string, DefInfo> => {
  const map = new Map<string, DefInfo>();

  for (const defName of defNames) {
    const dependencies = findRefDependencies(defs[defName], defNames);
    const pascalName = toPascalCase(defName);

    const schemaName =
      options.splitDefs?.schemaName?.(defName, { isRoot: false }) ?? `${pascalName}Schema`;
    const typeName = options.splitDefs?.typeName?.(defName, { isRoot: false }) ?? pascalName;
    const fileName =
      options.splitDefs?.fileName?.(defName, { isRoot: false }) ?? `${defName}.schema.ts`;

    map.set(defName, {
      name: defName,
      pascalName,
      schemaName,
      typeName,
      fileName,
      dependencies,
      hasCycle: false,
      groupId: "",
    });
  }

  return map;
};

const buildBundleContext = (
  defNames: string[],
  defs: Record<string, JsonSchema>,
  options: GenerateBundleOptions
) => {
  const defInfoMap = buildDefInfoMap(defNames, defs, options);
  const cycles = detectCycles(defInfoMap);

  for (const defName of cycles) {
    const info = defInfoMap.get(defName);
    if (info) info.hasCycle = true;
  }

  /*
  const useLazyCrossRefs = options.refResolution?.lazyCrossRefs ?? true;
  // NOTE: SCC grouping is currently disabled to ensure 1-to-1 mapping of $defs to files,
  // which is expected by the test suite and preferred for clarity.
  if (!useLazyCrossRefs) {
    const groups = buildSccGroups(defInfoMap);
    for (const [groupId, members] of groups) {
      if (members.length > 1) {
        for (const defName of members) {
          const info = defInfoMap.get(defName);
          if (info) info.groupId = groupId;
        }
      }
    }
  }
  */

  const rootName = options.splitDefs?.rootName ?? options.name ?? "RootSchema";
  const rootTypeName =
    typeof options.type === "string"
      ? options.type
      : (options.splitDefs?.rootTypeName ??
        (typeof options.type === "boolean" && options.type ? rootName : undefined));

  return { defInfoMap, rootName, rootTypeName };
};

const createRefHandler = (
  currentDefName: string | null,
  defInfoMap: Map<string, DefInfo>,
  usedRefs: Set<string>,
  allDefs: Record<string, JsonSchema>,
  options: GenerateBundleOptions,
  currentGroupId?: string
) => {
  const useLazyCrossRefs = options.refResolution?.lazyCrossRefs ?? true;

  return (schema: Record<string, unknown>, refs: Refs): string | undefined => {
    if (typeof schema["$ref"] === "string") {
      const refPath = schema["$ref"] as string;
      const match = refPath.match(/^#\/(?:\$defs|definitions)\/(.+)$/);

      if (match) {
        const refName = match[1];

        // First check if it's exactly a top-level definition
        const refInfo = defInfoMap.get(refName);

        if (refInfo) {
          // Track imports when referencing other defs
          if (refName !== currentDefName && refInfo.groupId !== currentGroupId) {
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

          // Self-recursion ALWAYS needs z.lazy if not using getters
          if (refName === currentDefName) {
            return `z.lazy(() => ${refInfo.schemaName})`;
          }

          if (isCycle && useLazyCrossRefs) {
            return `z.lazy(() => ${refInfo.schemaName})`;
          }

          return refInfo.schemaName;
        }

        // If it's NOT exactly a top-level definition, it could be:
        // 1. A path into a top-level definition (e.g. #/$defs/alpha/properties/foo)
        // 2. A local/inline definition NOT in allDefs
        // 3. A reference to allDefs that we missed? (shouldn't happen)

        // We return undefined to let the standard parser resolve it.
        return undefined;
      }

      const unknown = options.refResolution?.onUnknownRef?.({
        ref: refPath,
        currentDef: currentDefName,
      });
      if (unknown) return unknown;

      return options.useUnknown ? "z.unknown()" : "z.any()";
    }

    return undefined;
  };
};

const buildSchemaFile = (
  zodCodeParts: string[],
  usedRefs: Set<string>,
  defInfoMap: Map<string, DefInfo>
): string => {
  const groupFileById = new Map<string, string>();
  for (const info of defInfoMap.values()) {
    if (info.groupId && !groupFileById.has(info.groupId)) {
      groupFileById.set(info.groupId, info.fileName.replace(/\.ts$/, ".js"));
    }
  }

  const importsByFile = new Map<string, Set<string>>();

  for (const refName of [...usedRefs].sort()) {
    const refInfo = defInfoMap.get(refName);
    if (refInfo) {
      const groupFile =
        (refInfo.groupId ? groupFileById.get(refInfo.groupId) : null) ??
        refInfo.fileName.replace(/\.ts$/, ".js");
      const path = `./${groupFile}`;
      const set = importsByFile.get(path) ?? new Set<string>();
      set.add(refInfo.schemaName);
      importsByFile.set(path, set);
    }
  }

  const imports: string[] = [];
  for (const [path, names] of [...importsByFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    imports.push(`import { ${[...names].sort().join(", ")} } from '${path}';`);
  }

  const body = zodCodeParts
    .map((code, idx) => {
      if (idx === 0) return code;
      return code.replace(/^import \{ z \} from "zod"\n?/, "");
    })
    .join("\n");

  const withImports = imports.length
    ? body.replace(/import \{ z \} from "zod";?/, `import { z } from "zod";\n${imports.join("\n")}`)
    : body;

  return withImports;
};

const planBundleTargets = (
  rootSchema: JsonSchemaObject,
  defs: Record<string, JsonSchema>,
  definitions: Record<string, JsonSchema>,
  defNames: string[],
  options: GenerateBundleOptions,
  rootName: string,
  defInfoMap: Map<string, DefInfo>,
  rootTypeName?: string
): BundleTarget[] => {
  const targets: BundleTarget[] = [];

  const groupById = new Map<string, string[]>();
  for (const defName of defNames) {
    const info = defInfoMap.get(defName);
    const gid = info?.groupId || defName;
    if (!groupById.has(gid)) groupById.set(gid, []);
    groupById.get(gid)!.push(defName);
  }

  for (const [groupId, memberDefs] of groupById.entries()) {
    const orderedDefs = orderGroupMembers(memberDefs, defInfoMap);

    const members = orderedDefs.map((defName) => {
      const defSchema = defs[defName] as JsonSchemaObject;
      const defSchemaWithDefs: JsonSchemaObject = {
        ...defSchema,
        $defs: {
          ...(defs as Record<string, JsonSchema>),
          ...(defSchema?.$defs as Record<string, JsonSchema> | undefined),
        },
        definitions: {
          ...((defSchema as JsonSchemaObject).definitions as
            | Record<string, JsonSchema>
            | undefined),
          ...(definitions as Record<string, JsonSchema>),
        },
      };

      const pascalName = toPascalCase(defName);
      const schemaName =
        options.splitDefs?.schemaName?.(defName, { isRoot: false }) ?? `${pascalName}Schema`;
      const typeName = options.splitDefs?.typeName?.(defName, { isRoot: false }) ?? pascalName;

      return { defName, schemaWithDefs: defSchemaWithDefs, schemaName, typeName };
    });

    const fileName = defInfoMap.get(memberDefs[0])?.fileName ?? `${memberDefs[0]}.schema.ts`;

    targets.push({
      groupId,
      fileName,
      members,
      usedRefs: new Set<string>(),
      isRoot: false,
    });
  }

  if (options.splitDefs?.includeRoot ?? true) {
    const rootFile =
      options.splitDefs?.fileName?.("root", { isRoot: true }) ?? "workflow.schema.ts";

    targets.push({
      groupId: "root",
      fileName: rootFile,
      members: [
        {
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
        },
      ],
      usedRefs: new Set<string>(),
      isRoot: true,
    });
  }

  return targets;
};

const findRefDependencies = (
  schema: JsonSchema | undefined,
  validDefNames: string[]
): Set<string> => {
  const deps = new Set<string>();

  const seen = new WeakSet<object>();

  function traverse(obj: unknown): void {
    if (obj === null || typeof obj !== "object") return;
    if (seen.has(obj as object)) return;
    seen.add(obj as object);

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

const orderGroupMembers = (defs: string[], defInfoMap: Map<string, DefInfo>): string[] => {
  const inGroup = new Set(defs);
  const visited = new Set<string>();
  const temp = new Set<string>();
  const result: string[] = [];

  const visit = (name: string) => {
    if (visited.has(name)) return;
    if (temp.has(name)) {
      return;
    }
    temp.add(name);
    const info = defInfoMap.get(name);
    if (info) {
      for (const dep of info.dependencies) {
        if (inGroup.has(dep)) {
          visit(dep);
        }
      }
    }
    temp.delete(name);
    visited.add(name);
    result.push(name);
  };

  for (const name of defs) {
    visit(name);
  }

  return result;
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

/*
const buildSccGroups = (defInfoMap: Map<string, DefInfo>): Map<string, string[]> => {
  const indexMap = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let index = 0;
  const groups = new Map<string, string[]>();

  const strongConnect = (node: string) => {
    indexMap.set(node, index);
    lowLink.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    const info = defInfoMap.get(node);
    if (info) {
      for (const dep of info.dependencies) {
        if (!indexMap.has(dep)) {
          strongConnect(dep);
          lowLink.set(node, Math.min(lowLink.get(node)!, lowLink.get(dep)!));
        } else if (onStack.has(dep)) {
          lowLink.set(node, Math.min(lowLink.get(node)!, indexMap.get(dep)!));
        }
      }
    }

    if (lowLink.get(node) === indexMap.get(node)) {
      const members: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w) {
          onStack.delete(w);
          members.push(w);
        }
      } while (w && w !== node);

      const groupId = members.sort().join("__");
      groups.set(groupId, members);
    }
  };

  for (const name of defInfoMap.keys()) {
    if (!indexMap.has(name)) {
      strongConnect(name);
    }
  }

  return groups;
};
*/

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
  rootTypeName: string
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
    {
      properties: (rootSchema as JsonSchemaObject).properties,
      required: (rootSchema as JsonSchemaObject).required,
    },
    rootTypeName,
    defNames
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
  currentPath: string[] = []
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
      nestedTypes.push(
        ...findNestedTypesInSchema(defSchema, parentTypeName, defNames, currentPath)
      );
    }
  }

  if (record.properties && typeof record.properties === "object") {
    for (const [propName, propSchema] of Object.entries(
      record.properties as Record<string, unknown>
    )) {
      nestedTypes.push(
        ...findNestedTypesInSchema(propSchema, parentTypeName, defNames, [...currentPath, propName])
      );
    }
  }

  if (Array.isArray(record.allOf)) {
    for (const item of record.allOf as unknown[]) {
      nestedTypes.push(...findNestedTypesInSchema(item, parentTypeName, defNames, currentPath));
    }
  }

  if (record.items) {
    nestedTypes.push(
      ...findNestedTypesInSchema(record.items, parentTypeName, defNames, [...currentPath, "items"])
    );
  }

  if (record.additionalProperties && typeof record.additionalProperties === "object") {
    nestedTypes.push(
      ...findNestedTypesInSchema(record.additionalProperties, parentTypeName, defNames, [
        ...currentPath,
        "additionalProperties",
      ])
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
    "type Access<T, P extends readonly (string | number)[]> =",
    "  P extends []",
    "    ? NonNullable<T>",
    "    : P extends readonly [infer H, ...infer R]",
    '      ? H extends "items"',
    "        ? Access<NonNullable<T> extends Array<infer U> ? U : unknown, Extract<R, (string | number)[]>>",
    '        : H extends "additionalProperties"',
    "          ? Access<NonNullable<T> extends Record<string, infer V> ? V : unknown, Extract<R, (string | number)[]>>",
    "          : H extends number",
    "            ? Access<NonNullable<T> extends Array<infer U> ? U : unknown, Extract<R, (string | number)[]>>",
    "            : H extends string",
    "              ? Access<",
    "                  H extends keyof NonNullable<T>",
    "                    ? NonNullable<NonNullable<T>[H]>",
    "                    : unknown,",
    "                  Extract<R, (string | number)[]>",
    "                >",
    "              : unknown",
    "      : unknown;",
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
    const path = propertyPath
      .map((prop) => (typeof prop === "number" ? prop : JSON.stringify(prop)))
      .join(", ");
    return `Access<${parentType}, [${path}]>`;
  };

  for (const [parentType, types] of [...byParent.entries()].sort()) {
    lines.push(`// From ${parentType}`);

    for (const info of types.sort((a: NestedTypeInfo, b: NestedTypeInfo) =>
      a.typeName.localeCompare(b.typeName)
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
