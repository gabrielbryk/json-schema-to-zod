import ts from "typescript";
import { jsonSchemaToZod } from "../src/jsonSchemaToZod.js";
import { analyzeSchema } from "../src/core/analyzeSchema.js";
import { emitZod } from "../src/core/emitZod.js";
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

  test("adds type annotations when splitting getter-based recursive objects", (assert) => {
    const schema = {
      $defs: {
        node: {
          type: "object",
          properties: {
            value: { type: "string" },
            next: { $ref: "#/$defs/node" },
          },
          required: ["value"],
        },
      },
      $ref: "#/$defs/node",
    };

    const analysis = analyzeSchema(schema, { exportRefs: true });
    analysis.options = {
      ...analysis.options,
      parserOverride: (_schema, refs) => {
        if (refs.currentSchemaName === "NodeSchema") {
          return `z.object({ "value": z.string(), get "next"(): z.ZodOptional<z.ZodLazy<typeof NodeSchema>> { return z.lazy(() => NodeSchema).optional(); } }).strict()`;
        }
      },
    };

    const code = emitZod(analysis);

    assert(code.includes("const _NodeSchema = z.object({"), true);
    assert(code.includes("export const NodeSchema:"), true);
  });
});
