import { z } from "zod";
import { assertType, IsEqual } from "./type-assertions.js";
import { UserSchema } from "./schema.js";

type User = z.infer<typeof UserSchema>;
assertType<IsEqual<User["id"], string>>();
assertType<IsEqual<User["count"], number | undefined>>();
assertType<IsEqual<User["tag"], string | null | undefined>>();
assertType<IsEqual<User["flags"], boolean[] | undefined>>();

const example: User = { id: "abc", count: 1, tag: null, flags: [true] };
void example;
