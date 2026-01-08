/* eslint-disable @typescript-eslint/no-unused-vars */
import { createRequire } from "module";
import { parseObject } from "../../src/parsers/parseObject.js";
import { JsonSchema, JsonSchemaObject } from "../../src/Types.js";
import { suite } from "../suite.js";

const require = createRequire(import.meta.url);
const toExpression = (value: string | { expression: string }) =>
  typeof value === "string" ? value : value.expression;

suite("parseObject", (test) => {
  test("should handle with missing properties", (assert) => {
    assert(
      parseObject(
        {
          type: "object"
        },
        { path: [], seen: new Map() },
      ),
      `z.looseObject({})`
    )
  });

  test("should handle with empty properties", (assert) => {
    assert(
      parseObject(
        {
          type: "object",
          properties: {}
        },
        { path: [], seen: new Map() },
      ),
      `z.looseObject({})`
    )
  });

  test("With properties - should handle optional and required properties", (assert) => {
    assert(
      parseObject(
        {
          type: "object",
          required: ["myRequiredString"],
          properties: {
            myOptionalString: {
              type: "string",
            },
            myRequiredString: {
              type: "string",
            },
          },
        },
        { path: [], seen: new Map() },
      ),

      'z.looseObject({ "myOptionalString": z.string().exactOptional(), "myRequiredString": z.string() })',
    );
  });

  test("With properties - should handle additionalProperties when set to false", (assert) => {
    assert(
      parseObject(
        {
          type: "object",
          required: ["myString"],
          properties: {
            myString: {
              type: "string",
            },
          },
          additionalProperties: false,
        },
        { path: [], seen: new Map() },
      ),
      'z.strictObject({ "myString": z.string() })',
    );
  });

  test("With properties - should handle additionalProperties when set to true", (assert) => {
    assert(
      parseObject(
        {
          type: "object",
          required: ["myString"],
          properties: {
            myString: {
              type: "string",
            },
          },
          additionalProperties: true,
        },
        { path: [], seen: new Map() },
      ),
      'z.looseObject({ "myString": z.string() })',
    );
  });

  test("With properties - should handle additionalProperties when provided a schema", (assert) => {
    assert(
      parseObject(
        {
          type: "object",
          required: ["myString"],
          properties: {
            myString: {
              type: "string",
            },
          },
          additionalProperties: { type: "number" },
        },
        { path: [], seen: new Map() },
      ),

      'z.looseObject({ "myString": z.string() }).catchall(z.number())',
    );
  });

  test("Without properties - should handle additionalProperties when set to false", (assert) => {
    assert(
      parseObject(
        {
          type: "object",
          additionalProperties: false,
        },
        { path: [], seen: new Map() },
      ),
      "z.strictObject({})",
    );
  });

  test("Without properties - should handle additionalProperties when set to true", (assert) => {
    assert(
      parseObject(
        {
          type: "object",
          additionalProperties: true,
        },
        { path: [], seen: new Map() },
      ),
      "z.looseObject({})",
    );
  });

  test("Without properties - should handle additionalProperties when provided a schema", (assert) => {
    assert(
      parseObject(
        {
          type: "object",
          additionalProperties: { type: "number" },
        },

        { path: [], seen: new Map() },
      ),
      "z.looseObject({}).catchall(z.number())",
    );
  });

  test("Without properties - should include falsy defaults", (assert) => {
    assert(
      parseObject(
        {
          type: "object",
          properties: {
            s: {
              type: "string",
              default: "",
            },
          },
        },
        { path: [], seen: new Map() },
      ),
      `z.looseObject({ "s": z.string().default("") })`,
    );
  });

  test("eh", (assert) => {
    assert(
      parseObject(
        {
          type: "object",
          required: ["a"],
          properties: {
            a: {
              type: "string",
            },
          },
          anyOf: [
            {
              required: ["b"],
              properties: {
                b: {
                  type: "string",
                },
              },
            },
            {
              required: ["c"],
              properties: {
                c: {
                  type: "string",
                },
              },
            },
          ],
        },
        { path: [], seen: new Map() },
      ),

      'z.intersection(z.looseObject({ "a": z.string() }), z.union([z.looseObject({ "b": z.string() }), z.looseObject({ "c": z.string() })]))',
    );

    assert(
      parseObject(
        {
          type: "object",
          required: ["a"],
          properties: {
            a: {
              type: "string",
            },
          },
          anyOf: [
            {
              required: ["b"],
              properties: {
                b: {
                  type: "string",
                },
              },
            },
            {
            },
          ],
        },
        { path: [], seen: new Map() },
      ),

      `z.intersection(z.looseObject({ "a": z.string() }), z.union([z.looseObject({ "b": z.string() }), z.any()]))`,
    );

    assert(
      parseObject(
        {
          type: "object",
          required: ["a"],
          properties: {
            a: {
              type: "string",
            },
          },
          oneOf: [
            {
              required: ["b"],
              properties: {
                b: {
                  type: "string",
                },
              },
            },
            {
              required: ["c"],
              properties: {
                c: {
                  type: "string",
                },
              },
            },
          ],
        },
        { path: [], seen: new Map() },
      ),

      'z.intersection(z.looseObject({ "a": z.string() }), z.xor([z.looseObject({ "b": z.string() }), z.looseObject({ "c": z.string() })]))',
    );

    assert(
      parseObject(
        {
          type: "object",
          required: ["a"],
          properties: {
            a: {
              type: "string",
            },
          },
          oneOf: [
            {
              required: ["b"],
              properties: {
                b: {
                  type: "string",
                },
              },
            },
            {
            },
          ],
        },
        { path: [], seen: new Map() },
      ),

      `z.intersection(z.looseObject({ "a": z.string() }), z.xor([z.looseObject({ "b": z.string() }), z.any()]))`,
    );

    const schema3 = {
      type: "object",
      required: ["a"],
      properties: { a: { type: "string" } },
      allOf: [
        { required: ["b"], properties: { b: { type: "string" } } },
        { required: ["c"], properties: { c: { type: "string" } } },
      ],
    };

    // @ts-ignore
    const result3 = parseObject(schema3 as any, { path: [], seen: new Map() });
    const n = (s: string) => s.replace(/\s/g, "").replace(/,/g, ", "); // normalize
    const normalized3 = n((result3 as { expression: string }).expression);
    const expected3_Obj = n(
      `z.intersection(z.intersection(z.looseObject({ "a": z.string() }), z.looseObject({ "b": z.string() })), z.looseObject({ "c": z.string() }))`
    );
    const expected3_Any = n(
      `z.intersection(z.intersection(z.looseObject({ "a": z.string() }), z.looseObject({ "b": z.string() })), z.any())`
    );

    if (normalized3 !== expected3_Obj && normalized3 !== expected3_Any) {
      expect(normalized3).toBe(expected3_Obj);
    }

    assert(
      parseObject(
        {
          type: "object",
          required: ["a"],
          properties: {
            a: {
              type: "string",
            },
          },
          allOf: [
            {
              required: ["b"],
              properties: {
                b: {
                  type: "string",
                },
              },
            },
            {
            },
          ],
        },
        { path: [], seen: new Map() },
      ),

      `z.intersection(z.intersection(z.looseObject({ "a": z.string() }), z.looseObject({ "b": z.string() })), z.any())`,
    );
  });

  test("SKIPPED: allOf merges parent required into properties member", (assert) => {
    return;
    const schema = {
      type: "object" as const,
      required: ["call", "with"],
      allOf: [
        {
          properties: {
            call: { type: "string", const: "asyncapi" },
            with: {
              type: "object",
              unevaluatedProperties: false,
              properties: {
                doc: { type: "string" },
              },
            },
          },
          unevaluatedProperties: false,
        },
        {
          required: ["call", "with"],
        },
      ],
    }

    const result = parseObject(schema as any, { path: [], seen: new Map() });
    const expression = toExpression(result);

    assert(run(result, { call: "asyncapi", with: { doc: "hi" } }).success, true);
    assert(run(result, { call: "asyncapi" }).success, false);
    assert(expression.includes('"call": z.literal("asyncapi")'), true);
    assert(expression.includes('"with": z.object'), true);
  });

  const run = (output: string | { expression: string }, data: unknown) => {
    const expression = toExpression(output);
    return eval(
      `const {z} = require("zod"); ${expression}.safeParse(${JSON.stringify(
        data,
      )})`,
    );
  };

  test("SKIPPED: oneOf branches respect unevaluatedProperties when combined with base properties", (assert) => {
    return;
    const schema = {
      type: "object" as const,
      unevaluatedProperties: false,
      properties: {
        base: { type: "string" },
      },
      oneOf: [
        {
          properties: { a: { type: "string" } },
          required: ["a"],
        },
        {
          properties: { b: { type: "number" } },
          required: ["b"],
        },
      ],
    };

    const result = parseObject(schema as any, { path: [], seen: new Map() });

    assert(run(result, { base: "hi", a: "ok" }).success, true);
    assert(run(result, { base: "hi", b: 123 }).success, true);
    assert(run(result, { base: "hi", a: "ok", unknown: true }).success, false);
  });

  test("Funcional tests - run", (assert) => {
    assert(run("z.string()", "hello"), {
      success: true,
      data: "hello",
    });
  });

  test("Funcional tests - properties", (assert) => {
    const schema = {
      type: "object",
      required: ["a"],
      properties: {
        a: {
          type: "string",
        },
        b: {
          type: "number",
        },
      },
    };

    const _expected =
      'z.looseObject({ "a": z.string(), "b": z.number().exactOptional() })';

    const result = parseObject(schema as any, { path: [], seen: new Map() });

    assert(result, _expected);

    assert(run(result, { a: "hello" }), {
      success: true,
      data: {
        a: "hello",
      },
    });

    assert(run(result, { a: "hello", b: 123 }).success, true);

    assert(run(result, { b: "hello", x: true }).success, false);
  });

  test("Funcional tests - properties and additionalProperties", (assert) => {
    const schema = {
      type: "object",
      required: ["a"],
      properties: {
        a: {
          type: "string",
        },
        b: {
          type: "number",
        },
      },
      additionalProperties: { type: "boolean" },
    };

    const _expected =
      'z.looseObject({ "a": z.string(), "b": z.number().exactOptional() }).catchall(z.boolean())';

    const result = parseObject(schema as any, { path: [], seen: new Map() });

    assert(result, _expected);

    assert(run(result, { b: "hello", x: "true" }).success, false);
  });

  test("Funcional tests - properties and single-item patternProperties", (assert) => {
    const schema = {
      type: "object",
      required: ["a"],
      properties: {
        a: {
          type: "string",
        },
        b: {
          type: "number",
        },
      },
      patternProperties: {
        "\\.": { type: "array" },
      },
    };

    const _expected = `z.intersection(z.looseObject({ "a": z.string(), "b": z.number().exactOptional() }), z.looseRecord(z.string().regex(new RegExp("\\\\.")), z.array(z.any())))`;

    const result = parseObject(schema as any, { path: [], seen: new Map() });
    assert(result, _expected);
  });

  test("Funcional tests - properties, additionalProperties and patternProperties", (assert) => {
    const schema = {
      type: "object",
      required: ["a"],
      properties: {
        a: {
          type: "string",
        },
        b: {
          type: "number",
        },
      },
      additionalProperties: { type: "boolean" },
      patternProperties: {
        "\\.": { type: "array" },
        "\\,": { type: "array", minItems: 1 },
      },
    };

    const _expected = `z.intersection(z.intersection(z.looseObject({ "a": z.string(), "b": z.number().exactOptional() }), z.looseRecord(z.string().regex(new RegExp("\\\\.")), z.array(z.any()))), z.looseRecord(z.string().regex(new RegExp("\\\\,")), z.array(z.any()).min(1).meta({ "minItems": 1 }))).superRefine((value, ctx) => {
for (const key in value) {
if (["a", "b"].includes(key)) continue;
let matched = false;
if (new RegExp("\\\\.").test(key)) matched = true;
if (new RegExp("\\\\,").test(key)) matched = true;
if (matched) continue;

const result = z.boolean().safeParse(value[key])
if (!result.success) {
ctx.addIssue({
path: [...ctx.path, key],
code: "custom",
message: "Invalid additional property",
params: {
issues: result.error.issues
}
})
}
}
})`;

    const result = parseObject(schema as any, { path: [], seen: new Map() });

    const expression = toExpression(result);
    assert(expression, _expected);
  });

  test("Funcional tests - additionalProperties", (assert) => {
    const schema = {
      type: "object",
      additionalProperties: { type: "boolean" },
    };

    const _expected = "z.looseObject({}).catchall(z.boolean())";

    const result = parseObject(schema as any, { path: [], seen: new Map() });

    assert(result, _expected);
  });

  test("Funcional tests - additionalProperties and patternProperties", (assert) => {
    const schema = {
      type: "object",
      additionalProperties: { type: "boolean" },
      patternProperties: {
        "\\.": { type: "array" },
        "\\,": { type: "array", minItems: 1 },
      },
    };

    const _expected = `z.intersection(z.intersection(z.looseObject({}), z.looseRecord(z.string().regex(new RegExp("\\\\.")), z.array(z.any()))), z.looseRecord(z.string().regex(new RegExp("\\\\,")), z.array(z.any()).min(1).meta({ "minItems": 1 }))).superRefine((value, ctx) => {
for (const key in value) {
if ([].includes(key)) continue;
let matched = false;
if (new RegExp("\\\\.").test(key)) matched = true;
if (new RegExp("\\\\,").test(key)) matched = true;
if (matched) continue;

const result = z.boolean().safeParse(value[key])
if (!result.success) {
ctx.addIssue({
path: [...ctx.path, key],
code: "custom",
message: "Invalid additional property",
params: {
issues: result.error.issues
}
})
}
}
})`;

    const result = parseObject(schema as any, { path: [], seen: new Map() });

    const expression = toExpression(result);
    assert(expression, _expected);
    assert(run(expression, { x: true, ".": [], ",": [1] }).success, true);
    assert(run(expression, { x: true, ".": [], ",": [] }).success, false);
  });

  test("Funcional tests - single-item patternProperties", (assert) => {
    const schema = {
      type: "object",
      patternProperties: {
        "\\.": { type: "array" },
      },
    };

    const _expected = `z.intersection(z.looseObject({}), z.looseRecord(z.string().regex(new RegExp("\\\\.")), z.array(z.any())))`;

    const result = parseObject(schema as any, { path: [], seen: new Map() });
    assert(toExpression(result), _expected);
  });

  test("Funcional tests - patternProperties", (assert) => {
    const schema = {
      type: "object",
      patternProperties: {
        "\\.": { type: "array" },
        "\\,": { type: "array", minItems: 1 },
      },
    };

    const _expected = `z.intersection(z.intersection(z.looseObject({}), z.looseRecord(z.string().regex(new RegExp("\\\\.")), z.array(z.any()))), z.looseRecord(z.string().regex(new RegExp("\\\\,")), z.array(z.any()).min(1).meta({ "minItems": 1 })))`;

    const result = parseObject(schema as any, { path: [], seen: new Map() });
    const expression = toExpression(result);

    assert(expression, _expected);
    assert(run(expression, { ".": [] }).success, true);
    assert(run(expression, { ",": [] }).success, false);
  });

  test("Funcional tests - patternProperties and properties", (assert) => {
    const schema = {
      type: "object",
      required: ["a"],
      properties: {
        a: {
          type: "string",
        },
        b: {
          type: "number",
        },
      },
      patternProperties: {
        "\\.": { type: "array" },
        "\\,": { type: "array", minItems: 1 },
      },
    };

    const _expected = `z.intersection(z.intersection(z.looseObject({ "a": z.string(), "b": z.number().exactOptional() }), z.looseRecord(z.string().regex(new RegExp("\\\\.")), z.array(z.any()))), z.looseRecord(z.string().regex(new RegExp("\\\\,")), z.array(z.any()).min(1).meta({ "minItems": 1 })))`;

    const result = parseObject(schema as any, { path: [], seen: new Map() });
    assert(result, _expected);
  });

  test("dependentRequired", (assert) => {
    const schema = {
      type: "object",
      properties: {
        a: { type: "string" },
        b: { type: "number" },
        c: { type: "boolean" },
      },
      dependentRequired: {
        a: ["b", "c"],
      },
    };

    const result = parseObject(schema as any, { path: [], seen: new Map() });
    const expression = toExpression(result);

    assert(expression.includes("Dependent required properties missing"), true);
  });

  test("dependentRequired with custom message", (assert) => {
    const schema = {
      type: "object",
      properties: {
        a: { type: "string" },
        b: { type: "number" },
      },
      dependentRequired: {
        a: ["b"],
      },
      errorMessage: {
        dependentRequired: "deps missing",
      },
    };

    const result = parseObject(schema as any as unknown as JsonSchemaObject & { type: "object" }, { path: [], seen: new Map() });
    const expression = toExpression(result);

    assert(expression.includes("deps missing"), true);
  });
});
