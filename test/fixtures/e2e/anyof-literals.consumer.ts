import { z } from "zod";
import { assertType, IsEqual } from "./type-assertions.js";
import { AnyOfSchema } from "./schema.js";

type AnyOf = z.infer<typeof AnyOfSchema>;
assertType<IsEqual<AnyOf, "alpha" | "beta">>();

const example: AnyOf = "alpha";
void example;
