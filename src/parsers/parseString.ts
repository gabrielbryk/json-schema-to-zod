import { JsonSchema, JsonSchemaObject, Refs, SchemaRepresentation } from "../Types.js";
import { withMessage } from "../utils/withMessage.js";
import { parseSchema } from "./parseSchema.js";
import {
  zodCall,
  zodChain,
  zodPipe,
  zodRefine,
  zodString,
  zodTransform,
} from "../utils/schemaRepresentation.js";

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

  let result: SchemaRepresentation = zodString();

  if (formatFn) {
    if (schema.format === "date-time") {
      const args = [
        `{ offset: true${formatError ? `, message: ${JSON.stringify(formatError)}` : ""} }`,
      ];
      result = zodCall(formatFn, args, formatInfo.zodType);
    } else {
      const args = formatError ? [`{ message: ${JSON.stringify(formatError)} }`] : [];
      result = zodCall(formatFn, args, formatInfo.zodType);
    }
  }

  let formatWasHandled = Boolean(formatFn);

  if (!formatWasHandled && schema.format) {
    switch (schema.format) {
      case "ip":
        result = zodRefine(
          result,
          `(val) => {
          const v4 = z.ipv4().safeParse(val).success;
          const v6 = z.ipv6().safeParse(val).success;
          return v4 || v6;
        }${formatError ? `, { message: ${JSON.stringify(formatError)} }` : ""}`
        );
        formatWasHandled = true;
        break;

      case "binary": {
        const args = formatError ? [`{ message: ${JSON.stringify(formatError)} }`] : [];
        result = zodCall("z.base64", args, "z.ZodString");
        formatWasHandled = true;
        break;
      }

      case "hostname":
      case "idn-hostname":
        result = zodRefine(
          result,
          `(val) => {
          if (typeof val !== "string" || val.length === 0 || val.length > 253) return false;
          return val.split(".").every((label) => {
            return label.length > 0 && label.length <= 63 && /^[A-Za-z0-9-]+$/.test(label) && label[0] !== "-" && label[label.length - 1] !== "-";
          });
        }${formatError ? `, { message: ${JSON.stringify(formatError)} }` : ""}`
        );
        formatWasHandled = true;
        break;

      case "uri-reference":
      case "iri":
      case "iri-reference":
        result = zodRefine(
          result,
          `(val) => {
          try {
            new URL(val, "http://example.com");
            return true;
          } catch {
            return false;
          }
        }${formatError ? `, { message: ${JSON.stringify(formatError)} }` : ""}`
        );
        formatWasHandled = true;
        break;

      case "json-pointer":
        result = zodRefine(
          result,
          `(val) => typeof val === "string" && /^(?:\\/(?:[^/~]|~[01])*)*$/.test(val)${formatError ? `, { message: ${JSON.stringify(formatError)} }` : ""}`
        );
        formatWasHandled = true;
        break;

      case "relative-json-pointer":
        result = zodRefine(
          result,
          `(val) => typeof val === "string" && /^(?:0|[1-9][0-9]*)(?:#|(?:\\/(?:[^/~]|~[01])*))*$/.test(val)${formatError ? `, { message: ${JSON.stringify(formatError)} }` : ""}`
        );
        formatWasHandled = true;
        break;

      case "uri-template":
        result = zodRefine(
          result,
          `(val) => {
          if (typeof val !== "string") return false;
          const opens = (val.match(/\\{/g) || []).length;
          const closes = (val.match(/\\}/g) || []).length;
          return opens === closes;
        }${formatError ? `, { message: ${JSON.stringify(formatError)} }` : ""}`
        );
        formatWasHandled = true;
        break;

      case "regex":
        result = zodRefine(
          result,
          `(val) => {
          try {
            new RegExp(val);
            return true;
          } catch {
            return false;
          }
        }${formatError ? `, { message: ${JSON.stringify(formatError)} }` : ""}`
        );
        formatWasHandled = true;
        break;
    }
  }

  if (schema.format && !formatWasHandled) {
    refContext.onUnknownFormat?.(schema.format, refContext.path);
  }

  const pattern = withMessage(schema, "pattern", ({ json }) => ({
    opener: `.regex(new RegExp(${json})`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));
  if (pattern) {
    result = zodChain(result, pattern.slice(1));
  }

  const minLength = withMessage(schema, "minLength", ({ json }) => ({
    opener: `.min(${json}`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));
  if (minLength) {
    result = zodChain(result, minLength.slice(1));
  }

  const maxLength = withMessage(schema, "maxLength", ({ json }) => ({
    opener: `.max(${json}`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));
  if (maxLength) {
    result = zodChain(result, maxLength.slice(1));
  }

  if (schema.contentEncoding === "base64" && schema.format !== "base64") {
    const encodingError = schema.errorMessage?.contentEncoding;
    const args = encodingError ? [`{ message: ${JSON.stringify(encodingError)} }`] : [];
    result = zodCall("z.base64", args, "z.ZodString");
  }

  if (schema.contentMediaType === "application/json") {
    const contentMediaMessage = schema.errorMessage?.contentMediaType;
    const transform = `(str, ctx) => { try { return JSON.parse(str); } catch (err) { ctx.addIssue({ code: "custom", message: "Invalid JSON" }); }}`;
    const transformParams = contentMediaMessage
      ? `, { message: ${JSON.stringify(contentMediaMessage)} }`
      : "";
    result = zodTransform(result, `${transform}${transformParams}`);

    if (schema.contentSchema && typeof schema.contentSchema === "object") {
      const parsedContent = parseSchema(schema.contentSchema as JsonSchema, refContext);
      const contentSchemaMessage = schema.errorMessage?.contentSchema;
      const pipeParams = contentSchemaMessage
        ? `, { message: ${JSON.stringify(contentSchemaMessage)} }`
        : "";
      result = zodPipe(result, parsedContent, pipeParams);
    }
  }

  return result;
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
