import { decodeHTMLStrict, encodeHTML } from "entities";
import { decodeText, demand, result, ToolError, utf8 } from "./types";

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");
export function fromHex(input: string): Uint8Array {
  demand(
    /^(?:[\da-f]{2})*$/i.test(input),
    "Hex must contain complete byte pairs without spaces or a 0x prefix.",
  );
  return Uint8Array.from(input.match(/../g) ?? [], (s) => parseInt(s, 16));
}
export function encodeBase64(bytes: Uint8Array, url = false): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const encoded = btoa(binary);
  return url
    ? encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    : encoded;
}
export function decodeBase64(source: string, url = false): Uint8Array {
  demand(
    (url ? /^[A-Za-z0-9_-]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/).test(source),
    "Invalid Base64 alphabet or whitespace. Select the correct variant.",
  );
  const raw = source.replace(/=+$/, "");
  demand(
    raw.length % 4 !== 1 && (!source.includes("=") || source.length % 4 === 0),
    "Invalid Base64 length or padding.",
  );
  demand(
    url || source.length % 4 === 0,
    "Standard Base64 requires padding to a multiple of four characters.",
  );
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(
      atob(raw.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
  } catch {
    throw new ToolError("Invalid Base64 encoding.");
  }
  demand(
    encodeBase64(bytes, url).replace(/=+$/, "") === raw,
    "Base64 contains nonzero padding bits.",
  );
  return bytes;
}
export function urlTransform(
  input: string,
  action: string,
  mode: string,
): string {
  try {
    if (action === "encode") {
      utf8(input);
      if (mode === "full URI") return encodeURI(input);
      const value = encodeURIComponent(input);
      return mode === "form component"
        ? value
            .replace(
              /[!'()~]/g,
              (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
            )
            .replace(/%20/g, "+")
        : value;
    }
    return mode === "full URI"
      ? decodeURI(input)
      : decodeURIComponent(
          mode === "form component" ? input.replace(/\+/g, " ") : input,
        );
  } catch {
    throw new ToolError(
      "Malformed URL encoding or invalid Unicode. Decode expects percent-encoded UTF-8 bytes.",
    );
  }
}
export const htmlTransform = (input: string, action: string) => {
  if (action === "decode") return decodeHTMLStrict(input);
  demand(
    input.length <= 32768,
    "HTML entity encoding is limited to 32,768 code units to bound expansion.",
  );
  return encodeHTML(input);
};
export function base64Result(
  input: string,
  action: string,
  variant: string,
  output: string,
  bytes: string,
) {
  if (action === "encode")
    return result(
      encodeBase64(
        bytes === "hexadecimal bytes" ? fromHex(input) : utf8(input),
        variant === "URL-safe",
      ),
    );
  const decoded = decodeBase64(input, variant === "URL-safe");
  return output === "hexadecimal bytes"
    ? result(
        toHex(decoded),
        "hex",
        "Decoded binary bytes shown as hexadecimal.",
      )
    : result(
        decodeText(decoded),
        "text",
        "Decoded as strict UTF-8, including any byte-order mark.",
      );
}
