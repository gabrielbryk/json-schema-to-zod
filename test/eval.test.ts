import { createRequire } from "module";
import { jsonSchemaToZod } from "../src/jsonSchemaToZod.js";
import { suite } from "./suite";

const require = createRequire(import.meta.url);

suite("eval", (test) => {
  test("is usable I guess", (assert) => {
    const code = jsonSchemaToZod({ type: "string" }, { module: "cjs" });
    const module = { exports: {} as unknown };
    const exports = module.exports;
    const zodSchema = new Function(
      "require",
      "module",
      "exports",
      `${code}; return module.exports;`,
    )(require, module, exports);

    assert(zodSchema.safeParse("Please just use Ajv instead"), {
      success: true,
      data: "Please just use Ajv instead",
    });
  });
});
