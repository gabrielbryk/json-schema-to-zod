import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { spawnSync } from "child_process";

type TypecheckResult = {
  status: number | null;
  diagnostics: string;
};

type TypecheckFile = { fileName: string; contents: string };

type TypecheckOptions = {
  schemaCode: string;
  consumerCode: string;
  tscArgs?: string[];
  extraFiles?: TypecheckFile[];
};

export const typecheckEsm = ({
  schemaCode,
  consumerCode,
  tscArgs,
  extraFiles,
}: TypecheckOptions): TypecheckResult => {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-typecheck-"));
  const schemaPath = join(dir, "schema.ts");
  const consumerPath = join(dir, "consumer.ts");

  writeFileSync(schemaPath, schemaCode);
  writeFileSync(consumerPath, consumerCode);
  for (const file of extraFiles ?? []) {
    const filePath = join(dir, file.fileName);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, file.contents);
  }

  const tscPath = join(process.cwd(), "node_modules/.bin/tsc");
  const { status, stdout, stderr } = spawnSync(
    tscPath,
    [
      "--noEmit",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "--skipLibCheck",
      ...(tscArgs ?? []),
      consumerPath,
      schemaPath,
    ],
    { encoding: "utf8" }
  );

  rmSync(dir, { recursive: true, force: true });

  return {
    status,
    diagnostics: `${stdout ?? ""}${stderr ?? ""}`,
  };
};

type BundleFile = { fileName: string; contents: string };

type TypecheckBundleOptions = {
  files: BundleFile[];
  consumerCode: string;
  consumerFileName?: string;
  tscArgs?: string[];
  extraFiles?: TypecheckFile[];
};

export const typecheckEsmBundle = ({
  files,
  consumerCode,
  consumerFileName = "consumer.ts",
  tscArgs,
  extraFiles,
}: TypecheckBundleOptions): TypecheckResult => {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-typecheck-bundle-"));
  const consumerPath = join(dir, consumerFileName);

  for (const file of files) {
    const filePath = join(dir, file.fileName);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, file.contents);
  }

  for (const file of extraFiles ?? []) {
    const filePath = join(dir, file.fileName);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, file.contents);
  }

  writeFileSync(consumerPath, consumerCode);

  const tscPath = join(process.cwd(), "node_modules/.bin/tsc");
  const { status, stdout, stderr } = spawnSync(
    tscPath,
    [
      "--noEmit",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "--skipLibCheck",
      ...(tscArgs ?? []),
      consumerPath,
    ],
    { encoding: "utf8" }
  );

  rmSync(dir, { recursive: true, force: true });

  return {
    status,
    diagnostics: `${stdout ?? ""}${stderr ?? ""}`,
  };
};
