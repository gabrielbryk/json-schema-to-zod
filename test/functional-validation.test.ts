/**
 * Functional Validation Tests
 *
 * These tests ensure ALL generated Zod code actually compiles and runs
 * with the current Zod version. This catches breaking changes like:
 * - .errors -> .issues (Zod v4)
 * - z.record(value) -> z.record(key, value) (Zod v4)
 * - Method renames, API changes, etc.
 */

import { createRequire } from "module";
import { parseSchema } from "../src/parsers/parseSchema.js";
import { JsonSchema } from "../src/Types.js";
import { suite } from "./suite.js";

const require = createRequire(import.meta.url);

const toExpression = (value: string | { expression: string }): string =>
  typeof value === "string" ? value : value.expression;

const esmToCjs = (code: string): string => {
  const importsReplaced = code.replace(/^import { z } from "zod";?\n?/m, 'const { z } = require("zod");\n');
  const hasDefaultExport = /^export default /m.test(importsReplaced);
  const exportedConsts = Array.from(importsReplaced.matchAll(/^export const (\w+) =/gm)).map((m) => m[1]);

  let transformed = importsReplaced
    .replace(/^export const (\w+) =/gm, "const $1 =")
    .replace(/^export default /m, "const __default__ = ")
    .replace(/^export type .*$/gm, "");

  if (hasDefaultExport || exportedConsts.length) {
    const exportsList = [
      ...(hasDefaultExport ? ["__default__"] : []),
      ...exportedConsts,
    ];
    const exportValue = exportsList.length === 1 ? exportsList[0] : `{ ${exportsList.join(", ")} }`;
    transformed += `\nmodule.exports = ${exportValue};`;
  }

  return transformed;
};

const runZodCode = <T = unknown>(zodCode: string): T => {
  const isEsm = /export (default|const)/.test(zodCode) || /^import { z } from "zod"/m.test(zodCode);

  if (!isEsm) {
    return new Function("require", `
      const { z } = require("zod");
      return (${zodCode});
    `)(require) as T;
  }

  const normalized = esmToCjs(zodCode);
  const module = { exports: {} as T };
  const exports = module.exports;

  new Function("require", "module", "exports", normalized)(require, module, exports);

  return module.exports;
};

// Helper to eval generated code and run safeParse
const evalAndParse = (zodCode: string | { expression: string }, data: unknown) => {
  const code = toExpression(zodCode);
  try {
    const schema = runZodCode<{ safeParse: (value: unknown) => unknown }>(
      code,
    );
    return { compiled: true, result: schema.safeParse(data) };
  } catch (e) {
    return { compiled: false, error: e instanceof Error ? e.message : String(e) };
  }
};

