import { reconstructJsonSchema } from "../src/zodToJsonSchema.js";
import { suite } from "./suite.js";

suite("reconstructJsonSchema", (test) => {
  test("reconstructs patternProperties from __jsonSchema meta", (assert) => {
    const input = {
      type: "object",
      additionalProperties: { type: "string" },
      __jsonSchema: {
        patternProperties: {
          "^x-": { type: "string" },
        },
      },
    };

    const result = reconstructJsonSchema(input);

    assert(JSON.stringify(result.patternProperties), JSON.stringify({ "^x-": { type: "string" } }));
    assert(result.__jsonSchema, undefined);
  });

  test("reconstructs if/then/else from allOf with conditional meta", (assert) => {
    const input = {
      allOf: [
        {
          type: "object",
          properties: {
            type: { type: "string", enum: ["a", "b"] },
          },
        },
        {
          anyOf: [{}, {}],
          __jsonSchema: {
            conditional: {
              if: { properties: { type: { const: "a" } } },
              then: { required: ["valueA"] },
              else: { required: ["valueB"] },
            },
          },
        },
      ],
    };

    const result = reconstructJsonSchema(input);

    assert(JSON.stringify(result.if), JSON.stringify({ properties: { type: { const: "a" } } }));
    assert(JSON.stringify(result.then), JSON.stringify({ required: ["valueA"] }));
    assert(JSON.stringify(result.else), JSON.stringify({ required: ["valueB"] }));
    assert(result.allOf, undefined);
    assert(result.type, "object");
  });

  test("recursively processes nested schemas", (assert) => {
    const input = {
      type: "object",
      properties: {
        nested: {
          type: "object",
          __jsonSchema: {
            patternProperties: {
              "^custom-": { type: "boolean" },
            },
          },
        },
      },
    };

    const result = reconstructJsonSchema(input);
    const nested = (result.properties as Record<string, unknown>).nested as Record<string, unknown>;

    assert(
      JSON.stringify(nested.patternProperties),
      JSON.stringify({ "^custom-": { type: "boolean" } })
    );
  });

  test("handles schema without __jsonSchema meta", (assert) => {
    const input = {
      type: "object",
      properties: {
        name: { type: "string" },
      },
    };

    const result = reconstructJsonSchema(input);

    assert(JSON.stringify(result), JSON.stringify(input));
  });
});
