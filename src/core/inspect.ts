import { decodeBase64 } from "./encoding";
import { Json, JsonNumber, parseJson, stringifyJson } from "./json";
import { decodeText, demand, result, ToolError } from "./types";

export function inspectJwt(input: string) {
  const segments = input.split(".");
  demand(
    segments.length === 3,
    "Only three-segment compact JWT/JWS tokens are supported. JWE and detached payloads are unsupported.",
  );
  demand(segments[0] && segments[1], "JWT header and payload must be present.");
  demand(
    segments.every((segment) => /^[A-Za-z0-9_-]*$/.test(segment)),
    "JWT segments require unpadded Base64URL.",
  );
  const header = parseJson(decodeText(decodeBase64(segments[0], true)));
  const payload = parseJson(decodeText(decodeBase64(segments[1], true)));
  const isObject = (x: Json): x is Record<string, Json> =>
    !!x &&
    typeof x === "object" &&
    !Array.isArray(x) &&
    !(x instanceof JsonNumber);
  demand(
    isObject(header) && isObject(payload),
    "JWT header and payload must be JSON objects.",
  );
  demand(
    typeof header.alg === "string",
    "JWT header must specify an alg string.",
  );
  demand(
    header.b64 !== false && !Object.hasOwn(header, "crit"),
    "Critical extensions and unencoded JWT payloads are unsupported.",
  );
  decodeBase64(segments[2], true);
  const times: string[] = [];
  for (const key of ["iat", "nbf", "exp"]) {
    if (!Object.hasOwn(payload, key)) continue;
    const v = payload[key];
    const n = v instanceof JsonNumber ? Number(v.raw) : NaN;
    const date = new Date(n * 1000);
    times.push(
      `${key}: ${Number.isFinite(date.getTime()) ? date.toISOString() + " (UTC; display at millisecond precision)" : "unsupported NumericDate"}`,
    );
  }
  return result(
    `Decoded only. Signature not verified.\n\nHeader\n${stringifyJson(header, 2)}\n\nPayload\n${stringifyJson(payload, 2)}\n\nSignature segment (unverified)\n${segments[2] || "(empty)"}${times.length ? "\n\nTime claims\n" + times.join("\n") : ""}`,
    "report",
  );
}
export function timestamp(input: string, mode: string) {
  let millis: number;
  if (mode === "ISO date to timestamp") {
    const match =
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(
        input,
      );
    demand(
      match,
      "Use ISO 8601 with seconds and an explicit timezone, e.g. 2026-01-01T00:00:00Z. Fractional seconds support 1 to 3 digits.",
    );
    const [, y, m, d, hh, mm, ss, , zone] = match;
    const year = +y,
      month = +m,
      day = +d;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    demand(
      month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= days[month - 1] &&
        +hh < 24 &&
        +mm < 60 &&
        +ss < 60,
      "Date contains an out-of-range calendar or clock value.",
    );
    if (zone !== "Z")
      demand(
        +zone.slice(1, 3) <= 23 && +zone.slice(4) <= 59,
        "Timezone offset is out of range.",
      );
    millis = Date.parse(input);
  } else {
    demand(
      /^-?\d+$/.test(input),
      "Timestamp must be an integer. Choose seconds or milliseconds explicitly.",
    );
    demand(
      input.length <= 18,
      "Timestamp is outside the supported date range.",
    );
    const exact = BigInt(input) * (mode === "seconds" ? 1000n : 1n);
    demand(
      exact >= -8640000000000000n && exact <= 8640000000000000n,
      "Timestamp is outside the supported date range.",
    );
    millis = Number(exact);
  }
  const date = new Date(millis);
  demand(Number.isFinite(date.getTime()), "Unsupported date.");
  const absolute = BigInt(Math.abs(millis));
  const fraction = (absolute % 1000n)
    .toString()
    .padStart(3, "0")
    .replace(/0+$/, "");
  const seconds = `${millis < 0 ? "-" : ""}${absolute / 1000n}${fraction ? "." + fraction : ""}`;
  return result(
    `UTC: ${date.toISOString()}\nLocal: ${date.toString()}\nLocal zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}\nUnix seconds: ${seconds}\nUnix milliseconds: ${millis}`,
    "report",
  );
}
export function inspectUrl(input: string, mode: string) {
  let params: URLSearchParams,
    head = "";
  if (mode === "query string")
    params = new URLSearchParams(
      input.startsWith("?") ? input.slice(1) : input,
    );
  else {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new ToolError(
        "Enter an absolute URL including its scheme, or choose query string mode.",
      );
    }
    head = `Scheme: ${url.protocol}\nHostname: ${url.hostname}\nPort: ${url.port || "(default)"}\nUsername: ${url.username}\nPassword: ${url.password}\nPath: ${url.pathname}\nFragment: ${url.hash}\nRaw query: ${url.search}\n\n`;
    params = url.searchParams;
  }
  return result(
    head +
      "Query entries (ordered, repeated keys preserved)\n" +
      JSON.stringify([...params.entries()], null, 2),
    "report",
    "Uses the WHATWG URL parser. Query values use form decoding: + becomes a space; invalid percent bytes can display as replacement characters. The original input remains unchanged. No URL is fetched.",
  );
}
