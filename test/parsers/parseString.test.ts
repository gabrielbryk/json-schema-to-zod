import { createRequire } from "module";
import { parseString } from "../../src/parsers/parseString.js";
import { suite } from "../suite.js";
import { expect } from "@jest/globals";

suite("parseString", (test) => {
  const run = (output: string | { expression: string }, data: unknown) => {
    const { z } = createRequire(import.meta.url)("zod");
    const expression = typeof output === "string" ? output : output.expression;
    const schema = new Function("z", `return ${expression};`)(z);
    return schema.safeParse(data);
  };

  test("DateTime format", (assert) => {
    const datetime = "2018-11-13T20:20:39Z";

    const code = parseString({
      type: "string",
      format: "date-time",
      errorMessage: { format: "hello" },
    });

    assert(code, 'z.iso.datetime({ offset: true, message: "hello" })');

    assert(run(code, datetime), { success: true, data: datetime });
  });

  test("email", (assert) => {
    assert(
      parseString({
        type: "string",
        format: "email",
      }),
      "z.email()"
    );
  });

  test("ip", (assert) => {
    assert(
      parseString({
        type: "string",
        format: "ip",
      }),
      `z.string().refine((val) => {
          const v4 = z.ipv4().safeParse(val).success;
          const v6 = z.ipv6().safeParse(val).success;
          return v4 || v6;
        })`
    );
    assert(
      parseString({
        type: "string",
        format: "ipv6",
      }),
      `z.ipv6()`
    );
  });

  test("uri", (assert) => {
    assert(
      parseString({
        type: "string",
        format: "uri",
      }),
      `z.url()`
    );
  });

  test("uuid", (assert) => {
    assert(
      parseString({
        type: "string",
        format: "uuid",
      }),
      `z.uuid()`
    );
  });

  test("time", (assert) => {
    assert(
      parseString({
        type: "string",
        format: "time",
      }),
      `z.iso.time()`
    );
  });

  test("date", (assert) => {
    assert(
      parseString({
        type: "string",
        format: "date",
      }),
      `z.iso.date()`
    );
  });

  test("duration", (assert) => {
    assert(
      parseString({
        type: "string",
        format: "duration",
      }),
      `z.iso.duration()`
    );
  });

  test("base64", (assert) => {
    assert(
      parseString({
        type: "string",
        contentEncoding: "base64",
      }),
      "z.base64()"
    );
    assert(
      parseString({
        type: "string",
        contentEncoding: "base64",
        errorMessage: {
          contentEncoding: "x",
        },
      }),
      'z.base64({ message: "x" })'
    );
    assert(
      parseString({
        type: "string",
        format: "binary",
      }),
      "z.base64()"
    );
    assert(
      parseString({
        type: "string",
        format: "binary",
        errorMessage: {
          format: "x",
        },
      }),
      'z.base64({ message: "x" })'
    );
  });

  test("stringified JSON", (assert) => {
    assert(
      parseString({
        type: "string",
        contentMediaType: "application/json",
        contentSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
            },
            age: {
              type: "integer",
            },
          },
          required: ["name", "age"],
        },
      }),
      'z.string().transform((str,ctx) => {try {return JSON.parse(str)} catch (err) {ctx.addIssue({code:"custom",message:"Invalid JSON"})}}).pipe(z.looseObject({"name":z.string(),"age":z.int()}))'
    );
    assert(
      parseString({
        type: "string",
        contentMediaType: "application/json",
        contentSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
            },
            age: {
              type: "integer",
            },
          },
          required: ["name", "age"],
        },
        errorMessage: {
          contentMediaType: "x",
          contentSchema: "y",
        },
      }),
      'z.string().transform((str, ctx) => { try { return JSON.parse(str); } catch (err) { ctx.addIssue({ code: "custom", message: "Invalid JSON" }); }}, { message: "x" }).pipe(z.looseObject({ "name": z.string(), "age": z.int() }), { message: "y" })'
    );
  });

  test("should accept errorMessage", () => {
    expect(
      parseString(
        {
          type: "string",
          format: "ipv4",
          pattern: "x",
          minLength: 1,
          maxLength: 2,
          errorMessage: {
            format: "ayy",
            pattern: "lmao",
            minLength: "deez",
            maxLength: "nuts",
          },
        },
        { path: [], seen: new Map() }
      ).expression
    ).toBe(
      'z.ipv4({ message: "ayy" }).regex(new RegExp("x"), { message: "lmao" }).min(1, { message: "deez" }).max(2, { message: "nuts" })'
    );
  });

  test("should map extra string formats to Zod v4 helpers", (assert) => {
    assert(
      parseString({ type: "string", format: "jwt", errorMessage: { format: "x" } }),
      'z.jwt({ message: "x" })'
    );

    assert(parseString({ type: "string", format: "cuid" }), "z.cuid()");

    assert(parseString({ type: "string", format: "cuid2" }), "z.cuid2()");

    assert(parseString({ type: "string", format: "nanoid" }), "z.nanoid()");

    assert(parseString({ type: "string", format: "ulid" }), "z.ulid()");

    assert(
      parseString({ type: "string", format: "e164", errorMessage: { format: "y" } }),
      'z.e164({ message: "y" })'
    );

    assert(parseString({ type: "string", format: "base64url" }), "z.base64url()");

    assert(parseString({ type: "string", format: "emoji" }), "z.emoji()");
  });

  test("should map additional standard formats", () => {
    expect(
      parseString(
        {
          type: "string",
          format: "hostname",
          errorMessage: { format: "lmao" },
        },
        { path: [], seen: new Map() }
      ).expression
    ).toBe(
      `z.string().refine((val) => {
          if (typeof val !== "string" || val.length === 0 || val.length > 253) return false;
          return val.split(".").every((label) => {
            return label.length > 0 && label.length <= 63 && /^[A-Za-z0-9-]+$/.test(label) && label[0] !== "-" && label[label.length - 1] !== "-";
          });
        }, { message: "lmao" })`
    );
    expect(
      parseString(
        { type: "string", format: "json-pointer", errorMessage: { format: "x" } },
        { path: [], seen: new Map() }
      ).expression
    ).toBe(
      'z.string().refine((val) => typeof val === "string" && /^(?:\\/(?:[^/~]|~[01])*)*$/.test(val), { message: "x" })'
    );

    const assert = (output: any, expected: string) => expect(output.expression).toBe(expected);

    assert(
      parseString({ type: "string", format: "regex" }),
      `z.string().refine((val) => {
          try {
            new RegExp(val);
            return true;
          } catch {
            return false;
          }
        })`
    );
  });

  test("should warn on unknown format when hook provided", (assert) => {
    const seen: { format: string; path: (string | number)[] }[] = [];
    parseString(
      { type: "string", format: "made-up" },
      {
        path: ["root"],
        seen: new Map(),
        onUnknownFormat: (format, path) => seen.push({ format, path }),
      }
    );
    assert(seen, [{ format: "made-up", path: ["root"] }]);
  });
});
