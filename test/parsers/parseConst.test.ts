import { parseConst } from "../../src/parsers/parseConst.js";
import { suite } from "../suite.js";

suite("parseConst", (test) => {
  test("should handle falsy constants", (assert) => {
    assert(
      parseConst({
        const: false,
      }),
      "z.literal(false)",
    );
  });
});
