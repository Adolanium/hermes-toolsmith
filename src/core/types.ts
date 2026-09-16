export const LIMITS = Object.freeze({
  input: 262144,
  output: 1048576,
  depth: 64,
  nodes: 25000,
  steps: 12,
  recipes: 20,
  diffLines: 1000,
  diffCells: 250000,
  batch: 100,
  recipeBytes: 32768,
});
export class ToolError extends Error {}
export function demand(ok: unknown, message: string): asserts ok {
  if (!ok) throw new ToolError(message);
}
export function inputLimit(text: string) {
  demand(
    text.length <= LIMITS.input,
    `Input exceeds ${LIMITS.input.toLocaleString()} UTF-16 code units.`,
  );
}
export function utf8(text: string): Uint8Array {
  demand(
    !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
      text,
    ),
    "Input has an unpaired Unicode surrogate. UTF-8 encoding would lose data.",
  );
  return new TextEncoder().encode(text);
}
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new ToolError(
      "Bytes are not valid UTF-8. Choose hexadecimal output to inspect binary data.",
    );
  }
}
export type OptionValue = string | number | boolean;
export type Options = Record<string, OptionValue>;
export type Option = {
  key: string;
  label: string;
  values?: readonly string[];
  default: OptionValue;
  min?: number;
  max?: number;
};
export type DataType = "text" | "hex" | "report";
export interface Result {
  text: string;
  type: DataType;
  note?: string;
  tree?: unknown;
  color?: string;
  diff?: DiffLine[];
}
export interface DiffLine {
  kind: "same" | "added" | "removed";
  text: string;
  prefix?: number;
  suffix?: number;
}
export interface Tool {
  id: string;
  name: string;
  category: string;
  terms: string;
  description: string;
  example: string;
  options: Option[];
  recipe: boolean;
  comparison?: boolean;
  generator?: boolean;
  inputType: "text";
  outputType: (options: Options) => DataType;
  run: (
    input: string,
    options: Options,
    secondary: string,
  ) => Result | Promise<Result>;
}
export const result = (
  text: string,
  type: DataType = "text",
  note?: string,
): Result => ({ text, type, note });
export function safeError(error: unknown): string {
  return error instanceof ToolError
    ? error.message
    : "The operation could not complete. Check the input and selected options.";
}
export function defaults(tool: Tool): Options {
  return Object.fromEntries(tool.options.map((o) => [o.key, o.default]));
}
export function validateOptions(tool: Tool, value: unknown): Options {
  demand(
    !!value && typeof value === "object" && !Array.isArray(value),
    "Options must be an object.",
  );
  const raw = value as Record<string, unknown>;
  demand(
    Object.keys(raw).every((key) => tool.options.some((o) => o.key === key)),
    "Unknown operation option.",
  );
  const out = defaults(tool);
  for (const option of tool.options) {
    if (!Object.hasOwn(raw, option.key)) continue;
    const v = raw[option.key];
    demand(
      typeof v === typeof option.default,
      `Invalid ${option.label} option.`,
    );
    if (option.values)
      demand(
        option.values.includes(v as string),
        `Unsupported ${option.label} option.`,
      );
    if (typeof v === "number")
      demand(
        Number.isSafeInteger(v) &&
          v >= (option.min ?? 0) &&
          v <= (option.max ?? 10000),
        `${option.label} is outside its allowed range.`,
      );
    out[option.key] = v as OptionValue;
  }
  return out;
}
