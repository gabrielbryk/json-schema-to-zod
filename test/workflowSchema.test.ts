import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";
import yaml from "js-yaml";
import jsonSchemaToZod from "../src/index.js";
import { suite } from "./suite";

suite("workflow.yaml", (test) => {
  test("converts workflow schema fixture", (assert) => {
    const schema = yaml.load(
      readFileSync("test/fixtures/workflow.yaml", "utf8"),
    ) as Record<string, unknown>;

    const output = jsonSchemaToZod(schema, {
      module: "esm",
      name: "workflowSchema",
    });

    assert(typeof output === "string");
    assert(output.includes("const Task ="));
    assert(output.includes("const TaskList ="));
    assert(output.includes("const RuntimeExpression ="));
    assert(output.includes("export const workflowSchema ="));

  const compiled = compileEsmModule(output, "workflowSchema");
  assert(compiled.hasExport);
  assert(compiled.hasSafeParse);
  assert(compiled.parseSuccess === false);
});

  test("workflow schema type-checks without loosening types", (assert) => {
    const schema = yaml.load(
      readFileSync("test/fixtures/workflow.yaml", "utf8"),
    ) as Record<string, unknown>;

    const source = jsonSchemaToZod(schema, {
      module: "esm",
      name: "workflowSchema",
    });

    const dir = mkdtempSync(join(process.cwd(), ".tmp-workflow-ts-"));
    const schemaPath = join(dir, "schema.ts");
    writeFileSync(schemaPath, source);

    const tscPath = join(process.cwd(), "node_modules/.bin/tsc");
    const { status, stderr } = spawnSync(tscPath, [
      "--noEmit",
      "--module",
      "Node16",
      "--moduleResolution",
      "node16",
      "--target",
      "ES2022",
      schemaPath,
    ], {
      encoding: "utf8",
    });

    rmSync(dir, { recursive: true, force: true });

    assert(status, 0);
    assert(!stderr);
  });
});

function compileEsmModule(source: string, exportName: string) {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-workflow-schema-"));
  const schemaPath = join(dir, "schema.mjs");
  const runnerPath = join(dir, "runner.mjs");

  writeFileSync(schemaPath, source);

  const runner = `import { ${exportName} } from './schema.mjs';
const parsed = typeof ${exportName} === 'object' && typeof ${exportName}.safeParse === 'function'
  ? ${exportName}.safeParse({})
  : null;

console.log(JSON.stringify({
  hasExport: Boolean(${exportName}),
  hasSafeParse: typeof ${exportName} === 'object' && typeof ${exportName}.safeParse === 'function',
  parseSuccess: parsed ? parsed.success : null,
}));
`;

  writeFileSync(runnerPath, runner);

  const { status, stdout, stderr, error } = spawnSync(process.execPath, [
    runnerPath,
  ], {
    encoding: "utf8",
  });

  rmSync(dir, { recursive: true, force: true });

  if (status !== 0) {
    throw new Error(
      stderr || (error ? String(error) : "Failed to run compiled schema"),
    );
  }

  return JSON.parse(stdout);
}
