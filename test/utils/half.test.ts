import { half } from "../../src/utils/half.js";
import { suite } from "../suite.js";

suite("half", (test) => {
  test("half", (assert) => {
    const [a, b] = half(["A", "B", "C", "D", "E"]);

    if (1 < 0) {
      // type should be string
      a[0].endsWith("");
    }

    assert(a, ["A", "B"]);
    assert(b, ["C", "D", "E"]);
  });
});
