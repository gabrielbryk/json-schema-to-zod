import { generateNameFromPath } from "../../src/utils/namingService.js";

describe("namingService", () => {
  test("generates PascalCase names with parent and path", () => {
    const existing = new Set<string>();
    const name = generateNameFromPath({
      parentName: "CallTask",
      path: ["with", "asyncapi"],
      existingNames: existing,
    });
    expect(name).toBe("CallTaskAsyncapi");
  });

  test("adds suffix on collision", () => {
    const existing = new Set<string>(["CallTaskWithAsyncapi"]);
    const name = generateNameFromPath({
      parentName: "CallTask",
      path: ["with", "asyncapi"],
      existingNames: existing,
    });
    expect(name).toBe("CallTaskAsyncapi");
  });

  test("uses hook when provided", () => {
    const hook = () => "CustomName";
    const existing = new Set<string>();
    const name = generateNameFromPath({
      parentName: "Root",
      path: ["x"],
      existingNames: existing,
      nameForPath: hook,
    });
    expect(name).toBe("CustomName");
  });

  test("prefers schema title when unique", () => {
    const existing = new Set<string>();
    const name = generateNameFromPath({
      parentName: "CallTask",
      path: ["with", "asyncapi"],
      existingNames: existing,
      schemaTitle: "AsyncApiArguments",
    });
    expect(name).toBe("AsyncApiArguments");
  });

  test("uses shortest unique tail when title collides", () => {
    const existing = new Set<string>(["AsyncApiArguments", "CallTaskWithAsyncapi"]);
    const name = generateNameFromPath({
      parentName: "CallTask",
      path: ["with", "asyncapi", "details"],
      existingNames: existing,
    });
    // Should use parent + tail "Details" without the entire path if available
    expect(name).toBe("CallTaskDetails");
  });
});
