import { Json, JsonNumber, parseJson, stringifyJson } from "./json";
import { demand, LIMITS } from "./types";

export function parseCsv(source: string, delimiter = ","): string[][] {
  if (source === "") return [];
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    state: "start" | "bare" | "quote" | "closed" = "start";
  const push = () => {
    row.push(field);
    field = "";
    state = "start";
    demand(row.length <= 500, "CSV exceeds 500 columns.");
  };
  const finish = () => {
    push();
    rows.push(row);
    row = [];
    demand(rows.length <= 10000, "CSV exceeds 10,000 rows.");
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (state === "quote") {
      if (ch !== '"') field += ch;
      else if (source[i + 1] === '"') {
        field += '"';
        i++;
      } else state = "closed";
    } else if (ch === delimiter) push();
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      finish();
    } else if (ch === '"' && state === "start") state = "quote";
    else {
      demand(
        state !== "closed" && ch !== '"',
        "Malformed CSV: unexpected text or quote outside a quoted field.",
      );
      field += ch;
      state = "bare";
    }
  }
  demand(state !== "quote", "Malformed CSV: unterminated quoted field.");
  if (field || row.length || state !== "start" || !/[\r\n]$/.test(source))
    finish();
  return rows;
}
export function csvToJson(source: string, delimiter = ","): string {
  const rows = parseCsv(source, delimiter);
  if (!rows.length) return "[]";
  const [header, ...data] = rows;
  demand(
    new Set(header).size === header.length,
    "Duplicate CSV column names would lose data.",
  );
  demand(
    header.every((s) => s.length > 0),
    "CSV requires nonempty column names in its first row.",
  );
  const objects = data.map((row, i) => {
    demand(
      row.length === header.length,
      `CSV row ${i + 2} has ${row.length} fields; expected ${header.length}. No columns were discarded.`,
    );
    return Object.fromEntries(header.map((key, index) => [key, row[index]]));
  });
  return stringifyJson(objects, 2);
}
export function jsonToCsv(
  source: string,
  delimiter: string,
  eol: string,
  neutralize: boolean,
): string {
  const items = parseJson(source);
  demand(
    Array.isArray(items),
    "CSV export requires an array of flat objects with identical columns.",
  );
  if (!items.length) return "";
  demand(items.length <= 10000, "CSV exceeds 10,000 rows.");
  const object = (x: Json): x is Record<string, Json> =>
    x !== null &&
    typeof x === "object" &&
    !Array.isArray(x) &&
    !(x instanceof JsonNumber);
  demand(
    items.every(object),
    "CSV export requires flat objects. Arrays, primitives and nested objects are unsupported.",
  );
  const keys = Object.keys(items[0]);
  demand(
    keys.length > 0 && keys.length <= 500 && keys.every(Boolean),
    "CSV requires 1 to 500 nonempty column names.",
  );
  const cell = (x: Json): string => {
    demand(
      x !== null && (typeof x !== "object" || x instanceof JsonNumber),
      "Null and nested values have no unambiguous CSV representation. Convert them explicitly first.",
    );
    let s = typeof x === "string" ? x : stringifyJson(x);
    if (neutralize && /^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
    return s === "" || s.includes(delimiter) || /["\r\n]/.test(s)
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };
  const lines = [keys.map(cell).join(delimiter)];
  for (const item of items) {
    demand(
      Object.keys(item).length === keys.length &&
        keys.every((k) => Object.hasOwn(item, k)),
      "Objects have different columns. No fields were discarded.",
    );
    lines.push(keys.map((k) => cell(item[k])).join(delimiter));
  }
  const out = lines.join(eol);
  demand(out.length <= LIMITS.output, "CSV output exceeds the output limit.");
  return out;
}
