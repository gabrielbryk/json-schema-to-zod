import { readFileSync } from "fs";
import yaml from "js-yaml";
import jsonSchemaToZod, { generateSchemaBundle } from "../src/index.js";
import { suite } from "./suite.js";
import { typecheckEsm, typecheckEsmBundle } from "./utils/typecheckEsm.js";

const fixtureDir = "test/fixtures/e2e";
const readFixture = (name: string): string => readFileSync(`${fixtureDir}/${name}`, "utf8");
const readJsonFixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFixture(`${name}.json`)) as Record<string, unknown>;
const readConsumer = (name: string): string => readFixture(`${name}.consumer.ts`);
const assertionsFile = readFixture("type-assertions.ts");
const assertionFiles = [{ fileName: "type-assertions.ts", contents: assertionsFile }];

const assertTypecheckOk = (status: number | null, diagnostics: string) => {
  if (status !== 0) {
    throw new Error(diagnostics || "Typecheck failed");
  }
};

suite("e2e typecheck", (test) => {
  test("single-file object shapes and optionals", (assert) => {
    const schema = readJsonFixture("object-optionals");
    const output = jsonSchemaToZod(schema, { name: "UserSchema" });
    const consumerCode = readConsumer("object-optionals");

    const { status, diagnostics } = typecheckEsm({
      schemaCode: output,
      consumerCode,
      extraFiles: assertionFiles,
    });
    assertTypecheckOk(status, diagnostics);
    assert(true);
  });

  test("single-file enums, consts, tuples, and unions", (assert) => {
    const schema = readJsonFixture("enums-consts-tuples-unions");
    const output = jsonSchemaToZod(schema, { name: "ContainerSchema" });
    const consumerCode = readConsumer("enums-consts-tuples-unions");

    const { status, diagnostics } = typecheckEsm({
      schemaCode: output,
      consumerCode,
      extraFiles: assertionFiles,
    });
    assertTypecheckOk(status, diagnostics);
    assert(true);
  });

  test("single-file refs preserve inferred types", (assert) => {
    const schema = readJsonFixture("refs");
    const output = jsonSchemaToZod(schema, { name: "UserSchema", exportRefs: true });
    const consumerCode = readConsumer("refs");

    const { status, diagnostics } = typecheckEsm({
      schemaCode: output,
      consumerCode,
      extraFiles: assertionFiles,
    });
    assertTypecheckOk(status, diagnostics);
    assert(true);
  });

  test("single-file catchall records infer value types", (assert) => {
    const schema = readJsonFixture("catchall-records");
    const output = jsonSchemaToZod(schema, { name: "MetricsSchema" });
    const consumerCode = readConsumer("catchall-records");

    const { status, diagnostics } = typecheckEsm({
      schemaCode: output,
      consumerCode,
    });
    assertTypecheckOk(status, diagnostics);
    assert(true);
  });

  test("single-file allOf intersections merge object shapes", (assert) => {
    const schema = readJsonFixture("allof-intersections");
    const output = jsonSchemaToZod(schema, { name: "AllOfSchema" });
    const consumerCode = readConsumer("allof-intersections");

    const { status, diagnostics } = typecheckEsm({
      schemaCode: output,
      consumerCode,
      extraFiles: assertionFiles,
    });
    assertTypecheckOk(status, diagnostics);
    assert(true);
  });

  test("single-file anyOf produces unions for literals", (assert) => {
    const schema = readJsonFixture("anyof-literals");
    const output = jsonSchemaToZod(schema, { name: "AnyOfSchema" });
    const consumerCode = readConsumer("anyof-literals");

    const { status, diagnostics } = typecheckEsm({
      schemaCode: output,
      consumerCode,
      extraFiles: assertionFiles,
    });
    assertTypecheckOk(status, diagnostics);
    assert(true);
  });

  test("single-file typeExports with naming customization", (assert) => {
    const schema = readJsonFixture("typeexports-naming");
    const output = jsonSchemaToZod(schema, {
      name: "Workflow",
      exportRefs: true,
      typeExports: true,
      naming: {
        schemaName: (name) => name,
        typeName: (name) => `${name}Type`,
      },
    });

    const consumerCode = readConsumer("typeexports-naming");

    const { status, diagnostics } = typecheckEsm({
      schemaCode: output,
      consumerCode,
      extraFiles: assertionFiles,
    });
    assertTypecheckOk(status, diagnostics);
    assert(true);
  });

  test("bundle workflow schema imports typecheck cleanly", (assert) => {
    const schema = yaml.load(readFileSync("test/fixtures/workflow.yaml", "utf8")) as Record<
      string,
      unknown
    >;

    const bundle = generateSchemaBundle(schema, {
      name: "WorkflowSchema",
      type: "Workflow",
    });

    const consumerCode = readConsumer("workflow-bundle");
    const { status, diagnostics } = typecheckEsmBundle({
      files: bundle.files,
      consumerCode,
      extraFiles: assertionFiles,
    });

    assertTypecheckOk(status, diagnostics);
    assert(true);
  });
});
