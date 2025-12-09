import { Options, JsonSchema } from "./Types.js";
import { parseSchema } from "./parsers/parseSchema.js";
import { expandJsdocs } from "./utils/jsdocs.js";

export const jsonSchemaToZod = (
  schema: JsonSchema,
  { module, name, type, noImport, ...rest }: Options = {},
): string => {
  if (type && (!name || module !== "esm")) {
    throw new Error(
      "Option `type` requires `name` to be set and `module` to be `esm`",
    );
  }

  const declarations = new Map<string, string>();
  const refNameByPointer = new Map<string, string>();
  const usedNames = new Set<string>();
  const exportRefs = rest.exportRefs ?? true;

  const withMeta = rest.withMeta ?? true;

  if (name) usedNames.add(name);

  const parsedSchema = parseSchema(schema, {
    module,
    name,
    path: [],
    seen: new Map(),
    declarations,
    inProgress: new Set(),
    refNameByPointer,
    usedNames,
    root: schema,
    currentSchemaName: name,
    ...rest,
    withMeta,
  });

  const declarationBlock = declarations.size
    ? Array.from(declarations.entries())
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
