
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import { generateSchemaBundle } from "../src/index.ts";

const schema = yaml.load(readFileSync("test/fixtures/workflow.yaml", "utf8")) as any;

const toPascalCase = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

const result = generateSchemaBundle(schema, {
    name: "workflowSchema",
    splitDefs: {
        fileName: (defName) => `${toPascalCase(defName)}.schema.ts`,
    }
});

// Ensure directory exists
const outputDir = "test/output/workflow/schemas";
mkdirSync(outputDir, { recursive: true });

result.files.forEach(file => {
    writeFileSync(join(outputDir, file.fileName), file.contents);
});

console.log(`Generated ${result.files.length} files in ${outputDir}`);
