import { z } from "zod";
import { assertType, IsEqual } from "./type-assertions.js";
import { Task, Workflow } from "./schema.js";
import type { TaskType, WorkflowType } from "./schema.js";

assertType<IsEqual<TaskType, z.infer<typeof Task>>>();
assertType<IsEqual<WorkflowType, z.infer<typeof Workflow>>>();

const example: TaskType = { id: "t1" };
void example;
