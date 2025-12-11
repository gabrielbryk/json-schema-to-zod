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

    expect(output).toContain('export const RootNested = z.object({ "b": z.number()');
    expect(output).toContain('export const Root = z.object({ "a": z.string().optional(), "nested": RootNested.optional()');
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
