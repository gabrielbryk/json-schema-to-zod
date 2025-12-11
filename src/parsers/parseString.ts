import { JsonSchema, JsonSchemaObject, Refs, SchemaRepresentation } from "../Types.js";
import { withMessage } from "../utils/withMessage.js";
import { parseSchema } from "./parseSchema.js";

export const parseString = (
  schema: JsonSchemaObject & { type: "string" },
  refs?: Refs,
): SchemaRepresentation => {
  const formatError = schema.errorMessage?.format;
  const refContext: Refs = ensureRefs(refs);

  // Map formats to top-level Zod functions and their return types
  const topLevelFormatMap: Record<string, { fn: string; zodType: string }> = {
    email: { fn: "z.email", zodType: "z.ZodEmail" },
    ipv4: { fn: "z.ipv4", zodType: "z.ZodIPv4" },
    ipv6: { fn: "z.ipv6", zodType: "z.ZodIPv6" },
    uri: { fn: "z.url", zodType: "z.ZodURL" },
    uuid: { fn: "z.uuid", zodType: "z.ZodUUID" },
    cuid: { fn: "z.cuid", zodType: "z.ZodCUID" },
    cuid2: { fn: "z.cuid2", zodType: "z.ZodCUID2" },
    nanoid: { fn: "z.nanoid", zodType: "z.ZodNanoID" },
    ulid: { fn: "z.ulid", zodType: "z.ZodULID" },
    jwt: { fn: "z.jwt", zodType: "z.ZodJWT" },
    e164: { fn: "z.e164", zodType: "z.ZodE164" },
    base64url: { fn: "z.base64url", zodType: "z.ZodBase64URL" },
    base64: { fn: "z.base64", zodType: "z.ZodBase64" },
    emoji: { fn: "z.emoji", zodType: "z.ZodEmoji" },
    "idn-email": { fn: "z.email", zodType: "z.ZodEmail" },
  };

  const formatInfo = schema.format ? topLevelFormatMap[schema.format] : undefined;
  const formatFn = formatInfo?.fn;
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
      if (value && typeof value === "object") {
        const parsedContent = parseSchema(value as JsonSchema, refContext);
        const contentExpr =
          typeof parsedContent === "string"
            ? parsedContent
            : (parsedContent as SchemaRepresentation).expression;
        return {
          opener: `.pipe(${contentExpr}`,
          closer: ")",
          messagePrefix: ", { error: ",
          messageCloser: " })",
        };
      }
    });
  }

  // Use the correct Zod type based on whether a format function was used
  const zodType = formatInfo?.zodType ?? "z.ZodString";

  return {
    expression: r,
    type: zodType,
  };
};

function ensureRefs(refs?: Refs): Refs {
  if (refs) return refs;

  return {
    path: [],
    seen: new Map(),
    declarations: new Map(),
    dependencies: new Map(),
    inProgress: new Set(),
    refNameByPointer: new Map(),
    usedNames: new Set(),
  };
}
