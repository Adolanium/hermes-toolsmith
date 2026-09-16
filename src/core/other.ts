import { fromHex, toHex } from "./encoding";
import { demand, DiffLine, LIMITS, result, utf8 } from "./types";

export function randomString(length: number, alphabet: string): string {
  demand(
    Number.isSafeInteger(length) && length >= 1 && length <= 4096,
    "Length must be 1 to 4,096.",
  );
  demand(
    alphabet.length >= 2 &&
      alphabet.length <= 256 &&
      new Set(alphabet).size === alphabet.length,
    "Character set must contain 2 to 256 distinct single-unit characters.",
  );
  const cutoff = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < length) {
    const bytes = crypto.getRandomValues(
      new Uint8Array(Math.min(8192, (length - out.length) * 2)),
    );
    for (const byte of bytes)
      if (byte < cutoff && out.length < length)
        out += alphabet[byte % alphabet.length];
  }
  return out;
}
export async function hash(input: string, algorithm: string, encoding: string) {
  const bytes = encoding === "hexadecimal bytes" ? fromHex(input) : utf8(input);
  const digest = await crypto.subtle.digest(
    algorithm,
    bytes as Uint8Array<ArrayBuffer>,
  );
  return result(
    toHex(new Uint8Array(digest)),
    "text",
    `${algorithm}; input is ${encoding}; ${bytes.length} bytes. No Unicode or newline normalization.`,
  );
}
export function baseConvert(input: string, from: number, to: number): string {
  demand(input.length <= 16384, "Integer exceeds 16,384 characters.");
  demand(
    [2, 8, 10, 16].includes(from) && [2, 8, 10, 16].includes(to),
    "Unsupported number base.",
  );
  const sign = input.startsWith("-") ? -1n : 1n;
  const digits =
    input.startsWith("-") || input.startsWith("+") ? input.slice(1) : input;
  const valid = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[\da-f]+$/i }[
    from
  ]!;
  demand(
    valid.test(digits),
    "Use integer digits only for the selected base, without prefixes, fractions, or separators.",
  );
  const prefix = { 2: "0b", 8: "0o", 10: "", 16: "0x" }[from]!;
  return (sign * BigInt(prefix + digits)).toString(to);
}
export function textUtility(
  input: string,
  action: string,
  sensitivity: string,
  endings: string,
) {
  const separator =
    endings === "CRLF"
      ? "\r\n"
      : endings === "LF"
        ? "\n"
        : (input.match(/\r\n|\r|\n/)?.[0] ?? "\n");
  if (action === "statistics") {
    const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    let graphemes = 0;
    for (const _ of segments.segment(input)) graphemes++;
    return result(
      `UTF-8 bytes: ${utf8(input).length}\nUTF-16 code units: ${input.length}\nUnicode code points: ${[...input].length}\nGrapheme clusters: ${graphemes}\nLines: ${input === "" ? 0 : input.split(/\r\n|\r|\n/).length}`,
      "report",
    );
  }
  if (action === "uppercase" || action === "lowercase")
    return result(
      action === "uppercase" ? input.toUpperCase() : input.toLowerCase(),
      "text",
      "Unicode default case mapping; length can change. Original line endings are preserved.",
    );
  const found = input.match(/\r\n|\r|\n/g) ?? [];
  demand(
    endings !== "preserve" || new Set(found).size <= 1,
    "Mixed line endings. Select LF or CRLF explicitly before transforming lines.",
  );
  let lines = input.split(/\r\n|\r|\n/);
  const key = (s: string) =>
    sensitivity === "ignore case" ? s.toLowerCase() : s;
  if (action === "sort lines")
    lines.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  if (action === "unique lines") {
    const seen = new Set<string>();
    lines = lines.filter((s) => {
      const k = key(s);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  if (action === "trim lines") lines = lines.map((s) => s.trim());
  if (action === "remove empty lines")
    lines = lines.filter((s) => s.length > 0);
  return result(
    lines.join(separator),
    "text",
    "Line transformations can change blank lines and final-newline placement. Sorting uses Unicode code-unit order.",
  );
}
export function textDiff(a: string, b: string) {
  demand(
    a.length <= 64000 && b.length <= 64000,
    "Text diff is limited to 64,000 code units per input.",
  );
  const x = a.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? [],
    y = b.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? [];
  demand(
    x.length <= LIMITS.diffLines &&
      y.length <= LIMITS.diffLines &&
      (x.length + 1) * (y.length + 1) <= LIMITS.diffCells,
    "Diff exceeds 1,000 lines or 250,000 comparison cells. Compare smaller sections.",
  );
  const cols = y.length + 1,
    table = new Uint16Array((x.length + 1) * cols);
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      table[i * cols + j] =
        x[i] === y[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
  const diff: DiffLine[] = [];
  let i = 0,
    j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      diff.push({ kind: "same", text: x[i++] });
      j++;
    } else if (
      i < x.length &&
      (j === y.length || table[(i + 1) * cols + j] >= table[i * cols + j + 1])
    )
      diff.push({ kind: "removed", text: x[i++] });
    else diff.push({ kind: "added", text: y[j++] });
  }
  for (let k = 0; k + 1 < diff.length; k++) {
    const a = diff[k],
      b = diff[k + 1];
    if (a.kind !== "removed" || b.kind !== "added") continue;
    let prefix = 0,
      suffix = 0;
    while (
      prefix < Math.min(a.text.length, b.text.length) &&
      a.text[prefix] === b.text[prefix]
    )
      prefix++;
    while (
      suffix < Math.min(a.text.length, b.text.length) - prefix &&
      a.text.at(-suffix - 1) === b.text.at(-suffix - 1)
    )
      suffix++;
    a.prefix = b.prefix = prefix;
    a.suffix = b.suffix = suffix;
  }
  const display = (s: string) =>
    s
      .replace(/\r\n$/, " [CRLF]")
      .replace(/\n$/, " [LF]")
      .replace(/\r$/, " [CR]") + (!/[\r\n]$/.test(s) ? " [no EOL]" : "");
  return {
    ...result(
      diff
        .map(
          (d) =>
            `${d.kind === "same" ? " " : d.kind === "added" ? "+" : "-"} ${display(d.text)}`,
        )
        .join("\n") || "Both inputs are empty.",
      "report",
      "Line endings are significant. Adjacent single-line changes highlight the differing range.",
    ),
    diff,
  };
}
export function colorConvert(input: string) {
  let r: number, g: number, b: number;
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(input);
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(input);
  const hsl =
    /^hsl\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/i.exec(
      input,
    );
  if (hex) {
    const v =
      hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join("") : hex[1];
    [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  } else if (rgb) {
    [r, g, b] = rgb.slice(1).map(Number);
    demand(
      Math.max(r, g, b) <= 255,
      "RGB channels must be integers from 0 to 255.",
    );
  } else if (hsl) {
    const [h, s, l] = hsl.slice(1).map(Number);
    demand(
      h <= 360 && s <= 100 && l <= 100,
      "HSL ranges: hue 0–360, saturation and lightness 0–100%.",
    );
    const c = ((1 - Math.abs((2 * l) / 100 - 1)) * s) / 100,
      x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
      m = l / 100 - c / 2;
    const parts =
      h < 60 || h === 360
        ? [c, x, 0]
        : h < 120
          ? [x, c, 0]
          : h < 180
            ? [0, c, x]
            : h < 240
              ? [0, x, c]
              : h < 300
                ? [x, 0, c]
                : [c, 0, x];
    [r, g, b] = parts.map((v) => Math.round((v + m) * 255));
  } else {
    demand(
      false,
      "Supported formats: #RGB, #RRGGBB, rgb(0, 128, 255), hsl(210, 100%, 50%). Alpha and CSS names are unsupported.",
    );
  }
  const [rn, gn, bn] = [r, g, b].map((v) => v / 255),
    max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn),
    d = max - min,
    l = (max + min) / 2;
  const h =
    d === 0
      ? 0
      : (max === rn
          ? (gn - bn) / d + (gn < bn ? 6 : 0)
          : max === gn
            ? (bn - rn) / d + 2
            : (rn - gn) / d + 4) * 60;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const color =
    "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  return {
    ...result(
      `${color}\nrgb(${r}, ${g}, ${b})\nhsl(${+h.toFixed(3)}, ${+(s * 100).toFixed(3)}%, ${+(l * 100).toFixed(3)}%)`,
      "report",
      "Opaque sRGB only. HSL input is rounded to 8-bit RGB; HSL output is rounded to 3 decimals.",
    ),
    color,
  };
}
