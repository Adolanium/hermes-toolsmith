import {
  base64Result,
  fromHex,
  htmlTransform,
  toHex,
  urlTransform,
} from "./encoding";
import { csvToJson, jsonToCsv } from "./csv";
import { compareJson, parseJson, stringifyJson } from "./json";
import { inspectJwt, inspectUrl, timestamp } from "./inspect";
import {
  baseConvert,
  colorConvert,
  hash,
  randomString,
  textDiff,
  textUtility,
} from "./other";
import {
  decodeText,
  defaults,
  demand,
  inputLimit,
  LIMITS,
  Option,
  Options,
  result,
  Tool,
  utf8,
  validateOptions,
} from "./types";

const select = (
  key: string,
  label: string,
  values: string[],
  initial = values[0],
): Option => ({ key, label, values, default: initial });
const numeric = (
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
): Option => ({ key, label, default: value, min, max });
const action = select("action", "Operation", ["encode", "decode"]);
const utf = ["UTF-8 text", "hexadecimal bytes"];
const jsonExample =
  '{"name":"שלום 👋","count":9007199254740993,"tags":["local","tools"]}';
type Spec = Omit<Tool, "inputType" | "outputType" | "recipe" | "options"> &
  Partial<Pick<Tool, "outputType" | "recipe" | "options">>;
