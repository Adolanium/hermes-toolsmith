import test from "node:test";
import assert from "node:assert/strict";
import { execute, tools } from "../src/core/registry";
import {
  base64Result,
  decodeBase64,
  encodeBase64,
  fromHex,
  toHex,
  urlTransform,
} from "../src/core/encoding";
import { compareJson, parseJson, stringifyJson } from "../src/core/json";
import { parseCsv, csvToJson, jsonToCsv } from "../src/core/csv";
import { colorConvert, randomString, textDiff } from "../src/core/other";
import { detect } from "../src/core/detection";
import {
  compatible,
  demoInput,
  demoRecipe,
  exportRecipe,
  importRecipe,
  runRecipe,
  validateRecipe,
} from "../src/core/recipes";
import { Handoff, preferences, WorkspaceModel } from "../src/core/state";
import {
  decodeText,
  defaults,
  LIMITS,
  ToolError,
  utf8,
} from "../src/core/types";

for (const source of [
  "",
  "hello",
  "שלום 👋",
  "e\u0301",
  "one\r\ntwo\nthree",
  "\ufeffBOM",
]) {
  test(`strict UTF-8 codec round trip ${JSON.stringify(source)}`, () => {
    assert.equal(decodeText(decodeBase64(encodeBase64(utf8(source)))), source);
    assert.equal(
      decodeText(decodeBase64(encodeBase64(utf8(source), true), true)),
      source,
    );
    assert.equal(decodeText(fromHex(toHex(utf8(source)))), source);
  });
}
test("RFC 4648 known answers and binary variants", () => {
  assert.equal(encodeBase64(utf8("foobar")), "Zm9vYmFy");
  assert.equal(encodeBase64(new Uint8Array([251, 255])), "+/8=");
  assert.equal(encodeBase64(new Uint8Array([251, 255]), true), "-_8");
  assert.throws(() => decodeText(decodeBase64("/w==")), /valid UTF-8/);
  assert.equal(
    base64Result(
      "/w==",
      "decode",
      "standard",
      "hexadecimal bytes",
      "UTF-8 text",
    ).text,
    "ff",
  );
});
for (const bad of [
  "a",
  "Zg",
  "Zh==",
  "Zg===",
  "Zg=Z",
  "Zg==\n",
  "-_8=",
  "====",
])
  test(`Base64 rejects ${JSON.stringify(bad)}`, () =>
    assert.throws(() => decodeBase64(bad), ToolError));
test("URL-safe rejects the standard alphabet", () =>
  assert.throws(() => decodeBase64("+/8=", true)));
test("hex and Unicode reject malformed data", () => {
  for (const s of ["a", "gg", "0xff", "aa bb"]) assert.throws(() => fromHex(s));
  assert.throws(() => utf8("\ud800"));
  assert.throws(() => utf8("\udc00"));
  assert.throws(() => decodeText(new Uint8Array([0xc0, 0xaf])));
});
test("URL modes distinguish component, URI and form", () => {
  assert.equal(
    urlTransform("a+b c/?", "encode", "component"),
    "a%2Bb%20c%2F%3F",
  );
  assert.equal(
    urlTransform("https://example.com/?a=1", "encode", "full URI"),
    "https://example.com/?a=1",
  );
  assert.equal(urlTransform("a+b", "decode", "component"), "a+b");
  assert.equal(urlTransform("a+b", "decode", "form component"), "a b");
  assert.equal(urlTransform("%2F", "decode", "full URI"), "%2F");
  assert.throws(() => urlTransform("%FF", "decode", "component"));
  assert.throws(() => urlTransform("%", "decode", "component"));
});
test("HTML entities are processed as text", async () => {
  const source = '<img src=x onerror="throw 1">שלום & 👋';
  const encoded = await execute("html", source);
  assert(!encoded.text.includes("<"));
  assert.equal(
    (await execute("html", encoded.text, { action: "decode" })).text,
    source,
  );
  assert.equal(
    (
      await execute("html", "&CounterClockwiseContourIntegral; &#x1f44b;", {
        action: "decode",
      })
    ).text,
    "∳ 👋",
  );
});
test("JSON preserves arbitrarily precise number tokens", async () => {
  const source =
    '{"n":90071992547409931234567890,"small":1.234567890123456789,"exp":1e999}';
  const out = await execute("json", source, { action: "format", indent: "4" });
  assert.equal(stringifyJson(parseJson(out.text)), source);
  assert.equal(
    (await execute("json", source, { action: "validate" })).text,
    source,
  );
});
for (const source of [
  '{"a":1,"a":2}',
  '{"a":1,"\\u0061":2}',
  '{"nested":{"x":1,"x":2}}',
])
  test("JSON rejects duplicate keys " + source, () =>
    assert.throws(() => parseJson(source), /Duplicate/),
  );
