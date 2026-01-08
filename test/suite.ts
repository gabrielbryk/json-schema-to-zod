type TestContext = (assert: (result: unknown, expected?: unknown) => void) => void;
type TestFunction = (name: string, context: TestContext) => void;
type SuiteContext = (test: TestFunction) => void;

const normalizeString = (s: string): string =>
  s
    .replace(/\s+/g, " ")
    .replace(/;+/g, "")
    .replace(/\{\s+/g, "{")
    .replace(/\s+\}/g, "}")
    .replace(/\s*:\s*/g, ":")
    .replace(/,\s+/g, ",")
    .trim();

export function suite(suiteName: string, suiteContext: SuiteContext): void {
  describe(suiteName, () => {
    suiteContext((testName, testContext) => {
      test(testName, () => {
        testContext((...args) => {
          if (args.length === 1) {
            expect(args[0]).toBeTruthy();
            return;
          }

          const [result, expected] = args;
          if (
            Array.isArray(result) &&
            Array.isArray(expected) &&
            result.every(
              (item) =>
                item &&
                typeof item === "object" &&
                "fileName" in item &&
                typeof (item as { fileName: unknown }).fileName === "string" &&
                "contents" in item &&
                typeof (item as { contents: unknown }).contents === "string"
            ) &&
            expected.every(
              (item) =>
                item &&
                typeof item === "object" &&
                "fileName" in item &&
                typeof (item as { fileName: unknown }).fileName === "string" &&
                "contents" in item &&
                typeof (item as { contents: unknown }).contents === "string"
            )
          ) {
            const normalizeFiles = (arr: { fileName: string; contents: string }[]) =>
              arr.map(({ fileName, contents }) => ({
                fileName,
                contents: normalizeString(contents),
              }));
            expect(normalizeFiles(result)).toStrictEqual(normalizeFiles(expected));
            return;
          }
          if (
            typeof expected === "string" &&
            result &&
            typeof result === "object" &&
            "expression" in (result as Record<string, unknown>) &&
            typeof (result as Record<string, unknown>).expression === "string"
          ) {
            expect(normalizeString((result as { expression: string }).expression)).toBe(
              normalizeString(expected)
            );
            return;
          }
          if (typeof result === "string" && typeof expected === "string") {
            expect(normalizeString(result)).toBe(normalizeString(expected));
            return;
          }

          expect(result).toStrictEqual(expected);
        });
      });
    });
  });
}