// Helper to just check if code compiles
const canCompile = (zodCode: string | { expression: string }): { success: boolean; error?: string } => {
  const code = toExpression(zodCode);
  try {
    runZodCode(code);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
};

suite("functional-validation", (test) => {

  test("if-then-else should compile and run", (assert) => {
    const schema = {
      if: { type: "string" },
      then: { type: "number" },
      else: { type: "boolean" }
    };

    const code = parseSchema(schema, { path: [], seen: new Map() });
    const result = canCompile(code);

    if (!result.success) {
      console.error("Generated code:", code);
      console.error("Compilation error:", result.error);
    }

    assert(result.success, true);
  });

  test("if-then-else should handle validation failures without crashing", (assert) => {
    // This schema tests the error path in if-then-else:
    // - if value is string → then requires minLength 10
    // - else requires number >= 100
    const schema = {
      if: { type: "string" },
      then: { type: "string", minLength: 10 },
      else: { type: "number", minimum: 100 }
    };

    const code = parseSchema(schema, { path: [], seen: new Map() });

    // Test with "hi" - matches if (is string), but fails then (too short)
    // This hits the error path and should surface ZodError.issues cleanly
    const compiled = evalAndParse(code, "hi");

    if (!compiled.compiled) {
      console.error("Generated code:", code);
      console.error("Runtime error:", compiled.error);
    }

    assert(compiled.compiled, true);
    if (compiled.compiled) {
      // Validation should fail (string too short), but shouldn't crash
      assert((compiled.result as { success: boolean }).success, false);
    }
  });

  test("if-then-else with object should compile and run", (assert) => {
    const schema = {
      type: "object",
      properties: {
        cleanup: {
          type: "string",
          enum: ["always", "never", "eventually"],
          default: "never"
        },
        after: { type: "string" }
      },
      if: {
        properties: { cleanup: { const: "eventually" } }
      },
      then: {
        required: ["after"]
      },
      else: {
        not: { required: ["after"] }
      }
    };

    const code = parseSchema(schema, { path: [], seen: new Map() });
    const result = canCompile(code);

    if (!result.success) {
      console.error("Generated code:", code);
      console.error("Compilation error:", result.error);
    }

    assert(result.success, true);
  });

  test("record with value schema should compile", (assert) => {
    const schema = {
      type: "object",
      additionalProperties: { type: "string" }
    };

    const code = parseSchema(schema, { path: [], seen: new Map() });
    const result = canCompile(code);

    if (!result.success) {
      console.error("Generated code:", code);
      console.error("Compilation error:", result.error);
    }

    assert(result.success, true);
  });

  test("record with unknown value should compile", (assert) => {
    const schema = {
      type: "object",
      additionalProperties: true
    };

    const code = parseSchema(schema, { path: [], seen: new Map() });
    const result = canCompile(code);

    if (!result.success) {
      console.error("Generated code:", code);
      console.error("Compilation error:", result.error);
    }

    assert(result.success, true);
  });

  test("allOf with objects should compile", (assert) => {
    const schema = {
      allOf: [
        { type: "object", properties: { a: { type: "string" } } },
        { type: "object", properties: { b: { type: "number" } } }
      ]
    };

    const code = parseSchema(schema as unknown as JsonSchema, { path: [], seen: new Map() });
    const result = canCompile(code);

    if (!result.success) {
      console.error("Generated code:", code);
      console.error("Compilation error:", result.error);
    }

    assert(result.success, true);
  });

  test("anyOf should compile and validate correctly", (assert) => {
    const schema = {
      anyOf: [
        { type: "string" },
        { type: "number" }
      ]
    };

    const code = parseSchema(schema, { path: [], seen: new Map() });
    const compiled = evalAndParse(code, "hello");

    assert(compiled.compiled, true);
    if (compiled.compiled) {
      assert((compiled.result as { success: boolean }).success, true);
    }
  });

  test("oneOf should compile and validate correctly", (assert) => {
    const schema = {
      oneOf: [
        { type: "string" },
        { type: "number" }
      ]
    };

    const code = parseSchema(schema, { path: [], seen: new Map() });
    const compiled = evalAndParse(code, "hello");

    assert(compiled.compiled, true);
    if (compiled.compiled) {
      assert((compiled.result as { success: boolean }).success, true);
    }
  });

  test("not should compile", (assert) => {
    const schema = {
      not: { type: "string" }
    };

    const code = parseSchema(schema, { path: [], seen: new Map() });
    const result = canCompile(code);

    if (!result.success) {
      console.error("Generated code:", code);
      console.error("Compilation error:", result.error);
    }

    assert(result.success, true);
  });

  test("patternProperties should compile", (assert) => {
    const schema = {
      type: "object",
      patternProperties: {
        "^S_": { type: "string" },
        "^I_": { type: "integer" }
      }
    };

    const code = parseSchema(schema, { path: [], seen: new Map() });
    const result = canCompile(code);

    if (!result.success) {
      console.error("Generated code:", code);
      console.error("Compilation error:", result.error);
    }

    assert(result.success, true);
  });

  test("complex nested schema should compile", (assert) => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        config: {
          type: "object",
          additionalProperties: { type: "string" }
        },
        items: {
          type: "array",
          items: {
            anyOf: [
              { type: "string" },
              { type: "object", additionalProperties: true }
            ]
          }
        }
      }
    };

    const code = parseSchema(schema, { path: [], seen: new Map() });
    const result = canCompile(code);

    if (!result.success) {
      console.error("Generated code:", code);
      console.error("Compilation error:", result.error);
    }

    assert(result.success, true);
  });

  test("full parseSchema output should be importable", (assert) => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" }
      },
      required: ["name"]
    };

    const code = parseSchema(schema, { path: [], seen: new Map() });
    const expression = toExpression(code);

    try {
      const zodSchema = runZodCode<{ safeParse: (v: unknown) => { success: boolean } }>(expression);
      const result = zodSchema.safeParse({ name: "test", age: 25 });
      assert(result.success, true);
    } catch (e) {
      console.error("Generated code:", expression);
      console.error("Error:", e);
      assert(false, true);
    }
  });
});
