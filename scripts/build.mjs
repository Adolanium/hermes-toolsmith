import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { assertLoaderCompatible } from "./loader-contract.mjs";
await mkdir("desktop", { recursive: true });
await mkdir("dist", { recursive: true });
const license = await readFile("node_modules/entities/LICENSE", "utf8");
const output = await build({
  entryPoints: ["src/plugin.tsx"],
  outfile: "desktop/plugin.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  external: ["@hermes/plugin-sdk", "react", "react/jsx-runtime"],
  loader: { ".css": "text" },
  metafile: true,
  legalComments: "inline",
  banner: {
    js:
      "/* Hermes Toolsmith 1.0.0. Bundled dependency: entities 6.0.1 (BSD-2-Clause).\n" +
      license +
      "\n*/",
  },
});
const artifact = await readFile("desktop/plugin.js", "utf8");
assertLoaderCompatible(artifact);
const imports = output.metafile.outputs["desktop/plugin.js"].imports;
if (
  imports.some(
    (i) =>
      !["@hermes/plugin-sdk", "react", "react/jsx-runtime"].includes(i.path),
  )
)
  throw Error("Unsupported runtime import");
if (Object.keys(output.metafile.outputs).length !== 1)
  throw Error("Build emitted extra chunks or assets");
if (
  /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\s*\(|\beval\s*\(|new Function\s*\(|dangerouslySetInnerHTML|console\.(log|warn|error)|(?:host|ctx)\.(?:request|rest|socket)|sendBeacon|EventSource/.test(
    artifact,
  )
)
  throw Error("Forbidden runtime behavior found");
const sha256 = createHash("sha256").update(artifact).digest("hex");
await writeFile("dist/plugin.js.sha256", `${sha256}  plugin.js\n`);
console.log(
  `Built plugin.js: ${Buffer.byteLength(artifact)} bytes; ${imports.length} host imports; one ESM artifact; SHA-256 ${sha256}`,
);
