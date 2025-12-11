import { liftInlineObjects } from "../../src/utils/liftInlineObjects.js";

describe("liftInlineObjects", () => {
  test("lifts inline property object into defs when enabled", () => {
    const schema = {
      type: "object",
      properties: {
        a: { type: "string" },
        nested: {
          type: "object",
          properties: { b: { type: "number" } },
        },
      },
    } as const;

    const result = liftInlineObjects(schema, { enable: true, parentName: "Root" });

    expect(result.addedDefNames.length).toBe(1);
    const defName = result.addedDefNames[0];
    expect(result.defs[defName]).toBeDefined();
    const nestedRef = (result.schema as { properties: Record<string, unknown> }).properties.nested as Record<string, unknown>;
    expect(nestedRef).toEqual({ $ref: `#/$defs/${defName}` });
  });

  test("does not lift when disabled", () => {
    const schema = {
      type: "object",
      properties: { nested: { type: "object", properties: { b: { type: "number" } } } },
    } as const;
    const result = liftInlineObjects(schema, { enable: false });
    expect(result.addedDefNames).toHaveLength(0);
    expect((result.schema as { properties: Record<string, unknown> }).properties.nested).toHaveProperty("properties");
  });

  test("skips lifting top-level allOf branches", () => {
    const schema = {
      allOf: [
        { type: "object", properties: { a: { type: "string" } } },
        { type: "object", properties: { b: { type: "string" } } },
      ],
    } as const;

    const result = liftInlineObjects(schema, { enable: true, parentName: "Root" });
    expect(result.addedDefNames.length).toBe(0);
  });

  test("hoists inside defs when allowed", () => {
    const schema = {
      $defs: {
        callTask: {
          type: "object",
          properties: {
            with: {
              type: "object",
              properties: { channel: { type: "string" } },
            },
          },
        },
      },
    } as const;

    const result = liftInlineObjects(schema, { enable: true, parentName: "CallTask", allowInDefs: true });
    expect(result.addedDefNames.length).toBeGreaterThan(0);
    const defNames = result.addedDefNames;
    expect(defNames.some((n) => n.includes("With"))).toBe(true);
  });

  test("hoists object even when it contains refs inside", () => {
    const schema = {
      $defs: {
        dependency: { type: "object", properties: { x: { type: "string" } } },
      },
      type: "object",
      properties: {
        nested: {
          type: "object",
          properties: {
            dep: { $ref: "#/$defs/dependency" },
          },
        },
      },
    } as const;

    const result = liftInlineObjects(schema, { enable: true, parentName: "Root", allowInDefs: true });
    expect(result.addedDefNames.length).toBeGreaterThan(0);
    const nestedRef = (result.schema as { properties: Record<string, unknown> }).properties.nested as { $ref?: unknown };
    expect(typeof nestedRef.$ref).toBe("string");
  });

  test("skips lifting objects that participate in ref cycles", () => {
    const schema = {
      type: "object",
      properties: {
        node: {
          type: "object",
          properties: {
            next: { $ref: "#/properties/node" },
          },
        },
      },
    } as const;

    const result = liftInlineObjects(schema, { enable: true, parentName: "Node" });

    expect(result.addedDefNames).toHaveLength(0);
    const nodeSchema = (result.schema as { properties: Record<string, { properties: Record<string, { $ref: string }> }> }).properties.node;
    expect(nodeSchema.properties.next.$ref).toBe("#/properties/node");
  });
});
