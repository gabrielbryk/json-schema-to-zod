import { readFileSync } from "fs";
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
