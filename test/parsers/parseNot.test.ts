import { parseNot } from "../../src/parsers/parseNot.js";
import { suite } from "../suite.js";

suite("parseNot", (test) => {
  test("", (assert) => {
    assert(
      parseNot(
        {
          not: {
            type: "string",
          },
        },
        { path: [], seen: new Map() },
      ),
      'z.any().refine((value) => !z.string().safeParse(value).success, "Invalid input: Should NOT be valid against schema")',
    );
  });
});
