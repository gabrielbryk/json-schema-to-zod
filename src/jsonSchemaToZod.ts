import { Options, JsonSchema } from "./Types.js";
import { parseSchema } from "./parsers/parseSchema.js";
import { expandJsdocs } from "./utils/jsdocs.js";
import { detectCycles, computeScc } from "./utils/cycles.js";

export const jsonSchemaToZod = (
  schema: JsonSchema,
  { module, name, type, noImport, ...rest }: Options = {},
): string => {
  if (type && (!name || module !== "esm")) {
    throw new Error(
      "Option `type` requires `name` to be set and `module` to be `esm`",
    );
  }

  const refNameByPointer = new Map<string, string>();
  const usedNames = new Set<string>();
  const exportRefs = rest.exportRefs ?? true;

  const withMeta = rest.withMeta ?? true;

  if (name) usedNames.add(name);

  // Pass 1: collect declarations/dependencies to detect cycles before emitting
  const pass1 = {
    module,
    name,
    path: [],
    seen: new Map(),
    declarations: new Map<string, string>(),
    dependencies: new Map<string, Set<string>>(),
    inProgress: new Set<string>(),
    refNameByPointer,
    usedNames,
    root: schema,
    currentSchemaName: name,
    ...rest,
    withMeta,
  };
  parseSchema(schema, pass1);

  const names = Array.from(pass1.declarations.keys());
  const cycleRefNames = detectCycles(names, pass1.dependencies);
  const { componentByName } = computeScc(names, pass1.dependencies);

  // Pass 2: generate with cycle awareness
  const declarations = new Map<string, string>();
  const dependencies = new Map<string, Set<string>>();
  const parsedSchema = parseSchema(schema, {
    module,
    name,
    path: [],
    seen: new Map(),
    declarations,
    dependencies,
    inProgress: new Set(),
    refNameByPointer,
    usedNames,
    root: schema,
    currentSchemaName: name,
    cycleRefNames,
    cycleComponentByName: componentByName,
    ...rest,
    withMeta,
  });

  const declarationBlock = declarations.size
    ? orderDeclarations(Array.from(declarations.entries()), dependencies)
        .map(([refName, value]) => {
          const shouldExport = exportRefs && module === "esm";
          const decl = `${shouldExport ? "export " : ""}const ${refName} = ${value}`;
          return decl;
        })
        .join("\n")
    : "";

  const jsdocs = rest.withJsdocs && typeof schema !== "boolean" && schema.description
    ? expandJsdocs(schema.description)
    : "";

  const lines: string[] = [];

  if (module === "cjs" && !noImport) {
    lines.push(`const { z } = require("zod")`);
  }

  if (module === "esm" && !noImport) {
    lines.push(`import { z } from "zod"`);
  }

  if (declarationBlock) {
    lines.push(declarationBlock);
  }

  if (module === "cjs") {
    const payload = name ? `{ ${JSON.stringify(name)}: ${parsedSchema} }` : parsedSchema;
    lines.push(`${jsdocs}module.exports = ${payload}`);
  } else if (module === "esm") {
    lines.push(`${jsdocs}export ${name ? `const ${name} =` : `default`} ${parsedSchema}`);
  } else if (name) {
    lines.push(`${jsdocs}const ${name} = ${parsedSchema}`);
  } else {
    lines.push(`${jsdocs}${parsedSchema}`);
  }

  let typeLine: string | undefined;

  if (type && name) {
    let typeName =
      typeof type === "string"
        ? type
        : `${name[0].toUpperCase()}${name.substring(1)}`;

    typeLine = `export type ${typeName} = z.infer<typeof ${name}>`;
  }

  const joined = lines.filter(Boolean).join("\n\n");
  const combined = typeLine ? `${joined}\n${typeLine}` : joined;

  const shouldEndWithNewline = module === "esm" || module === "cjs";

  return `${combined}${shouldEndWithNewline ? "\n" : ""}`;
};

function orderDeclarations(
  entries: Array<[string, string]>,
  dependencies: Map<string, Set<string>>,
): Array<[string, string]> {
  const valueByName = new Map(entries);
  const depGraph = new Map<string, Set<string>>();

  // Seed with explicit dependencies recorded during parsing
  for (const [from, set] of dependencies.entries()) {
    const onlyKnown = new Set<string>();
    for (const dep of set) {
      if (valueByName.has(dep) && dep !== from) {
        onlyKnown.add(dep);
      }
    }
    if (onlyKnown.size) depGraph.set(from, onlyKnown);
  }

  // Also infer deps by scanning declaration bodies for referenced names
  const names = Array.from(valueByName.keys());
  for (const [name, value] of entries) {
    const deps = depGraph.get(name) ?? new Set<string>();
    for (const candidate of names) {
      if (candidate === name) continue;
      const matcher = new RegExp(`\\b${candidate}\\b`);
      if (matcher.test(value)) {
        deps.add(candidate);
      }
    }
    if (deps.size) depGraph.set(name, deps);
  }

  const ordered: string[] = [];
  const perm = new Set<string>();
  const temp = new Set<string>();

  const visit = (name: string) => {
    if (perm.has(name)) return;
    if (temp.has(name)) {
      // Cycle detected; break it but still include the node.
      temp.delete(name);
      perm.add(name);
      ordered.push(name);
      return;
    }

    temp.add(name);
    const deps = depGraph.get(name);
    if (deps) {
      for (const dep of deps) {
        if (valueByName.has(dep)) {
          visit(dep);
        }
      }
    }
    temp.delete(name);
    perm.add(name);
    ordered.push(name);
  };

  for (const name of valueByName.keys()) {
    visit(name);
  }

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const name of ordered) {
    if (!seen.has(name)) {
      seen.add(name);
      unique.push(name);
    }
  }

  return unique.map((name) => [name, valueByName.get(name)!]);
}
