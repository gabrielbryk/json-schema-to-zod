import { EsmEmitter } from "../src/utils/esmEmitter.js";
import { suite } from "./suite";

suite("esmEmitter", (test) => {
  test("renders imports, consts, and default export", (assert) => {
    const emitter = new EsmEmitter();
    emitter.addNamedImport("z", "zod");
    emitter.addConst({ name: "Foo", expression: "z.string()", exported: true });
    emitter.addDefaultExport({ expression: "Foo" });

    assert(emitter.render(), `import { z } from "zod"

export const Foo = z.string()

export default Foo
`);
  });

  test("dedupes imports and preserves jsdoc", (assert) => {
    const emitter = new EsmEmitter();
    emitter.addNamedImport("z", "zod");
    emitter.addNamedImport("z", "zod");
    emitter.addConst({ name: "Foo", expression: "z.string()", jsdoc: "/**Doc*/" });
    emitter.addTypeExport({ name: "FooType", type: "string" });

    assert(emitter.render(), `import { z } from "zod";
/*Doc*/
const Foo = z.string();
export type FooType = string;
`);
  });
});
