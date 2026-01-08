import ts from "typescript";
import { jsonSchemaToZod } from "../src/jsonSchemaToZod.js";
import { suite } from "./suite.js";

const transpiles = (source: string): boolean => {
  const { diagnostics } = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2020,
    },
  });
  return !diagnostics || diagnostics.length === 0;
};

suite("emitZod parse-back", (test) => {
  test("simple default export is valid TS/ESM", (assert) => {
    const code = jsonSchemaToZod({ type: "string" });
    assert(transpiles(code), true);
  });

  test("named schema with type export is valid TS/ESM", (assert) => {
    const code = jsonSchemaToZod({ type: "number" }, { name: "NumSchema", type: true });
    assert(transpiles(code), true);
  });
});
