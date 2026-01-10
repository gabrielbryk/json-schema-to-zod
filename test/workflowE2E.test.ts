import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";
import yaml from "js-yaml";
import jsonSchemaToZod from "../src/index.js";
import { suite } from "./suite.js";
import { typecheckEsm } from "./utils/typecheckEsm.js";

suite("workflow.yaml e2e typecheck", (test) => {
  test("consumer access patterns align with generated schema", (assert) => {
    const schema = yaml.load(readFileSync("test/fixtures/workflow.yaml", "utf8")) as Record<
      string,
      unknown
    >;

    const output = jsonSchemaToZod(schema, {
      name: "workflowSchema",
    });

    const consumerCode = readFileSync("test/fixtures/e2e/workflow.yaml.consumer.ts", "utf8");
    const assertionsFile = readFileSync("test/fixtures/e2e/type-assertions.ts", "utf8");
    const { status, diagnostics } = typecheckEsm({
      schemaCode: output,
      consumerCode,
      extraFiles: [{ fileName: "type-assertions.ts", contents: assertionsFile }],
    });

    assert(status === 0);
    assert(diagnostics, "");
  });
});

const compileAndValidate = (source: string, exportName: string, data: unknown) => {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-workflow-spec-"));
  const schemaPath = join(dir, "schema.ts");
  const runnerPath = join(dir, "runner.ts");

  writeFileSync(schemaPath, source);

  const runner = `import { ${exportName} } from './schema.js';

const data = ${JSON.stringify(data)};
const result = ${exportName}.safeParse(data);

console.log(JSON.stringify({
  success: result.success,
  issues: result.success ? [] : result.error.issues
}));
`;

  writeFileSync(runnerPath, runner);

  const tsxPath = join(process.cwd(), "node_modules/.bin/tsx");
  const { status, stdout, stderr, error } = spawnSync(tsxPath, [runnerPath], {
    encoding: "utf8",
    cwd: dir,
  });

  rmSync(dir, { recursive: true, force: true });

  if (status !== 0) {
    throw new Error(stderr || (error ? String(error) : "Failed to run validation"));
  }

  return JSON.parse(stdout);
};

suite("serverless workflow spec e2e", (test) => {
  test("nested container workflow validates", (assert) => {
    const schema = yaml.load(readFileSync("test/fixtures/workflow-spec.yaml", "utf8")) as Record<
      string,
      unknown
    >;
    const output = jsonSchemaToZod(schema, {
      name: "Workflow",
      exportRefs: true,
    });

    const input = {
      document: {
        dsl: "1.0.2",
        namespace: "demo",
        name: "sample",
        version: "1.0.0",
      },
      do: [
        {
          processAll: {
            for: { each: "item", in: "${items}" },
            do: [
              {
                step: { set: { x: 1 } },
              },
            ],
          },
        },
      ],
    };

    const result = compileAndValidate(output, "Workflow", input);
    assert(result.success, true);
  });
});
