import { z } from "zod";
import { assertType, IsEqual } from "./type-assertions.js";
import {
  workflowSchema,
  TaskListSchema,
  ForkTaskSchema,
  TryTaskSchema,
  ListenTaskSchema,
  SubscriptionIteratorSchema,
  RuntimeExpressionSchema,
  WorkflowTagsSchema,
  WorkflowMetadataSchema,
  TimeoutSchema,
  DurationSchema,
  InputSchema,
  OutputSchema,
  ExportSchema,
  EventConsumptionStrategySchema,
} from "./schema.js";

type Workflow = z.infer<typeof workflowSchema>;
type TaskList = z.infer<typeof TaskListSchema>;
type ForkTask = z.infer<typeof ForkTaskSchema>;
type TryTask = z.infer<typeof TryTaskSchema>;
type ListenTask = z.infer<typeof ListenTaskSchema>;
type SubscriptionIterator = z.infer<typeof SubscriptionIteratorSchema>;
type RuntimeExpression = z.infer<typeof RuntimeExpressionSchema>;
type Timeout = z.infer<typeof TimeoutSchema>;
type Duration = z.infer<typeof DurationSchema>;
type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;
type Export = z.infer<typeof ExportSchema>;
type EventConsumptionStrategy = z.infer<typeof EventConsumptionStrategySchema>;

assertType<IsEqual<RuntimeExpression, string>>();
assertType<IsEqual<Workflow["do"], TaskList>>();
assertType<IsEqual<Timeout["after"], Duration>>();
assertType<IsEqual<Input["from"], string | Record<string, unknown> | undefined>>();
assertType<IsEqual<Output["as"], string | Record<string, unknown> | undefined>>();
assertType<IsEqual<Export["as"], string | Record<string, unknown> | undefined>>();

const duration: Duration = "PT1S";
const timeout: Timeout = { after: duration };
const input: Input = { from: "${input}" };
const output: Output = { as: "result" };
const exportData: Export = { as: { value: "result" } };

const tags: z.infer<typeof WorkflowTagsSchema> = { env: "dev" };
const metadata: z.infer<typeof WorkflowMetadataSchema> = { owner: "team" };

const eventStrategy: EventConsumptionStrategy = { all: [] };

const iterator: SubscriptionIterator = { item: "item", at: "index", do: [] };

const forkTask: ForkTask = { fork: { branches: [], compete: false } };
const tryTask: TryTask = { try: [], catch: {} };
const listenTask: ListenTask = { listen: { to: eventStrategy, read: "data" }, foreach: iterator };

forkTask.fork.branches[0];
forkTask.fork.compete;

tryTask["try"][0];
tryTask.catch.errors?.with;
tryTask.catch.retry;
tryTask.catch.do?.[0];

listenTask.foreach?.item;
listenTask.foreach?.at;
listenTask.foreach?.do?.[0];

const taskList: TaskList = [{ step1: forkTask }, { step2: tryTask }, { step3: listenTask }];

const workflow: Workflow = {
  document: {
    dsl: "1.0.0",
    namespace: "acme",
    name: "demo",
    version: "1.0.0",
    tags,
    metadata,
  },
  do: taskList,
  input,
  output,
  export: exportData,
  timeout,
  schedule: {
    every: duration,
    on: eventStrategy,
  },
  use: {
    secrets: ["secret1"],
    timeouts: { default: timeout },
  },
};

workflow.document.dsl;
workflow.document.name;
workflow.do[0];
workflow.input?.schema;
workflow.output?.as;
workflow.use?.secrets?.[0];
workflow.use?.timeouts?.default?.after;
workflow.schedule?.on;

const listen = listenTask.listen;
listen.to;
listen.read;

iterator.do?.[0];
iterator.output;
iterator.export;
iterator.item;
iterator.at;
