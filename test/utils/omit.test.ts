import { omit } from "../../src/utils/omit.js";
import { suite } from "../suite.js";

suite("omit", (test) => {
  test("omit", (assert) => {
    const input = {
      a: true,
      b: true,
    };

    omit(
      input,
      "b",
      // @ts-expect-error testing invalid key
      "c"
    );

    const output = omit(input, "b");

    assert(output.a, true);

    // @ts-expect-error property should be omitted
    assert(output.b, undefined);
  });
});
