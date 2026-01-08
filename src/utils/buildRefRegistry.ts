import { JsonSchema, JsonSchemaObject } from "../Types.js";
import { resolveUri } from "./resolveUri.js";

export type RefRegistryEntry = {
  schema: JsonSchema;
  path: (string | number)[];
  baseUri: string;
  dynamic?: boolean;
  anchor?: string;
};

export const buildRefRegistry = (
  schema: JsonSchema,
  rootBaseUri = "root:///"
): { registry: Map<string, RefRegistryEntry>; rootBaseUri: string } => {
  const registry = new Map<string, RefRegistryEntry>();

  const seen = new WeakSet<object>();

  const walk = (node: JsonSchema, baseUri: string, path: (string | number)[]) => {
    if (typeof node !== "object" || node === null) return;
    if (seen.has(node as object)) return;
    seen.add(node as object);

    const obj = node as JsonSchemaObject;

    const nextBase = obj.$id ? resolveUri(baseUri, obj.$id) : baseUri;

    // Legacy recursive anchor
    if (obj.$recursiveAnchor === true) {
      const name = "__recursive__";
      registry.set(`${nextBase}#${name}`, {
        schema: node,
        path,
        baseUri: nextBase,
        dynamic: true,
        anchor: name,
      });
    }

    // Register base entry
    registry.set(nextBase, { schema: node, path, baseUri: nextBase });

    if (typeof obj.$anchor === "string") {
      registry.set(`${nextBase}#${obj.$anchor}`, {
        schema: node,
        path,
        baseUri: nextBase,
        anchor: obj.$anchor,
      });
    }

    if (typeof obj.$dynamicAnchor === "string") {
      const name = obj.$dynamicAnchor;
      registry.set(`${nextBase}#${name}`, {
        schema: node,
        path,
        baseUri: nextBase,
        dynamic: true,
        anchor: name,
      });
    }

    for (const key in obj) {
      const value = (obj as Record<string, unknown>)[key];

      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v as JsonSchema, nextBase, [...path, key, i]));
      } else if (typeof value === "object" && value !== null) {
        walk(value as JsonSchema, nextBase, [...path, key]);
      }
    }
  };

  walk(schema, rootBaseUri, []);

  return { registry, rootBaseUri };
};
