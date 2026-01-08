import { JsonSchemaObject } from "../Types.js";

type Opener = string;
type MessagePrefix = string;
type Closer = string;

type Builder = {
  opener: Opener;
  closer: Closer;
  messagePrefix?: MessagePrefix;
  messageCloser?: Closer;
};

export function withMessage(
  schema: JsonSchemaObject,
  key: string,
  get: (props: { value: unknown; json: string }) => Builder | void
) {
  const value = schema[key as keyof typeof schema];

  let r = "";

  if (value !== undefined) {
    const got = get({ value, json: JSON.stringify(value) });

    if (got) {
      const { opener, closer, messagePrefix = "", messageCloser } = got;

      r += opener;

      if (schema.errorMessage?.[key] !== undefined) {
        r += messagePrefix + JSON.stringify(schema.errorMessage[key]);
        r += messageCloser ?? closer;
        return r;
      }

      r += closer;
    }
  }

  return r;
}
