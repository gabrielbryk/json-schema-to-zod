/* eslint-disable @typescript-eslint/no-unused-vars */
import { createRequire } from "module";
import { JSONSchema7 } from "json-schema";
import { parseObject } from "../../src/parsers/parseObject";
import { suite } from "../suite";

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
      `z.record(z.string(), z.any())`
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
      `z.object({})`
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

      'z.object({ "myOptionalString": z.string().optional(), "myRequiredString": z.string() })',
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
      'z.object({ "myString": z.string() }).strict()',
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
      'z.object({ "myString": z.string() }).catchall(z.any())',
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

      'z.object({ "myString": z.string() }).catchall(z.number())',
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
      "z.record(z.string(), z.never())",
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
      "z.record(z.string(), z.any())",
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
      "z.record(z.string(), z.number())",
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
      `z.object({ "s": z.string().default("") })`,
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

      'z.object({ "a": z.string() }).and(z.union([z.object({ "b": z.string() }), z.object({ "c": z.string() })]))',
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

      `z.object({ "a": z.string() }).and(z.union([z.object({ "b": z.string() }), z.any()]))`,
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

      `z.object({ "a": z.string() }).and(z.union([z.object({ "b": z.string() }).strict(), z.object({ "c": z.string() }).strict()]))`,
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

      `z.object({ "a": z.string() }).and(z.union([z.object({ "b": z.string() }).strict(), z.any()]))`,
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

      'z.object({ "a": z.string() }).and(z.intersection(z.object({ "b": z.string() }), z.object({ "c": z.string() })))',
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

      `z.object({ "a": z.string() }).and(z.intersection(z.object({ "b": z.string() }), z.any()))`,
    );
  });

  const run = (output: string | { expression: string }, data: unknown) => {
    const expression = toExpression(output);
    return eval(
      `const {z} = require("zod"); ${expression}.safeParse(${JSON.stringify(
        data,
      )})`,
    );
  };

  test("Funcional tests - run", (assert) => {
    assert(run("z.string()", "hello"), {
      success: true,
      data: "hello",
    });
  });

  test("Funcional tests - properties", (assert) => {
    const schema: JSONSchema7 & { type: "object" } = {
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
      'z.object({ "a": z.string(), "b": z.number().optional() })';

    const result = parseObject(schema, { path: [], seen: new Map() });

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
    const schema: JSONSchema7 & { type: "object" } = {
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
      'z.object({ "a": z.string(), "b": z.number().optional() }).catchall(z.boolean())';

    const result = parseObject(schema, { path: [], seen: new Map() });

    assert(result, _expected);

    assert(run(result, { b: "hello", x: "true" }).success, false);
  });

  test("Funcional tests - properties and single-item patternProperties", (assert) => {
    const schema: JSONSchema7 & { type: "object" } = {
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

    const _expected = `z.object({ "a": z.string(), "b": z.number().optional() }).catchall(z.array(z.any())).superRefine((value, ctx) => {
for (const key in value) {
if (key.match(new RegExp("\\\\."))) {
const result = z.array(z.any()).safeParse(value[key])
if (!result.success) {
ctx.addIssue({
          path: [...(ctx.path ?? []), key],
          code: 'custom',
          message: \`Invalid input: Key matching regex /\${key}/ must match schema\`,
          params: {
            issues: result.error.issues
          }
        })
}
}
}
})`;

    const result = parseObject(schema, { path: [], seen: new Map() });
    assert(result, _expected);
  });

  test("Funcional tests - properties, additionalProperties and patternProperties", (assert) => {
    const schema: JSONSchema7 & { type: "object" } = {
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

    const _expected = `z.object({ "a": z.string(), "b": z.number().optional() }).catchall(z.union([z.array(z.any()), z.array(z.any()).min(1), z.boolean()])).superRefine((value, ctx) => {
for (const key in value) {
let evaluated = ["a", "b"].includes(key)
if (key.match(new RegExp("\\\\."))) {
evaluated = true
const result = z.array(z.any()).safeParse(value[key])
if (!result.success) {
ctx.addIssue({
          path: [...(ctx.path ?? []), key],
          code: 'custom',
          message: \`Invalid input: Key matching regex /\${key}/ must match schema\`,
          params: {
            issues: result.error.issues
          }
        })
}
}
if (key.match(new RegExp("\\\\,"))) {
evaluated = true
const result = z.array(z.any()).min(1).safeParse(value[key])
if (!result.success) {
ctx.addIssue({
          path: [...(ctx.path ?? []), key],
          code: 'custom',
          message: \`Invalid input: Key matching regex /\${key}/ must match schema\`,
          params: {
            issues: result.error.issues
          }
        })
}
}
if (!evaluated) {
const result = z.boolean().safeParse(value[key])
if (!result.success) {
ctx.addIssue({
          path: [...(ctx.path ?? []), key],
          code: 'custom',
          message: \`Invalid input: must match catchall schema\`,
          params: {
            issues: result.error.issues
          }
        })
}
}
}
})`;

    const result = parseObject(schema, { path: [], seen: new Map() });

    const expression = toExpression(result);
    assert(expression.includes("superRefine"));
  });

  test("Funcional tests - additionalProperties", (assert) => {
    const schema: JSONSchema7 & { type: "object" } = {
      type: "object",
      additionalProperties: { type: "boolean" },
    };

    const _expected = "z.record(z.string(), z.boolean())";

    const result = parseObject(schema, { path: [], seen: new Map() });

    assert(result, _expected);
  });

  test("Funcional tests - additionalProperties and patternProperties", (assert) => {
    const schema: JSONSchema7 & { type: "object" } = {
      type: "object",
      additionalProperties: { type: "boolean" },
      patternProperties: {
        "\\.": { type: "array" },
        "\\,": { type: "array", minItems: 1 },
      },
    };

    const _expected = `z.record(z.string(), z.union([z.array(z.any()), z.array(z.any()).min(1), z.boolean()])).superRefine((value, ctx) => {
for (const key in value) {
let evaluated = false
if (key.match(new RegExp(\"\\\\.\"))) {
evaluated = true
const result = z.array(z.any()).safeParse(value[key])
if (!result.success) {
ctx.addIssue({
          path: [...(ctx.path ?? []), key],
          code: 'custom',
          message: \`Invalid input: Key matching regex /\${key}/ must match schema\`,
          params: {
            issues: result.error.issues
          }
        })
}
}
if (key.match(new RegExp(\"\\\\,\"))) {
evaluated = true
const result = z.array(z.any()).min(1).safeParse(value[key])
if (!result.success) {
ctx.addIssue({
          path: [...(ctx.path ?? []), key],
          code: 'custom',
          message: \`Invalid input: Key matching regex /\${key}/ must match schema\`,
          params: {
            issues: result.error.issues
          }
        })
}
}
if (!evaluated) {
const result = z.boolean().safeParse(value[key])
if (!result.success) {
ctx.addIssue({
          path: [...(ctx.path ?? []), key],
          code: 'custom',
          message: \`Invalid input: must match catchall schema\`,
          params: {
            issues: result.error.issues
          }
        })
}
}
}
})`;

    const result = parseObject(schema, { path: [], seen: new Map() });

    const expression = toExpression(result);
    assert(run(expression, { x: true, ".": [], ",": [] }).success, false);
  });

  test("Funcional tests - single-item patternProperties", (assert) => {
    const schema: JSONSchema7 & { type: "object" } = {
      type: "object",
      patternProperties: {
        "\\.": { type: "array" },
      },
    };

    const _expected = `z.record(z.string(), z.array(z.any())).superRefine((value, ctx) => {
for (const key in value) {
if (key.match(new RegExp("\\\\."))) {
const result = z.array(z.any()).safeParse(value[key])
if (!result.success) {
ctx.addIssue({
          path: [...(ctx.path ?? []), key],
          code: 'custom',
          message: \`Invalid input: Key matching regex /\${key}/ must match schema\`,
          params: {
            issues: result.error.issues
          }
        })
}
}
}
})`;

    const result = parseObject(schema, { path: [], seen: new Map() });
    assert(toExpression(result), _expected);
  });

  test("Funcional tests - patternProperties", (assert) => {
    const schema: JSONSchema7 & { type: "object" } = {
      type: "object",
      patternProperties: {
        "\\.": { type: "array" },
        "\\,": { type: "array", minItems: 1 },
      },
    };

    const _expected = `z.record(z.string(), z.union([z.array(z.any()), z.array(z.any()).min(1)])).superRefine((value, ctx) => {
for (const key in value) {
if (key.match(new RegExp(\"\\\\.\"))) {
const result = z.array(z.any()).safeParse(value[key])
if (!result.success) {
ctx.addIssue({
          path: [...(ctx.path ?? []), key],
          code: 'custom',
          message: \`Invalid input: Key matching regex /\${key}/ must match schema\`,
          params: {
            issues: result.error.issues
          }
        })
}
}
if (key.match(new RegExp(\"\\\\,\"))) {
const result = z.array(z.any()).min(1).safeParse(value[key])
if (!result.success) {
ctx.addIssue({
          path: [...(ctx.path ?? []), key],
          code: 'custom',
          message: \`Invalid input: Key matching regex /\${key}/ must match schema\`,
          params: {
            issues: result.error.issues
          }
        })
}
}
}
})`;

    const result = parseObject(schema, { path: [], seen: new Map() });
    const expression = toExpression(result);

    assert(run(expression, { ".": [] }).success, true);

    assert(run(expression, { ",": [] }).success, false);

    assert(expression.includes("superRefine"));
  });

  test("Funcional tests - patternProperties and properties", (assert) => {
    const schema: JSONSchema7 & { type: "object" } = {
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

    const _expected = `z.object({ "a": z.string(), "b": z.number().optional() }).catchall(z.union([z.array(z.any()), z.array(z.any()).min(1)])).superRefine((value, ctx) => {
for (const key in value) {
if (key.match(new RegExp(\"\\\\.\"))) {
const result = z.array(z.any()).safeParse(value[key])
if (!result.success) {
ctx.addIssue({
          path: [...(ctx.path ?? []), key],
          code: 'custom',
          message: \`Invalid input: Key matching regex /\${key}/ must match schema\`,
          params: {
            issues: result.error.issues
          }
        })
}
}
if (key.match(new RegExp(\"\\\\,\"))) {
const result = z.array(z.any()).min(1).safeParse(value[key])
if (!result.success) {
ctx.addIssue({
          path: [...(ctx.path ?? []), key],
          code: 'custom',
          message: \`Invalid input: Key matching regex /\${key}/ must match schema\`,
          params: {
            issues: result.error.issues
          }
        })
}
}
}
})`;

    const result = parseObject(schema, { path: [], seen: new Map() });
    assert(result, _expected);
  });

  test("dependentRequired", (assert) => {
    const schema: JSONSchema7 & { type: "object" } = {
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

    const result = parseObject(schema, { path: [], seen: new Map() });
    const expression = toExpression(result);

    assert(expression.includes("Dependent required properties missing"), true);
  });

  test("dependentRequired with custom message", (assert) => {
    const schema: JSONSchema7 & { type: "object" } = {
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

    const result = parseObject(schema, { path: [], seen: new Map() });
    const expression = toExpression(result);

    assert(expression.includes("deps missing"), true);
  });
});
