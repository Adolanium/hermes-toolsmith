import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertLoaderCompatible,
  rewriteHostImports,
} from "../scripts/loader-contract.mjs";
import { escapeRegexBackticks } from "../scripts/escape-regex-backticks.mjs";

const broken =
  'const re = /[\\t\\n\\f!-,./:-@[-`{-}\\u0080-\\uFFFF]/g;\nimport React from "react";\nconst tail = `text`;';
const map = {
  react: "/react.js",
  "@hermes/plugin-sdk": "/sdk.js",
  "react/jsx-runtime": "/jsx.js",
};

test("regex escaping preserves existing escapes and leaves other tokens alone", () => {
  const source =
    'const a = /`/; const b = /\\`/; const c = /\\\\`/; const text = "`"; const template = `text`; // `';
  assert.equal(
    escapeRegexBackticks(source),
    'const a = /\\x60/; const b = /\\x60/; const c = /\\\\\\x60/; const text = "`"; const template = `text`; // `',
  );
});

test("current host ignores import-like strings and comments", () => {
  const source =
    'select("from", "From base"); // import "unknown"\nconst example = `import "react"`;';
  assert.doesNotThrow(() => assertLoaderCompatible(source));
  assert.equal(rewriteHostImports(source, map), source);
});

test("host rewrites static, side-effect, dynamic and template-expression imports", () => {
  const source =
    'import React from "react"; import "@hermes/plugin-sdk"; const load = import("react/jsx-runtime"); const text = `value ${import("react")}`;';
  assert.doesNotThrow(() => assertLoaderCompatible(source));
  assert.equal(
    rewriteHostImports(source, map),
    'import React from "/react.js"; import "/sdk.js"; const load = import("/jsx.js"); const text = `value ${import("/react.js")}`;',
  );
});

test("host rejects unsupported bare, relative and URL imports", () => {
  for (const spec of ["other", "./chunk.js", "https://example.com/plugin.js"]) {
    assert.throws(
      () => assertLoaderCompatible(`import "${spec}";`),
      /runtime loader rejects/,
    );
  }
});

test("contract catches the real import hidden by the entities regex", () => {
  assert.equal(rewriteHostImports(broken, map), broken);
  assert.throws(
    () => assertLoaderCompatible(broken),
    /misses real import: react/,
  );
  const fixed = escapeRegexBackticks(broken);
  assert.doesNotThrow(() => assertLoaderCompatible(fixed));
  assert.ok(rewriteHostImports(fixed, map).includes('from "/react.js"'));
  assert.ok(fixed.includes("const tail = `text`"));
  assert.equal(escapeRegexBackticks(fixed), fixed);
});

test("escaping the actual entities regex preserves all BMP code units", async () => {
  const source = await readFile(
    "node_modules/entities/dist/esm/encode.js",
    "utf8",
  );
  const literal = source.match(/const htmlReplacer = (.+);/)[1];
  const escaped = escapeRegexBackticks(`const re = ${literal};`).match(
    /const re = (.+);/,
  )[1];
  assert.ok(escaped.includes("\\x60"));
  const original = new RegExp(literal.slice(1, literal.lastIndexOf("/")));
  const replacement = new RegExp(escaped.slice(1, escaped.lastIndexOf("/")));
  for (let code = 0; code <= 0xffff; code++) {
    const char = String.fromCharCode(code);
    assert.equal(
      replacement.test(char),
      original.test(char),
      `BMP code unit ${code}`,
    );
  }
});
