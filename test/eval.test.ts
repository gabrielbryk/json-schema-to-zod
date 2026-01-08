import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { jsonSchemaToZod } from "../src/jsonSchemaToZod.js";
import { suite } from "./suite.js";

suite("eval", (test) => {
  test("generated ESM schema is importable and validates correctly", (assert) => {
    const code = jsonSchemaToZod({ type: "string" }, { name: "mySchema" });

    // Write to a temp file
    const tmpFile = `.tmp-eval-test-${Date.now()}.ts`;
    const runnerCode = `
${code}
const result = mySchema.safeParse("Please just use Ajv instead");
console.log(JSON.stringify(result));
`;

    writeFileSync(tmpFile, runnerCode, "utf-8");

    try {
      const { stdout, stderr } = spawnSync("tsx", [tmpFile], { encoding: "utf-8" });

      if (stderr) {
        console.error("Runner stderr:", stderr);
      }

      const result = JSON.parse(stdout.trim());
      assert(result, {
        success: true,
        data: "Please just use Ajv instead",
      });
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  });
});
