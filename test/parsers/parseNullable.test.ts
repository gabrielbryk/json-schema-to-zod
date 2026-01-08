import { parseSchema } from "../../src/index.js";

import { suite } from "../suite.js";

suite("parseNullable", (test) => {
  test("parseSchema should not add default twice", (assert) => {
    assert(
      parseSchema(
        {
          type: "string",
          nullable: true,
          default: null,
        },
        { path: [], seen: new Map() }
      ),
      "z.string().nullable().default(null)"
    );
  });
});
