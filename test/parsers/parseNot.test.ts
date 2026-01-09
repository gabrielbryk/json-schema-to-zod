import { parseNot } from "../../src/parsers/parseNot.js";
import { suite } from "../suite.js";

suite("parseNot", (test) => {
  test("defaults to any when no base constraints exist", (assert) => {
    assert(
      parseNot(
        {
          not: {
            type: "string",
          },
        },
        { path: [], seen: new Map() }
      ),
      'z.any().refine((value) => !z.string().safeParse(value).success, "Invalid input: Should NOT be valid against schema")'
    );
  });

  test("preserves base type when not is combined with constraints", (assert) => {
    assert(
      parseNot(
        {
          type: "string",
          not: {
            enum: ["a", "b"],
          },
        },
        { path: [], seen: new Map() }
      ),
      'z.string().refine((value) => !z.enum(["a","b"]).safeParse(value).success, "Invalid input: Should NOT be valid against schema")'
    );
  });
});
