import { JsonSchemaObject, Refs } from "../Types.js";
import { withMessage } from "../utils/withMessage.js";
import { parseSchema } from "./parseSchema.js";

export const parseString = (
  schema: JsonSchemaObject & { type: "string" },
  refs?: Refs,
) => {
  const formatError = schema.errorMessage?.format;
  const refContext: Refs = refs ?? ({ path: [] } as Refs);

  const topLevelFormatMap: Record<string, string> = {
    email: "z.email",
    ipv4: "z.ipv4",
    ipv6: "z.ipv6",
    uri: "z.url",
    uuid: "z.uuid",
    cuid: "z.cuid",
    cuid2: "z.cuid2",
    nanoid: "z.nanoid",
    ulid: "z.ulid",
    jwt: "z.jwt",
    e164: "z.e164",
    base64url: "z.base64url",
    base64: "z.base64",
    emoji: "z.emoji",
    "idn-email": "z.email",
  };

  const formatFn = schema.format && topLevelFormatMap[schema.format];
  const formatParam =
    formatError !== undefined ? `{ error: ${JSON.stringify(formatError)} }` : "";

  let r = formatFn ? `${formatFn}(${formatParam})` : "z.string()";

  const formatHandled = Boolean(formatFn);
  let formatWasHandled = formatHandled;

  if (!formatHandled) {
    r += withMessage(schema, "format", ({ value }) => {
      switch (value) {
        case "email":
          formatWasHandled = true;
          return {
            opener: ".email(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "ip":
          formatWasHandled = true;
          return {
            opener: ".ip(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "ipv4":
          formatWasHandled = true;
          return {
            opener: '.ip({ version: "v4"',
            closer: " })",
            messagePrefix: ", error: ",
            messageCloser: " })",
          };
        case "ipv6":
          formatWasHandled = true;
          return {
            opener: '.ip({ version: "v6"',
            closer: " })",
            messagePrefix: ", error: ",
            messageCloser: " })",
          };
        case "uri":
          formatWasHandled = true;
          return {
            opener: ".url(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "uuid":
          formatWasHandled = true;
          return {
            opener: ".uuid(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "cuid":
          formatWasHandled = true;
          return {
            opener: ".cuid(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "cuid2":
          formatWasHandled = true;
          return {
            opener: ".cuid2(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "nanoid":
          formatWasHandled = true;
          return {
            opener: ".nanoid(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "ulid":
          formatWasHandled = true;
          return {
            opener: ".ulid(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "jwt":
          formatWasHandled = true;
          return {
            opener: ".jwt(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "e164":
          formatWasHandled = true;
          return {
            opener: ".e164(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "base64url":
          formatWasHandled = true;
          return {
            opener: ".base64url(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "emoji":
          formatWasHandled = true;
          return {
            opener: ".emoji(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "date-time":
          formatWasHandled = true;
          return {
            opener: ".datetime({ offset: true",
            closer: " })",
            messagePrefix: ", error: ",
            messageCloser: " })",
          };
        case "time":
          formatWasHandled = true;
          return {
            opener: ".time(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "date":
          formatWasHandled = true;
          return {
            opener: ".date(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "binary":
          formatWasHandled = true;
          return {
            opener: ".base64(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "duration":
          formatWasHandled = true;
          return {
            opener: ".duration(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "hostname":
        case "idn-hostname":
          formatWasHandled = true;
          return {
            opener:
              ".refine((val) => { if (typeof val !== \"string\" || val.length === 0 || val.length > 253) return false; return val.split(\".\").every((label) => label.length > 0 && label.length <= 63 && /^[A-Za-z0-9-]+$/.test(label) && label[0] !== \"-\" && label[label.length - 1] !== \"-\"); }",
            closer: ")",
            messagePrefix: ", { error: ",
            messageCloser: " })",
          };
        case "idn-email":
          formatWasHandled = true;
          return {
            opener: ".email(",
            closer: ")",
            messagePrefix: "{ error: ",
            messageCloser: " })",
          };
        case "uri-reference":
        case "iri":
        case "iri-reference":
          formatWasHandled = true;
          return {
            opener:
              '.refine((val) => { try { new URL(val, "http://example.com"); return true; } catch { return false; } }',
            closer: ")",
            messagePrefix: ", { error: ",
            messageCloser: " })",
          };
        case "json-pointer":
          formatWasHandled = true;
          return {
            opener:
              ".refine((val) => typeof val === \"string\" && /^(?:\\/(?:[^/~]|~[01])*)*$/.test(val)",
            closer: ")",
            messagePrefix: ", { error: ",
            messageCloser: " })",
          };
        case "relative-json-pointer":
          formatWasHandled = true;
          return {
            opener:
              ".refine((val) => typeof val === \"string\" && /^(?:0|[1-9][0-9]*)(?:#|(?:\\/(?:[^/~]|~[01])*))*$/.test(val)",
            closer: ")",
            messagePrefix: ", { error: ",
            messageCloser: " })",
          };
        case "uri-template":
          formatWasHandled = true;
          return {
            opener:
              ".refine((val) => { if (typeof val !== \"string\") return false; const opens = (val.match(/\\{/g) || []).length; const closes = (val.match(/\\}/g) || []).length; return opens === closes; }",
            closer: ")",
            messagePrefix: ", { error: ",
            messageCloser: " })",
          };
        case "regex":
          formatWasHandled = true;
          return {
            opener:
              ".refine((val) => { try { new RegExp(val); return true; } catch { return false; } }",
            closer: ")",
            messagePrefix: ", { error: ",
            messageCloser: " })",
          };
      }
    });
  }

  if (schema.format && !formatWasHandled) {
    refContext.onUnknownFormat?.(schema.format, refContext.path);
  }

  r += withMessage(schema, "pattern", ({ json }) => ({
    opener: `.regex(new RegExp(${json})`,
    closer: ")",
    messagePrefix: ", { error: ",
    messageCloser: " })",
  }));

  r += withMessage(schema, "minLength", ({ json }) => ({
    opener: `.min(${json}`,
    closer: ")",
    messagePrefix: ", { error: ",
    messageCloser: " })",
  }));

  r += withMessage(schema, "maxLength", ({ json }) => ({
    opener: `.max(${json}`,
    closer: ")",
    messagePrefix: ", { error: ",
    messageCloser: " })",
  }));

  r += withMessage(schema, "contentEncoding", ({ value }) => {
    if (value === "base64") {
      return {
        opener: ".base64(",
        closer: ")",
        messagePrefix: "{ error: ",
        messageCloser: " })",
      };
    }
  });

  const contentMediaType = withMessage(schema, "contentMediaType", ({ value }) => {
    if (value === "application/json") {
      return {
        opener:
          '.transform((str, ctx) => { try { return JSON.parse(str); } catch (err) { ctx.addIssue({ code: "custom", message: "Invalid JSON" }); }}',
        closer: ")",
        messagePrefix: ", { error: ",
        messageCloser: " })",
      };
    }
  });

  if (contentMediaType != "") {
    r += contentMediaType;
    r += withMessage(schema, "contentSchema", ({ value }) => {
      if (value && value instanceof Object) {
        return {
          opener: `.pipe(${parseSchema(value)}`,
          closer: ")",
          messagePrefix: ", { error: ",
          messageCloser: " })",
        };
      }
    });
  }

  return r;
};
