import { jsonSchemaToZod } from "../src/jsonSchemaToZod.js";

describe("liftInlineObjects integration", () => {
  test("hoists inline object into defs when flag is enabled", () => {
    const schema = {
      type: "object",
      properties: {
        a: { type: "string" },
        nested: {
          type: "object",
          properties: { b: { type: "number" } },
        },
      },
    };

    const output = jsonSchemaToZod(schema, {
      name: "Root",
      liftInlineObjects: { enable: true },
    });

    expect(output).toContain('export const RootNestedSchema = z.looseObject({ "b": z.number().exactOptional() })');
    expect(output).toContain('export const Root = z.looseObject({ "a": z.string().exactOptional(), "nested": RootNestedSchema.exactOptional() })');
  });

  test("does not hoist when flag is disabled", () => {
    const schema = {
      type: "object",
      properties: {
        nested: {
          type: "object",
          properties: { b: { type: "number" } },
        },
      },
    };

    const output = jsonSchemaToZod(schema, {
      name: "Root",
      liftInlineObjects: { enable: false },
    });

    expect(output).not.toContain("RootNested");
  });
});