const define = (spec: Spec): Tool => ({
  inputType: "text",
  outputType: () => "text",
  recipe: true,
  options: [],
  ...spec,
});
export const tools: Tool[] = [
  define({
    id: "base64",
    name: "Base64 / Base64URL",
    category: "Encoding",
    terms: "encode decode bytes binary",
    description:
      "Encode UTF-8 or hex bytes. Decode as strict UTF-8 or inspect binary bytes as hex.",
    example: "שלום 👋",
    options: [
      action,
      select("variant", "Variant", ["standard", "URL-safe"]),
      select("bytes", "Encode input", utf),
      select("output", "Decode output", utf),
    ],
    outputType: (o) =>
      o.action === "decode" && o.output === "hexadecimal bytes"
        ? "hex"
        : "text",
    run: (s, o) =>
      base64Result(
        s,
        String(o.action),
        String(o.variant),
        String(o.output),
        String(o.bytes),
      ),
  }),
  define({
    id: "url-codec",
    name: "URL encoding",
    category: "Encoding",
    terms: "percent uri component form",
    description:
      "Component mode escapes delimiters. Full URI mode preserves URL delimiters. Form mode treats + as a space.",
    example: "hello + שלום / tools",
    options: [
      action,
      select("mode", "Mode", ["component", "full URI", "form component"]),
    ],
    run: (s, o) => result(urlTransform(s, String(o.action), String(o.mode))),
  }),
  define({
    id: "html",
    name: "HTML entities",
    category: "Encoding",
    terms: "escape unescape ampersand",
    description:
      "Named and numeric entities, processed as text. Decoding requires semicolons. Input is never rendered as HTML.",
    example: '<p title="tools">שלום & hello</p>',
    options: [action],
    run: (s, o) => result(htmlTransform(s, String(o.action))),
  }),
  define({
    id: "hex",
    name: "Text / hexadecimal",
    category: "Encoding",
    terms: "bytes utf8 encode decode",
    description:
      "UTF-8 text and hexadecimal byte pairs. Invalid UTF-8 is rejected rather than replaced.",
    example: "שלום 👋",
    options: [action],
    outputType: (o) => (o.action === "encode" ? "hex" : "text"),
    run: (s, o) =>
      o.action === "encode"
        ? result(toHex(utf8(s)), "hex")
        : result(decodeText(fromHex(s))),
  }),
  define({
    id: "json",
    name: "JSON format / validate",
    category: "Structured data",
    terms: "pretty minify lint",
    description:
      "Preserves exact number literals. Rejects duplicate keys. Validation returns the unchanged document.",
    example: jsonExample,
    options: [
      select("action", "Operation", ["format", "minify", "validate"]),
      select("indent", "Indent spaces", ["2", "4"]),
    ],
    run: (s, o) => {
      const value = parseJson(s);
      return result(
        o.action === "validate"
          ? s
          : stringifyJson(value, o.action === "format" ? Number(o.indent) : 0),
        "text",
        o.action === "validate"
          ? "Valid JSON. Original text is unchanged; duplicate keys are rejected."
          : "Exact numeric literals preserved.",
      );
    },
  }),
  define({
    id: "json-string",
    name: "JSON string escaping",
    category: "Structured data",
    terms: "quote unquote escape unescape",
    description:
      "Encode a string as a JSON string literal, or decode a JSON string literal. This is distinct from formatting a document.",
    example: 'A line\n"quoted" שלום',
    options: [action],
    run: (s, o) => {
      if (o.action === "encode") return result(JSON.stringify(s));
      const parsed = parseJson(s);
      demand(
        typeof parsed === "string",
        "Unescaping requires a JSON string literal including the surrounding quotes.",
      );
      return result(parsed);
    },
  }),
  define({
    id: "json-tree",
    name: "JSON tree",
    category: "Structured data",
    terms: "inspect explore path pointer subtree",
    description:
      "Expand only the branches you need. Paths use JSON Pointer. Large branches are shown in pages of 100.",
    example: jsonExample,
    recipe: false,
    outputType: () => "report",
    run: (s) => {
      const tree = parseJson(s);
      return { ...result(stringifyJson(tree, 2), "report"), tree };
    },
  }),
  define({
    id: "json-diff",
    name: "JSON comparison",
    category: "Structured data",
    terms: "diff compare changed added removed",
    description:
      "Compares exact numbers and structure. Object key order is ignored; array order matters. Paths use JSON Pointer.",
    example: '{"name":"Toolsmith","version":1}',
    recipe: false,
    comparison: true,
    outputType: () => "report",
    run: (s, _, b) => result(compareJson(parseJson(s), parseJson(b)), "report"),
  }),
  define({
    id: "csv",
    name: "CSV / JSON",
    category: "Structured data",
    terms: "table delimiters spreadsheet",
    description:
      "CSV headers become object keys. Values stay strings, including leading zeros. Export requires flat objects with identical columns; null is rejected.",
    example:
      'id,name,note\r\n001,שלום,"hello, world"\r\n002,Tools,"two\nlines"',
    options: [
      select("action", "Operation", ["CSV to JSON", "JSON to CSV"]),
      select("delimiter", "Delimiter", ["comma", "semicolon", "tab"]),
      select("eol", "Export line endings", ["CRLF", "LF"]),
      {
        key: "neutralize",
        label: "Prefix spreadsheet formulas with apostrophe (changes data)",
        default: false,
      },
    ],
    run: (s, o) => {
      const delimiter =
        o.delimiter === "comma" ? "," : o.delimiter === "tab" ? "\t" : ";";
      return result(
        o.action === "CSV to JSON"
          ? csvToJson(s, delimiter)
          : jsonToCsv(
              s,
              delimiter,
              o.eol === "CRLF" ? "\r\n" : "\n",
              Boolean(o.neutralize),
            ),
        "text",
        "Spreadsheet software can execute formula-like cells. Neutralization is optional and changes data.",
      );
    },
  }),
  define({
    id: "jwt",
    name: "JWT inspector",
    category: "Inspectors",
    terms: "token header payload claims",
    description:
      "Decoded only. Signature not verified. Supports compact, three-segment JSON JWTs; no authentication claims are made.",
    example: "eyJhbGciOiJub25lIn0.eyJzdWIiOiJkZW1vIiwiaWF0IjoxNzY3MjI1NjAwfQ.",
    recipe: false,
    outputType: () => "report",
    run: inspectJwt,
  }),
  define({
    id: "timestamp",
    name: "Unix timestamp",
    category: "Inspectors",
    terms: "date seconds milliseconds epoch time",
    description:
      "Explicit units. Date input requires an ISO date with seconds and timezone. UTC and local time are labeled.",
    example: "1767225600",
    recipe: false,
    options: [
      select("mode", "Input mode", [
        "seconds",
        "milliseconds",
        "ISO date to timestamp",
      ]),
    ],
    outputType: () => "report",
    run: (s, o) => timestamp(s, String(o.mode)),
  }),
  define({
    id: "url-inspect",
    name: "URL / query inspector",
    category: "Inspectors",
    terms: "uri query params parameters",
    description:
      "Inspect components and every query entry in order. Repeated parameters remain separate. URLs are never opened or fetched.",
    example: "https://example.com/tools?tag=local&tag=dev&q=hello+world#result",
    recipe: false,
    options: [select("mode", "Input mode", ["absolute URL", "query string"])],
    outputType: () => "report",
    run: (s, o) => inspectUrl(s, String(o.mode)),
  }),
  define({
    id: "uuid",
    name: "UUID v4",
    category: "Generators & hashes",
    terms: "guid random identifiers",
    description:
      "Generate 1 to 100 UUIDs using the browser cryptographic random source.",
    example: "",
    recipe: false,
    generator: true,
    options: [numeric("count", "Count", 1, 1, LIMITS.batch)],
    run: (_, o) =>
      result(
        Array.from({ length: Number(o.count) }, () => crypto.randomUUID()).join(
          "\n",
        ),
      ),
  }),
  define({
    id: "random",
    name: "Random strings / passwords",
    category: "Generators & hashes",
    terms: "secure entropy generate",
    description:
      "Cryptographic rejection sampling without modulo bias. Each character is independently sampled; no category minimum is implied.",
    example: "",
    recipe: false,
    generator: true,
    options: [
      numeric("length", "Length", 24, 1, 4096),
      select("charset", "Character set", [
        "letters + digits",
        "letters + digits + symbols",
        "hexadecimal",
        "digits",
      ]),
    ],
    run: (_, o) => {
      const letters =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const alphabet =
        o.charset === "digits"
          ? "0123456789"
          : o.charset === "hexadecimal"
            ? "0123456789abcdef"
            : letters +
              (o.charset === "letters + digits + symbols"
                ? "!@#$%^&*()-_=+[]{}:,.?"
                : "");
      return result(randomString(Number(o.length), alphabet));
    },
  }),
  define({
    id: "hash",
    name: "SHA-256 / SHA-512",
    category: "Generators & hashes",
    terms: "digest checksum crypto",
    description:
      "Hash exactly the selected input bytes with Web Crypto. UTF-8 input is not normalized.",
    example: "abc",
    options: [
      select("algorithm", "Algorithm", ["SHA-256", "SHA-512"]),
      select("encoding", "Input bytes", utf),
    ],
    run: (s, o) => hash(s, String(o.algorithm), String(o.encoding)),
  }),
  define({
    id: "text",
    name: "Text utilities",
    category: "Text & conversions",
    terms: "sort unique deduplicate trim empty case statistics count",
    description:
      "Explicit line-ending and case settings. Statistics distinguish bytes, code units, code points, and grapheme clusters.",
    example: "pear\napple\npear\n שלום 👋 ",
    options: [
      select("action", "Operation", [
        "sort lines",
        "unique lines",
        "trim lines",
        "remove empty lines",
        "uppercase",
        "lowercase",
        "statistics",
      ]),
      select("case", "Comparison", ["case sensitive", "ignore case"]),
      select("eol", "Line endings", ["preserve", "LF", "CRLF"]),
    ],
    outputType: (o) => (o.action === "statistics" ? "report" : "text"),
    run: (s, o) =>
      textUtility(s, String(o.action), String(o.case), String(o.eol)),
  }),
  define({
    id: "text-diff",
    name: "Text diff",
    category: "Text & conversions",
    terms: "compare lines differences",
    description:
      "Bounded line comparison with inline highlights for adjacent changed lines. Line-ending changes remain visible.",
    example: "first line\nold value\nlast line\n",
    recipe: false,
    comparison: true,
    outputType: () => "report",
    run: (s, _, b) => textDiff(s, b),
  }),
  define({
    id: "number",
    name: "Number bases",
    category: "Text & conversions",
    terms: "binary octal decimal hex bigint integer",
    description:
      "Exact integer conversion using BigInt. No fractions, prefixes, digit separators, or floating-point rounding.",
    example: "9007199254740993",
    options: [
      select("fromBase", "From base", ["2", "8", "10", "16"], "10"),
      select("to", "To base", ["2", "8", "10", "16"], "16"),
    ],
    run: (s, o) => result(baseConvert(s, Number(o.fromBase), Number(o.to))),
  }),
  define({
    id: "color",
    name: "Color conversion",
    category: "Text & conversions",
    terms: "rgb hsl hex swatch",
    description:
      "Opaque sRGB colors: #RGB, #RRGGBB, integer rgb(), or hsl() with comma-separated values.",
    example: "#4976c4",
    recipe: false,
    outputType: () => "report",
    run: colorConvert,
  }),
];
export const toolMap = new Map(tools.map((t) => [t.id, t]));
export async function execute(
  id: string,
  input: string,
  options?: Options,
  secondary = "",
) {
  const tool = toolMap.get(id);
  demand(tool, "Unknown tool.");
  inputLimit(input);
  inputLimit(secondary);
  const checked = validateOptions(tool, options ?? defaults(tool));
  const output = await tool.run(input, checked, secondary);
  demand(
    output.text.length <= LIMITS.output,
    `Output exceeds ${LIMITS.output.toLocaleString()} code units. Reduce the input.`,
  );
  return output;
}