for (const source of [
  '{"a":}',
  "[1,]",
  "01",
  "+1",
  "NaN",
  "true false",
  '"\n"',
  '"\\x20"',
  "",
  "{",
])
  test("JSON rejects malformed syntax " + JSON.stringify(source), () =>
    assert.throws(() => parseJson(source), /line \d+, column \d+/),
  );
test("prototype keys survive without pollution", () => {
  const source = '{"__proto__":{"polluted":true},"constructor":3}';
  assert.equal(stringifyJson(parseJson(source)), source);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(
    csvToJson("__proto__,constructor\nx,y"),
    '[\n  {\n    "__proto__": "x",\n    "constructor": "y"\n  }\n]',
  );
});
test("JSON comparison is structural and exact", () => {
  assert.match(
    compareJson(parseJson('{"b":1,"a":1.0}'), parseJson('{"a":1e0,"b":1}')),
    /No structural/,
  );
  assert.match(compareJson(parseJson("[1,2]"), parseJson("[2,1]")), /Changed/);
  const out = compareJson(
    parseJson('{"n":9007199254740993,"a":true}'),
    parseJson('{"n":9007199254740992,"b":true}'),
  );
  assert.match(out, /9007199254740993/);
  assert.match(out, /Removed/);
  assert.match(out, /Added/);
});
test("JSON strings are separate from document formatting", async () => {
  const source = '"שלום"\n👋';
  assert.equal(
    (
      await execute(
        "json-string",
        (await execute("json-string", source)).text,
        { action: "decode" },
      )
    ).text,
    source,
  );
  await assert.rejects(
    execute("json-string", '{"a":1}', { action: "decode" }),
    /string literal/,
  );
});
test("JSON depth, node and output limits", async () => {
  assert.throws(
    () => parseJson("[".repeat(66) + "0" + "]".repeat(66)),
    /depth/,
  );
  assert.throws(
    () => parseJson("[" + new Array(25001).fill("0").join(",") + "]"),
    /values/,
  );
  await assert.rejects(execute("json-string", "\0".repeat(200000)), /Output/);
});
test("CSV handles quoting, multiline, CRLF, empty values and leading zeros", () => {
  const source =
    'id,name,note\r\n001,"שלום, hello","two\r\nlines"\r\n002,"say ""hi""",\r\n';
  const json = csvToJson(source, ",");
  const values = JSON.parse(json);
  assert.deepEqual(values, [
    { id: "001", name: "שלום, hello", note: "two\r\nlines" },
    { id: "002", name: 'say "hi"', note: "" },
  ]);
  assert.deepEqual(
    parseCsv(jsonToCsv(json, ",", "\r\n", false)),
    parseCsv(source),
  );
});
test("CSV rejects malformed or ambiguous structures", () => {
  for (const source of [
    "a,a\nx,y",
    "a,b\nx",
    'a\n"unterminated',
    'a\n"x"oops',
    'a\nba"d',
  ])
    assert.throws(() => csvToJson(source, ","));
  for (const source of [
    '[{"a":{}}]',
    '[{"a":null}]',
    '[{"a":1},{"b":2}]',
    "[1]",
    "[{}]",
  ])
    assert.throws(() => jsonToCsv(source, ",", "\n", false));
});
test("CSV preserves a single empty field in the final row", () => {
  const source = '[{"a":""}]';
  const csv = jsonToCsv(source, ",", "\n", false);
  assert.equal(csv, 'a\n""');
  assert.equal(stringifyJson(parseJson(csvToJson(csv))), source);
});
test("pathological output expansion is bounded before joining", async () => {
  await assert.rejects(execute("html", "<".repeat(32769)), /limited/);
  const longKey = "k".repeat(8200);
  assert.throws(
    () =>
      compareJson(
        parseJson(JSON.stringify({ [longKey]: 1 })),
        parseJson(JSON.stringify({ [longKey]: 2 })),
      ),
    /path exceeds/,
  );
});
test("CSV formula neutralization is opt in and exact JSON numbers survive", () => {
  const source = '[{"id":"001","value":"=1+1","n":9007199254740993}]';
  assert.match(
    jsonToCsv(source, ",", "\n", false),
    /001,=1\+1,9007199254740993/,
  );
  assert.match(jsonToCsv(source, ",", "\n", true), /001,'=1\+1/);
});
test("JWT is decoded without a verification claim", async () => {
  const source = tools.find((t) => t.id === "jwt")!.example;
  const out = await execute("jwt", source);
  assert.match(out.text, /^Decoded only\. Signature not verified\./);
  assert.match(out.text, /2026-01-01/);
  await assert.rejects(execute("jwt", "a.b.c.d.e"), /three-segment/);
  await assert.rejects(
    execute(
      "jwt",
      `${encodeBase64(utf8('{"alg":"none","b64":false}'), true)}.e30.`,
    ),
    /unsupported/,
  );
});
test("timestamps use explicit units and exact timezone requirements", async () => {
  assert.match(
    (await execute("timestamp", "0")).text,
    /1970-01-01T00:00:00.000Z/,
  );
  assert.match(
    (await execute("timestamp", "1000", { mode: "milliseconds" })).text,
    /00:00:01.000Z/,
  );
  assert.match(
    (
      await execute("timestamp", "2026-01-01T02:00:00+02:00", {
        mode: "ISO date to timestamp",
      })
    ).text,
    /2026-01-01T00:00:00.000Z/,
  );
  for (const s of [
    "2026-01-01",
    "01/02/2026",
    "2026-02-30T00:00:00Z",
    "2026-01-01T25:00:00Z",
    "2026-01-01T00:00:00.1234Z",
  ])
    await assert.rejects(
      execute("timestamp", s, { mode: "ISO date to timestamp" }),
    );
  await assert.rejects(execute("timestamp", "1.5"));
});
test("URL inspector preserves repeated params and does not fetch", async () => {
  const out = await execute("url-inspect", "https://example.com/?a=1&a=2");
  assert.match(out.text, /"a",\n    "1"/);
  assert.match(out.text, /"a",\n    "2"/);
});
test("timestamps preserve fractional seconds even at date range extremes", async () => {
  assert.match(
    (await execute("timestamp", "8639999999999998", { mode: "milliseconds" }))
      .text,
    /Unix seconds: 8639999999999\.998\n/,
  );
  assert.match(
    (await execute("timestamp", "-1", { mode: "milliseconds" })).text,
    /Unix seconds: -0\.001\n/,
  );
});
test("UUID v4 and password bounds", async () => {
  const ids = (await execute("uuid", "", { count: 100 })).text.split("\n");
  assert.equal(new Set(ids).size, 100);
  assert(
    ids.every((id) =>
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(
        id,
      ),
    ),
  );
  const s = randomString(4096, "0123456789");
  assert.match(s, /^\d{4096}$/);
  await assert.rejects(execute("uuid", "", { count: 101 }));
  assert.throws(() => randomString(0, "ab"));
});
test("rejection sampling rejects the biased byte tail", () => {
  const original = crypto.getRandomValues.bind(crypto);
  let calls = 0;
  Object.defineProperty(crypto, "getRandomValues", {
    configurable: true,
    value: (data: Uint8Array) => {
      data.fill(calls++ === 0 ? 255 : 1);
      return data;
    },
  });
  try {
    assert.equal(randomString(4, "0123456789"), "1111");
    assert.equal(calls, 2);
  } finally {
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      value: original,
    });
  }
});
test("SHA-256 and SHA-512 known answer vectors", async () => {
  assert.equal(
    (await execute("hash", "abc")).text,
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    (
      await execute("hash", "616263", {
        algorithm: "SHA-512",
        encoding: "hexadecimal bytes",
      })
    ).text,
    "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
  );
});
test("text tools make line endings and character counts explicit", async () => {
  assert.equal(
    (await execute("text", "b\r\na\r\nb", { action: "unique lines" })).text,
    "b\r\na",
  );
  await assert.rejects(execute("text", "a\r\nb\nc"), /Mixed line endings/);
  const stats = (await execute("text", "e\u0301👋", { action: "statistics" }))
    .text;
  assert.match(stats, /UTF-8 bytes: 7/);
  assert.match(stats, /Grapheme clusters: 2/);
});
test("text diff highlights changes and preserves newline differences", () => {
  const out = textDiff("same\nold value\n", "same\nnew value\n");
  assert(out.diff.some((d) => d.kind === "removed"));
  assert(out.diff.some((d) => d.kind === "added" && d.suffix));
  assert(textDiff("x\r\n", "x\n").diff.some((d) => d.kind === "removed"));
  assert.throws(
    () => textDiff("x\n".repeat(700), "y\n".repeat(700)),
    /comparison cells/,
  );
});
test("number bases preserve huge integers", async () => {
  const source = "900719925474099312345678901234567890";
  const encoded = (await execute("number", source, { fromBase: "10", to: "2" }))
    .text;
  assert.equal(
    (await execute("number", encoded, { fromBase: "2", to: "10" })).text,
    source,
  );
  assert.equal(
    (await execute("number", "-ff", { fromBase: "16", to: "10" })).text,
    "-255",
  );
  await assert.rejects(execute("number", "1.2"));
  await assert.rejects(execute("number", "0xff"));
});
test("color conversion validates ranges and round trips primaries", () => {
  assert.equal(colorConvert("#f00").color, "#ff0000");
  assert.match(colorConvert("#ff0000").text, /hsl\(0, 100%, 50%\)/);
  assert.equal(colorConvert("hsl(240, 100%, 50%)").color, "#0000ff");
  for (const s of ["red", "#abcd", "rgb(256,0,0)", "hsl(361,0%,0%)", "url(x)"])
    assert.throws(() => colorConvert(s));
});
test("smart detection is advisory, bounded and cautious", () => {
  assert.deepEqual(detect("hello world"), []);
  assert.deepEqual(detect("alphabet"), []);
  assert(detect('{"a":1}').some((s) => s.tool === "json"));
  assert(!detect('{"a":1,"a":2}').some((s) => s.tool === "json"));
  assert.equal(
    detect("1767225600").filter((s) => s.tool === "timestamp").length,
    2,
  );
  assert(detect("#123").some((s) => s.tool === "color"));
  assert.deepEqual(detect("x".repeat(32769)), []);
});
test("demo recipe executes real ordered transformations", async () => {
  const run = await runRecipe(demoRecipe, demoInput);
  assert.equal(run.results.length, 3);
  assert.equal(
    run.final?.text,
    '{\n  "message": "Hello, Toolsmith!",\n  "local": true\n}',
  );
});
test("recipe failure stops at the step and has no final result", async () => {
  const bad = await runRecipe(demoRecipe, "%GG");
  assert.equal(bad.failedIndex, 0);
  assert.equal(bad.results.length, 0);
  assert.equal(bad.final, undefined);
  const swapped = structuredClone(demoRecipe);
  [swapped.steps[0], swapped.steps[1]] = [swapped.steps[1], swapped.steps[0]];
  assert.equal((await runRecipe(swapped, demoInput)).failedIndex, 0);
  const disabled = structuredClone(demoRecipe);
  disabled.steps[0].enabled = false;
  assert.equal(
    (await runRecipe(disabled, decodeURIComponent(demoInput))).results.length,
    2,
  );
});
test("recipe types never implicitly reinterpret binary as text", async () => {
  assert.equal(compatible("hex", "json", {}), false);
  const recipe = validateRecipe({
    version: 1,
    name: "bytes",
    steps: [
      {
        tool: "base64",
        enabled: true,
        options: { action: "decode", output: "hexadecimal bytes" },
      },
      { tool: "json", enabled: true, options: {} },
    ],
  });
  const run = await runRecipe(recipe, "e30=");
  assert.equal(run.failedIndex, 1);
  assert.match(run.error!, /incompatible/);
});
test("recipe schema rejects unsupported, excessive and hidden fields", () => {
  for (const patch of [
    { version: 2 },
    { payload: "secret" },
    { steps: new Array(13).fill(demoRecipe.steps[0]) },
    { steps: [{ tool: "uuid", enabled: true, options: {} }] },
    {
      steps: [{ tool: "json", enabled: true, options: { script: "eval(1)" } }],
    },
  ])
    assert.throws(() => validateRecipe({ ...demoRecipe, ...patch }));
  assert.throws(() => importRecipe("x".repeat(LIMITS.recipeBytes + 1)));
  assert.throws(() => importRecipe('{"version":1,"version":1}'));
  assert.deepEqual(
    importRecipe(exportRecipe(demoRecipe)),
    validateRecipe(demoRecipe),
  );
});
test("preferences persist only safe identifiers and recipe definitions", () => {
  const saved = preferences({
    selected: "json",
    favorites: ["json", "bogus"],
    input: "SECRET_PAYLOAD",
    output: "SECRET_TOKEN",
    history: ["SECRET_PASSWORD"],
    recipes: [demoRecipe, { ...demoRecipe, output: "SECRET" }],
  });
  assert.deepEqual(Object.keys(saved).sort(), [
    "favorites",
    "recipes",
    "selected",
  ]);
  assert(!JSON.stringify(saved).includes("SECRET"));
  assert.equal(saved.recipes.length, 1);
});
test("workspace drops late hash results and clears failed runs", async () => {
  const model = new WorkspaceModel("hash");
  model.input("abc");
  const pending = model.run();
  model.input("new input");
  await pending;
  assert.equal(model.get().result, undefined);
  model.select("json");
  model.input("{}");
  await model.run();
  assert(model.get().result);
  model.input("bad");
  await model.run();
  assert.equal(model.get().result, undefined);
  assert(model.get().error);
  model.input("SECRET");
  model.selectOutput("SECRET");
  model.destroy();
  assert.equal(model.get().input, "");
  assert.equal(model.get().selection, "");
});
test("close invalidates pending recipe results", async () => {
  const model = new WorkspaceModel();
  model.input(demoInput);
  const pending = model.recipe(demoRecipe);
  model.destroy();
  await pending;
  assert.equal(model.get().recipeRun, undefined);
});
test("handoff inserts only reviewed text, once, and rejects stale targets", () => {
  const h = new Handoff(),
    inserted: string[] = [];
  let live = true;
  h.begin(
    (s) => inserted.push(s),
    () => live,
  );
  assert(h.commit("REVIEWED"));
  assert.equal(h.commit("again"), false);
  assert.deepEqual(inserted, ["REVIEWED"]);
  h.begin(
    (s) => inserted.push(s),
    () => live,
  );
  live = false;
  assert.equal(h.commit("SECRET"), false);
  assert.deepEqual(inserted, ["REVIEWED"]);
});
test("all nineteen tools have working default examples or comparison inputs", async () => {
  assert.equal(tools.length, 19);
  for (const tool of tools) {
    const output = await execute(
      tool.id,
      tool.example,
      defaults(tool),
      tool.example,
    );
    assert.equal(typeof output.text, "string", tool.id);
  }
});
test("global input limit rejects before executing", async () => {
  await assert.rejects(
    execute("base64", "x".repeat(LIMITS.input + 1)),
    /Input exceeds/,
  );
});
