import { JsonSchemaObject, JsonSchema, Refs } from "../Types.js";
import { resolveUri } from "./resolveUri.js";
import { buildRefRegistry } from "./buildRefRegistry.js";

const decodePointerSegment = (segment: string) =>
    segment.replace(/~1/g, "/").replace(/~0/g, "~");

const uriBaseFromRef = (resolvedUri: string): string | undefined => {
    const hashIdx = resolvedUri.indexOf("#");
    return hashIdx === -1 ? resolvedUri : resolvedUri.slice(0, hashIdx);
};

const isLocalBase = (base: string, rootBase: string): boolean => {
    if (!rootBase) return false;
    return base === rootBase;
};

export const resolveRef = (
    schemaNode: JsonSchemaObject,
    ref: string,
    refs: Refs,
): { schema: JsonSchema; path: (string | number)[]; baseUri: string; pointerKey: string } | undefined => {
    const base = refs.currentBaseUri ?? refs.rootBaseUri ?? "root:///";

    // Handle dynamicRef lookup via dynamicAnchors stack
    const isDynamic = typeof schemaNode.$dynamicRef === "string";
    if (isDynamic && refs.dynamicAnchors && ref.startsWith("#")) {
        const name = ref.slice(1);
        for (let i = refs.dynamicAnchors.length - 1; i >= 0; i -= 1) {
            const entry = refs.dynamicAnchors[i];
            if (entry.name === name) {
                const key = `${entry.uri}#${name}`;
                const target = refs.refRegistry?.get(key);
                if (target) {
                    return { schema: target.schema, path: target.path, baseUri: target.baseUri, pointerKey: key };
                }
            }
        }
    }

    // Resolve URI against base
    const resolvedUri = resolveUri(base, ref);
    const [uriBase, fragment] = resolvedUri.split("#");
    const key = fragment ? `${uriBase}#${fragment}` : uriBase;

    let regEntry = refs.refRegistry?.get(key);
    if (regEntry) {
        return { schema: regEntry.schema, path: regEntry.path, baseUri: regEntry.baseUri, pointerKey: key };
    }

    // Legacy recursive ref: treat as dynamic to __recursive__
    if (schemaNode.$recursiveRef) {
        const recursiveKey = `${base}#__recursive__`;
        regEntry = refs.refRegistry?.get(recursiveKey);
        if (regEntry) {
            return {
                schema: regEntry.schema,
                path: regEntry.path,
                baseUri: regEntry.baseUri,
                pointerKey: recursiveKey,
            };
        }
    }

    // External resolver hook
    const extBase = uriBaseFromRef(resolvedUri);
    if (refs.resolveExternalRef && extBase && !isLocalBase(extBase, refs.rootBaseUri ?? "")) {
        const loaded = refs.resolveExternalRef(extBase);
        if (loaded) {
            // If async resolver is used synchronously here, it will be ignored; keep simple sync for now
            const maybePromise = loaded as { then?: unknown };
            const schema =
                typeof maybePromise.then === "function"
                    ? undefined
                    : (loaded as JsonSchema);
            if (schema) {
                const { registry } = buildRefRegistry(schema, extBase);
                registry.forEach((entry, k) => refs.refRegistry?.set(k, entry));
                regEntry = refs.refRegistry?.get(key);
                if (regEntry) {
                    return {
                        schema: regEntry.schema,
                        path: regEntry.path,
                        baseUri: regEntry.baseUri,
                        pointerKey: key,
                    };
                }
            }
        }
    }

    // Backward compatibility: JSON Pointer into root
    if (refs.root && ref.startsWith("#/")) {
        const rawSegments = ref
            .slice(2)
            .split("/")
            .filter((segment) => segment.length > 0)
            .map(decodePointerSegment);

        let current: unknown = refs.root;

        for (const segment of rawSegments) {
            if (typeof current !== "object" || current === null) return undefined;
            current = (current as Record<string, unknown>)[segment as keyof typeof current];
        }

        return { schema: current as JsonSchema, path: rawSegments, baseUri: base, pointerKey: ref };
    }

    return undefined;
};
