import jsonSchemaToZod from "../src/index.js";
import { suite } from "./suite.js";

suite("allOf required properties", (test) => {
  test("uses allOf property schema for required keys", (assert) => {
    const schema = {
      type: "object",
      required: ["listen"],
      allOf: [
        {
          properties: {
            listen: { type: "string" },
          },
        },
      ],
    };

    const output = jsonSchemaToZod(schema, { name: "TestSchema" });

    assert(output.includes('"listen": z.string()'));
    assert(!output.includes('"listen": z.any()'));
  });

  test("treats boolean false property schemas as disallowed", (assert) => {
    const schema = {
      type: "object",
      properties: {
        until: false,
      },
    };

    const output = jsonSchemaToZod(schema, { name: "TestSchema" });

    assert(output.includes('"until": z.never().exactOptional()'));
    assert(!output.includes('"until": z.any()'));
  });

  test("skips redundant intersections for property-only allOf members", (assert) => {
    const schema = {
      type: "object",
      allOf: [
        {
          properties: {
            foo: { type: "string" },
          },
        },
      ],
    };

    const output = jsonSchemaToZod(schema, { name: "TestSchema" });

    assert(output.includes('"foo": z.string().exactOptional()'));
    assert(!output.includes("z.intersection"));
  });
});
