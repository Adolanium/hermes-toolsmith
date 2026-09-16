import { parseJson } from "./json";
import { Options } from "./types";
export interface Suggestion {
  tool: string;
  label: string;
  options?: Options;
}
export function detect(input: string): Suggestion[] {
  if (!input || input.length > 32768) return [];
  const out: Suggestion[] = [];
  try {
    parseJson(input);
    out.push(
      { tool: "json", label: "Format JSON", options: { action: "format" } },
      { tool: "json", label: "Minify JSON", options: { action: "minify" } },
      { tool: "json-tree", label: "Inspect JSON" },
    );
  } catch {
    /* Advisory only. */
  }
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(input))
    out.push({ tool: "jwt", label: "Try JWT inspector" });
  if (/^https?:\/\/\S+$/i.test(input)) {
    try {
      new URL(input);
      out.push({ tool: "url-inspect", label: "Inspect URL" });
    } catch {
      /* Keep manual tools available. */
    }
  }
  if (/^-?\d{9,16}$/.test(input))
    out.push(
      { tool: "timestamp", label: "Try seconds", options: { mode: "seconds" } },
      {
        tool: "timestamp",
        label: "Try milliseconds",
        options: { mode: "milliseconds" },
      },
    );
  if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(input))
    out.push({ tool: "color", label: "Inspect color" });
  if (
    input.length >= 8 &&
    !/^\d+$/.test(input) &&
    /^(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      input,
    ) &&
    /[=+/0-9]/.test(input)
  )
    out.push({
      tool: "base64",
      label: "Try Base64 decode",
      options: { action: "decode", variant: "standard" },
    });
  if (
    input.length >= 8 &&
    /^[A-Za-z0-9_-]+$/.test(input) &&
    /[_-]/.test(input) &&
    input.length % 4 !== 1
  )
    out.push({
      tool: "base64",
      label: "Try Base64URL decode",
      options: { action: "decode", variant: "URL-safe" },
    });
  return out;
}
