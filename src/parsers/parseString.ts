import { JsonSchema, JsonSchemaObject, Refs, SchemaRepresentation } from "../Types.js";
import { withMessage } from "../utils/withMessage.js";
import { parseSchema } from "./parseSchema.js";

export const parseString = (
  schema: JsonSchemaObject & { type: "string" },
  refs?: Refs
): SchemaRepresentation => {
  const formatError = schema.errorMessage?.format;
  const refContext: Refs = ensureRefs(refs);

  // Map formats to Zod string methods
  const topLevelFormatMap: Record<string, { fn: string; zodType: string }> = {
    email: { fn: "z.email", zodType: "z.ZodString" },
    ipv4: { fn: "z.ipv4", zodType: "z.ZodString" },
    ipv6: { fn: "z.ipv6", zodType: "z.ZodString" },
    uri: { fn: "z.url", zodType: "z.ZodString" },
    uuid: { fn: "z.uuid", zodType: "z.ZodString" },
    cuid: { fn: "z.cuid", zodType: "z.ZodString" },
    cuid2: { fn: "z.cuid2", zodType: "z.ZodString" },
    nanoid: { fn: "z.nanoid", zodType: "z.ZodString" },
    ulid: { fn: "z.ulid", zodType: "z.ZodString" },
    jwt: { fn: "z.jwt", zodType: "z.ZodString" },
    e164: { fn: "z.e164", zodType: "z.ZodString" },
    base64url: { fn: "z.base64url", zodType: "z.ZodString" },
    base64: { fn: "z.base64", zodType: "z.ZodString" },
    emoji: { fn: "z.emoji", zodType: "z.ZodString" },
    "idn-email": { fn: "z.email", zodType: "z.ZodString" },
    "date-time": { fn: "z.iso.datetime", zodType: "z.ZodString" },
    date: { fn: "z.iso.date", zodType: "z.ZodString" },
    time: { fn: "z.iso.time", zodType: "z.ZodString" },
    duration: { fn: "z.iso.duration", zodType: "z.ZodString" },
  };

  const formatInfo = schema.format ? topLevelFormatMap[schema.format] : undefined;
  const formatFn = formatInfo?.fn;

  let r = "z.string()";
  let zodType = "z.ZodString";

  if (formatFn) {
    const params = formatError !== undefined ? `{ message: ${JSON.stringify(formatError)} }` : "";

    if (schema.format === "date-time") {
      r = `z.iso.datetime({ offset: true${formatError ? `, message: ${JSON.stringify(formatError)}` : ""} })`;
    } else if (schema.format === "ipv4") {
      r = `z.ipv4(${formatError ? `{ message: ${JSON.stringify(formatError)} }` : ""})`;
    } else if (schema.format === "ipv6") {
      r = `z.ipv6(${formatError ? `{ message: ${JSON.stringify(formatError)} }` : ""})`;
    } else {
      r = `${formatFn}(${params})`;
    }
  }

  let formatWasHandled = Boolean(formatFn);

  if (!formatWasHandled && schema.format) {
    switch (schema.format) {
      case "ip":
        r += `.refine((val) => {
          const v4 = z.ipv4().safeParse(val).success;
          const v6 = z.ipv6().safeParse(val).success;
          return v4 || v6;
        }${formatError ? `, { message: ${JSON.stringify(formatError)} }` : ""})`;
        formatWasHandled = true;
        break;

      case "binary":
        r = `z.base64(${formatError ? `{ message: ${JSON.stringify(formatError)} }` : ""})`;
        formatWasHandled = true;
        break;

      case "hostname":
      case "idn-hostname":
        r += `.refine((val) => {
          if (typeof val !== "string" || val.length === 0 || val.length > 253) return false;
          return val.split(".").every((label) => {
            return label.length > 0 && label.length <= 63 && /^[A-Za-z0-9-]+$/.test(label) && label[0] !== "-" && label[label.length - 1] !== "-";
          });
        }${formatError ? `, { message: ${JSON.stringify(formatError)} }` : ""})`;
        formatWasHandled = true;
        break;

      case "uri-reference":
      case "iri":
      case "iri-reference":
        r += `.refine((val) => {
          try {
            new URL(val, "http://example.com");
            return true;
          } catch {
            return false;
          }
        }${formatError ? `, { message: ${JSON.stringify(formatError)} }` : ""})`;
        formatWasHandled = true;
        break;

      case "json-pointer":
        r += `.refine((val) => typeof val === "string" && /^(?:\\/(?:[^/~]|~[01])*)*$/.test(val)${formatError ? `, { message: ${JSON.stringify(formatError)} }` : ""})`;
        formatWasHandled = true;
        break;

      case "relative-json-pointer":
        r += `.refine((val) => typeof val === "string" && /^(?:0|[1-9][0-9]*)(?:#|(?:\\/(?:[^/~]|~[01])*))*$/.test(val)${formatError ? `, { message: ${JSON.stringify(formatError)} }` : ""})`;
        formatWasHandled = true;
        break;

      case "uri-template":
        r += `.refine((val) => {
          if (typeof val !== "string") return false;
          const opens = (val.match(/\\{/g) || []).length;
          const closes = (val.match(/\\}/g) || []).length;
          return opens === closes;
        }${formatError ? `, { message: ${JSON.stringify(formatError)} }` : ""})`;
        formatWasHandled = true;
        break;

      case "regex":
        r += `.refine((val) => {
          try {
            new RegExp(val);
            return true;
          } catch {
            return false;
          }
        }${formatError ? `, { message: ${JSON.stringify(formatError)} }` : ""})`;
        formatWasHandled = true;
        break;
    }
  }

  if (schema.format && !formatWasHandled) {
    refContext.onUnknownFormat?.(schema.format, refContext.path);
  }

  r += withMessage(schema, "pattern", ({ json }) => ({
    opener: `.regex(new RegExp(${json})`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));

  r += withMessage(schema, "minLength", ({ json }) => ({
    opener: `.min(${json}`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));

  r += withMessage(schema, "maxLength", ({ json }) => ({
    opener: `.max(${json}`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));

  if (schema.contentEncoding === "base64" && schema.format !== "base64") {
    const encodingError = schema.errorMessage?.contentEncoding;
    r = `z.base64(${encodingError ? `{ message: ${JSON.stringify(encodingError)} }` : ""})`;
  }

  const contentMediaType = withMessage(schema, "contentMediaType", ({ value }) => {
    if (value === "application/json") {
      return {
        opener:
          '.transform((str, ctx) => { try { return JSON.parse(str); } catch (err) { ctx.addIssue({ code: "custom", message: "Invalid JSON" }); }}',
        closer: ")",
        messagePrefix: ", { message: ",
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
          messagePrefix: ", { message: ",
          messageCloser: " })",
        };
      }
    });
  }

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
