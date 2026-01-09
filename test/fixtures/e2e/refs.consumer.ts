import { z } from "zod";
import { assertType, IsEqual } from "./type-assertions.js";
import { AddressSchema, UserSchema } from "./schema.js";

type User = z.infer<typeof UserSchema>;
type Address = z.infer<typeof AddressSchema>;
assertType<IsEqual<User["address"], Address>>();

const example: User = { name: "Ada", address: { line1: "Main" } };
void example;
