import { parseAnyOf } from "../../src/parsers/parseAnyOf.js";
import { suite } from "../suite.js";

suite("parseAnyOf", (test) => {
  test("should create a union from two or more schemas", (assert) => {
    assert(
      parseAnyOf(
        {
          anyOf: [
            {
              type: "string",
            },
            { type: "number" },
          ],
        },
        { path: [], seen: new Map() }
      ),
      "z.union([z.string(), z.number()])"
    );
  });

  test("should extract a single schema", (assert) => {
    assert(
      parseAnyOf({ anyOf: [{ type: "string" }] }, { path: [], seen: new Map() }),
      "z.string()"
    );
  });

  test("should return z.any() if array is empty", (assert) => {
    assert(parseAnyOf({ anyOf: [] }, { path: [], seen: new Map() }), "z.any()");
  });

  test("should flatten nested unions and remove duplicates", (assert) => {
    assert(
      parseAnyOf(
        {
          anyOf: [
            {
              anyOf: [{ type: "string" }, { type: "string" }],
            },
            { type: "string" },
          ],
        },
        { path: [], seen: new Map() }
      ),
      "z.string()"
    );
  });

  test("should fold null unions into nullable", (assert) => {
    assert(
      parseAnyOf(
        {
          anyOf: [{ type: "string" }, { type: "null" }],
        },
        { path: [], seen: new Map() }
      ),
      "z.string().nullable()"
    );
  });
});
