import { z } from "zod";
import { assertType, IsEqual } from "./type-assertions.js";
import { ContainerSchema } from "./schema.js";

type Container = z.infer<typeof ContainerSchema>;
assertType<IsEqual<Container["status"], "open" | "closed">>();
assertType<IsEqual<Container["kind"], "fixed">>();
assertType<IsEqual<Container["pair"][0], string>>();
assertType<IsEqual<Container["pair"][1], number>>();
assertType<IsEqual<Container["value"], string | number>>();

const example: Container = { status: "open", kind: "fixed", pair: ["a", 1], value: 1 };
void example;
