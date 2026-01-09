import { z } from "zod";
import { assertType, IsEqual } from "./type-assertions.js";
import { WorkflowSchema } from "./workflow.schema.js";
import { RuntimeExpressionSchema } from "./runtimeExpression.schema.js";

type Workflow = z.infer<typeof WorkflowSchema>;
type RuntimeExpression = z.infer<typeof RuntimeExpressionSchema>;
assertType<IsEqual<RuntimeExpression, string>>();

const workflow: Workflow | null = null;
void workflow;
