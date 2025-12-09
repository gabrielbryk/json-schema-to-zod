import { readFileSync } from "fs";
import yaml from "js-yaml";
import jsonSchemaToZod from "../src/index.js";
import { suite } from "./suite";

suite("workflow.yaml", (test) => {
  test("converts workflow schema fixture", (assert) => {
    const schema = yaml.load(
      readFileSync("test/fixtures/workflow.yaml", "utf8"),
    ) as any;

    const output = jsonSchemaToZod(schema, {
      module: "esm",
      name: "workflowSchema",
    });

    assert(typeof output === "string");
    assert(output.includes("const Task ="));
    assert(output.includes("const TaskList ="));
    assert(output.includes("const RuntimeExpression ="));
    assert(output.includes("export const workflowSchema ="));
  });
});
