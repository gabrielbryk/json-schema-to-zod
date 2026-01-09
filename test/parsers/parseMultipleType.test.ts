import { parseSchema } from "../../src/parsers/parseSchema.js";

import { suite } from "../suite.js";

suite("parseMultipleType", (test) => {
  test("dedupes duplicate types", (assert) => {
    const schema = {
      type: ["string", "string"],
    };
    assert(parseSchema(schema, { path: [], seen: new Map() }), "z.string()");
  });

  test("should handle object with multitype properties with default", (assert) => {
    const schema = {
      type: "object",
      properties: {
        prop: {
          type: ["string", "null"],
          default: null,
        },
      },
    };
    assert(
      parseSchema(schema, { path: [], seen: new Map() }),
      `z.looseObject({ "prop": z.string().nullable().default(null) })`
    );
  });
});
