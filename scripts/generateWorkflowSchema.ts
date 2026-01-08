import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import jsonSchemaToZod from "../src/index.js";

const WORKFLOW_SOURCE = "test/fixtures/workflow.yaml";
const OUTPUT_DIR = "test/output/workflow";
const SCHEMA_DIR = join(OUTPUT_DIR, "schemas");
const OUTPUT_INDEX = join(OUTPUT_DIR, "index.ts");

function main() {
  const schema = yaml.load(readFileSync(WORKFLOW_SOURCE, "utf8")) as any;

  const generated = jsonSchemaToZod(schema, {
    name: "workflowSchema",
    exportRefs: true,
  });

  const lines = generated
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""));

  const importLines = lines.filter((line) => line.startsWith("import "));

  // Extract blocks: export const Name = ... (until next export const or end)
  const blocks: { name: string; lines: string[]; exported: boolean }[] = [];
  let current: { name: string; lines: string[]; exported: boolean } | null = null;

  for (const line of lines) {
    const match = line.match(/^(export\s+)?const ([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(.*)/);
    if (match) {
      if (current) blocks.push(current);
      const [, expKeyword, name] = match;
      current = { name, exported: Boolean(expKeyword), lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);

  const names = new Set(blocks.map((b) => b.name));

  mkdirSync(SCHEMA_DIR, { recursive: true });

  for (const block of blocks) {
    const normalizedLines = block.lines.map((l, idx) =>
      idx === 0 ? l.replace(/^\s*(export\s+)?const\s+/, "export const ") : l
    );
    const content = normalizedLines.join("\n");
    const deps = Array.from(names)
      .filter((n) => n !== block.name)
      .filter((n) => new RegExp(`\\b${n}\\b`).test(content));

    const importDepLines = deps.map((dep) => `import { ${dep} } from "./${dep}.js"`);

    const fileContent = [...importLines, ...importDepLines, content, ""].join("\n");

    writeFileSync(join(SCHEMA_DIR, `${block.name}.ts`), fileContent);
  }

  // index exports all and the root schema
  const exportLines = Array.from(
    new Set(blocks.map((b) => `export { ${b.name} } from "./schemas/${b.name}.js"`))
  );

  writeFileSync(OUTPUT_INDEX, exportLines.join("\n") + "\n");

  console.log(`Generated per-schema files in ${SCHEMA_DIR} and index at ${OUTPUT_INDEX}`);
}

main();
