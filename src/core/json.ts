import { demand, inputLimit, LIMITS, ToolError } from "./types";

/** Numeric lexemes are never routed through IEEE-754. */
export class JsonNumber {
  constructor(readonly raw: string) {}
}
export type Json =
  | null
  | boolean
  | string
  | JsonNumber
  | Json[]
  | { [key: string]: Json };
export function parseJson(source: string): Json {
  inputLimit(source);
  let at = 0,
    nodes = 0;
  const error = (message: string): never => {
    const lines = source.slice(0, at).split("\n");
    throw new ToolError(
      `${message} at line ${lines.length}, column ${lines.at(-1)!.length + 1}.`,
    );
  };
  const space = () => {
    while (/[\x20\t\r\n]/.test(source[at] ?? "\0")) at++;
  };
  const string = (): string => {
    const start = at++;
    while (at < source.length) {
      const ch = source[at++];
      if (ch === '"') {
        try {
          return JSON.parse(source.slice(start, at)) as string;
        } catch {
          error("Invalid JSON string escape");
        }
      }
      if (ch === "\\") at++;
      else if (ch.charCodeAt(0) < 32) error("Unescaped control character");
    }
    return error("Unterminated JSON string");
  };
  const value = (depth: number): Json => {
    if (depth > LIMITS.depth) error(`JSON exceeds depth ${LIMITS.depth}`);
    if (++nodes > LIMITS.nodes) error(`JSON exceeds ${LIMITS.nodes} values`);
    space();
    const ch = source[at];
    if (ch === '"') return string();
    if (ch === "{" || ch === "[") {
      const object = ch === "{",
        end = object ? "}" : "]";
      at++;
      space();
      const out: Json[] | Record<string, Json> = object
        ? Object.create(null)
        : [];
      if (source[at] === end) {
        at++;
        return out;
      }
      while (at < source.length) {
        space();
        let key = "";
        if (object) {
          if (source[at] !== '"') error("Expected a quoted object key");
          key = string();
          space();
          if (Object.hasOwn(out, key))
            error("Duplicate JSON object key would lose data");
          if (source[at++] !== ":") error("Expected a colon");
        }
        const next = value(depth + 1);
        if (object) (out as Record<string, Json>)[key] = next;
        else (out as Json[]).push(next);
        space();
        if (source[at] === end) {
          at++;
          return out;
        }
        if (source[at++] !== ",") error("Expected a comma or closing bracket");
      }
      return error("Unclosed JSON container");
    }
    for (const [word, item] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (source.startsWith(word, at)) {
        at += word.length;
        return item;
      }
    }
    const number = source
      .slice(at)
      .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) {
      at += number[0].length;
      return new JsonNumber(number[0]);
    }
    return error("Expected a JSON value");
  };
  const out = value(0);
  space();
  if (at !== source.length) error("Unexpected text after JSON value");
  return out;
}
export function stringifyJson(value: Json, indent = 0, depth = 0): string {
  const parts: string[] = [];
  let length = 0;
  const append = (part: string) => {
    length += part.length;
    demand(
      length <= LIMITS.output,
      "Output exceeds the JSON serialization limit. Reduce input size or indentation.",
    );
    parts.push(part);
  };
  const write = (item: Json, level: number) => {
    if (item instanceof JsonNumber) {
      append(item.raw);
      return;
    }
    if (item === null || typeof item !== "object") {
      append(JSON.stringify(item));
      return;
    }
    const array = Array.isArray(item),
      keys = Object.keys(item);
    append(array ? "[" : "{");
    keys.forEach((key, index) => {
      if (index) append(",");
      if (indent) append("\n" + " ".repeat(indent * (level + 1)));
      if (!array) append(JSON.stringify(key) + (indent ? ": " : ":"));
      write((item as Record<string, Json>)[key], level + 1);
    });
    if (indent && keys.length) append("\n" + " ".repeat(indent * level));
    append(array ? "]" : "}");
  };
  write(value, depth);
  return parts.join("");
}
function numericIdentity(raw: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(raw)!;
  let digits = (match[2] + (match[3] ?? "")).replace(/^0+/, "");
  if (!digits) return "0";
  let exponent = BigInt(match[4] ?? "0") - BigInt(match[3]?.length ?? 0);
  const trailing = digits.length - digits.replace(/0+$/, "").length;
  digits = digits.slice(0, digits.length - trailing);
  exponent += BigInt(trailing);
  return `${match[1]}${digits}e${exponent}`;
}
export const pointer = (key: string) =>
  key.replace(/~/g, "~0").replace(/\//g, "~1");
export function compareJson(a: Json, b: Json): string {
  const lines: string[] = [];
  let length = 0;
  const add = (kind: string, path: string, before?: Json, after?: Json) => {
    demand(
      lines.length < 2000,
      "Comparison exceeds 2,000 differences. Compare a smaller document.",
    );
    const line = `${kind} ${JSON.stringify(path)}${before === undefined ? "" : "\n  before: " + stringifyJson(before)}${after === undefined ? "" : "\n  after:  " + stringifyJson(after)}`;
    length += line.length + 2;
    demand(
      length <= LIMITS.output,
      "Output exceeds the comparison limit. Compare a smaller subtree.",
    );
    lines.push(line);
  };
  const walk = (x: Json, y: Json, path: string) => {
    if (
      x instanceof JsonNumber &&
      y instanceof JsonNumber &&
      numericIdentity(x.raw) === numericIdentity(y.raw)
    )
      return;
    if (x === y) return;
    if (
      x &&
      y &&
      typeof x === "object" &&
      typeof y === "object" &&
      !(x instanceof JsonNumber) &&
      !(y instanceof JsonNumber) &&
      Array.isArray(x) === Array.isArray(y)
    ) {
      const xx = x as Record<string, Json>,
        yy = y as Record<string, Json>;
      for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) {
        const next = path + "/" + pointer(key);
        demand(
          next.length <= 8192,
          "Comparison path exceeds 8,192 characters. Compare a smaller subtree.",
        );
        if (!Object.hasOwn(xx, key)) add("Added", next, undefined, yy[key]);
        else if (!Object.hasOwn(yy, key)) add("Removed", next, xx[key]);
        else walk(xx[key], yy[key], next);
      }
    } else add("Changed", path, x, y);
  };
  walk(a, b, "");
  return (
    lines.join("\n\n") ||
    "No structural differences. Object key order is ignored; array order matters."
  );
}
