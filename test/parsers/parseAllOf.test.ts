import { parseAllOf } from "../../src/parsers/parseAllOf.js";
import { suite } from "../suite.js";

suite("parseAllOf", (test) => {
  test("should create never if empty", (assert) => {
    assert(
      parseAllOf(
        {
          allOf: [],
        },
        { path: [], seen: new Map() },
      ),
      "z.never()",
    );
  });

  test("should handle true values", (assert) => {
    assert(
      parseAllOf(
        {
          allOf: [{ type: "string" }, true],
        },
        { path: [], seen: new Map() },
      ),
      "z.intersection(z.string(), z.any())",
    );
  });

  test("should handle false values", (assert) => {
    assert(
      parseAllOf(
        {
          allOf: [{ type: "string" }, false],
        },
        { path: [], seen: new Map() },
      ),
      `z.intersection(z.string(), z.any().refine((value) => !z.any().safeParse(value).success, "Invalid input: Should NOT be valid against schema"))`,
    );
  });
});
