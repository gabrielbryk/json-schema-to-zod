import { z } from "zod";
import { assertType, IsEqual } from "./type-assertions.js";
import { AllOfSchema } from "./schema.js";

type AllOf = z.infer<typeof AllOfSchema>;
assertType<IsEqual<AllOf["id"], string>>();
assertType<IsEqual<AllOf["count"], number>>();

const example: AllOf = { id: "a", count: 1 };
void example;
