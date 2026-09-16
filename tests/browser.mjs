import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { resolve } from "node:path";

await mkdir("test-results", { recursive: true });
await build({
  entryPoints: ["tests/host.tsx"],
  outfile: "test-results/host.js",
  bundle: true,
  format: "esm",
  jsx: "automatic",
  external: ["/plugin.js"],
  define: { "process.env.NODE_ENV": '"development"' },
});
const hostSource = await readFile("test-results/host.js");
const artifact = await readFile("desktop/plugin.js");
const wrapper = `import { ReactExports as R } from '/host.js';export default R;export const {useEffect,useState,useRef,useSyncExternalStore,useId}=R;`;
const jsxWrapper = `import { jsxExports as R } from '/host.js';export const {jsx,jsxs,Fragment}=R;`;
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Toolsmith built-artifact fixture</title><style>
html,body,#root{margin:0;height:100%;font:13px/1.5 system-ui}.mock-host{--ui-bg-primary:#191b1f;--ui-bg-secondary:#24272c;--ui-text-primary:#eceef1;--ui-text-secondary:#aeb6c1;--ui-stroke-primary:#424851;--color-primary:#98bafb;height:100%;display:flex;flex-direction:column;color:var(--ui-text-primary);background:var(--ui-bg-primary);color-scheme:dark}.mock-host.light{--ui-bg-primary:#fff;--ui-bg-secondary:#f0f2f5;--ui-text-primary:#24272c;--ui-text-secondary:#56616d;--ui-stroke-primary:#c4cbd4;--color-primary:#365f9c;color-scheme:light}.mock-header{display:flex;gap:12px;align-items:center;border-bottom:1px solid var(--ui-stroke-primary);padding:8px 12px;flex-wrap:wrap}.mock-header span{flex:1;font-size:11px;color:var(--ui-text-secondary)}button{font:inherit;background:var(--ui-bg-secondary);color:var(--ui-text-primary);border:1px solid var(--ui-stroke-primary);border-radius:3px;padding:4px 9px}button[data-variant=default]{background:var(--color-primary);color:var(--ui-bg-primary);border-color:var(--color-primary)}.mock-workspace{flex:1;min-height:0}.mock-status{padding:4px 10px;border-top:1px solid var(--ui-stroke-primary)}.mock-overlay{position:fixed;inset:0;background:#0008;display:grid;place-items:center;z-index:10}.mock-dialog{width:min(600px,90vw);padding:22px;background:var(--ui-bg-primary);border:1px solid var(--ui-stroke-primary);border-radius:8px;max-height:90vh;overflow:auto}.mock-dialog h2{margin:0;font-size:18px}
.mock-host{--ui-bg-editor:var(--ui-bg-primary);--ui-bg-sidebar:var(--ui-bg-primary);--ui-row-hover-background:var(--ui-bg-secondary);--ui-stroke-secondary:var(--ui-stroke-primary);--ring:var(--color-primary)}
.mock-host input:not([type=checkbox]),.mock-host textarea,.mock-host [data-slot=select-trigger]{background:var(--ui-bg-secondary);color:var(--ui-text-primary);border:1px solid var(--ui-stroke-primary);border-radius:3px;padding:6px 10px;font:12px/1.5 system-ui}.mock-select-content{z-index:20;background:var(--ui-bg-secondary);color:var(--ui-text-primary);border:1px solid var(--ui-stroke-primary);border-radius:4px;min-width:var(--radix-select-trigger-width);padding:4px}.mock-select-item{padding:5px 10px;font-size:12px;outline:none}.mock-select-item[data-highlighted]{background:var(--color-primary);color:var(--ui-bg-primary)}
</style><script type="importmap">{"imports":{"@hermes/plugin-sdk":"/host.js","react":"/react.js","react/jsx-runtime":"/jsx.js"}}</script></head><body><div id="root"></div><script type="module">import { start } from '/host.js'; await start();</script></body></html>`;
const server = createServer((req, res) => {
  const resources = {
    "/": [html, "text/html"],
    "/host.js": [hostSource, "text/javascript"],
    "/plugin.js": [artifact, "text/javascript"],
    "/react.js": [wrapper, "text/javascript"],
    "/jsx.js": [jsxWrapper, "text/javascript"],
  };
  const entry = resources[req.url];
  res.writeHead(entry ? 200 : 404, {
    "Content-Type": entry?.[1] ?? "text/plain",
  });
  res.end(entry?.[0] ?? "not found");
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = server.address().port;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const pageErrors = [],
  network = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("request", (req) => {
  if (!req.url().startsWith(`http://127.0.0.1:${port}/`))
    network.push(req.url());
});
let checks = 0;
const check = (condition, label) => {
  assert(condition, label);
  checks++;
  console.log(`PASS ${label}`);
};
const value = () =>
  page.getByLabel("Output text", { exact: true }).inputValue();
const input = () => page.getByLabel("Input", { exact: true });
const selectTool = async (name) => {
  await page.getByRole("button", { name, exact: true }).first().click();
};
const run = async () => {
  await page.getByRole("button", { name: "Run tool", exact: true }).click();
  await page.getByLabel("Output text", { exact: true }).waitFor();
};
try {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByRole("button", { name: "Sidebar: Toolsmith" }).click();
  await input().waitFor();
  check(
    await page.evaluate(() => window.fixture.workspaceOpens === 0),
    "sidebar renders toolbox directly without opening a second surface",
  );
  check(
    (await page
      .getByRole("button", { name: "Open Toolsmith workspace", exact: true })
      .count()) === 0,
    "no intermediate launcher button",
  );
  const darkEditor = await input().evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  check(
    (await page.locator(".hermes-toolsmith").count()) === 1,
    "native sidebar contribution opens one Toolsmith workspace",
  );
  await input().fill('{"hello":"שלום 👋","n":9007199254740993}');
  await run();
  check(
    (await value()).includes("9007199254740993"),
    "built artifact preserves JSON integer",
  );
  await selectTool("Base64 / Base64URL");
  check(
    (await input().inputValue()).includes("שלום"),
    "switching tool preserves input",
  );
  await input().fill("שלום 👋");
  await run();
  check(
    (await value()) === "16nXnNeV150g8J+Riw==",
    "UTF-8 encoding in browser",
  );
  await page.getByRole("button", { name: "Use output as input" }).click();
  await page
    .getByRole("combobox", { name: "Operation", exact: true })
    .first()
    .click();
  await page.screenshot({
    path: "test-results/native-dropdown.png",
    fullPage: true,
  });
  await page.getByRole("option", { name: "decode", exact: true }).click();
  check(
    (await page.locator(".hermes-toolsmith select").count()) === 0,
    "all dropdowns use SDK Select rather than browser selects",
  );
  await run();
  check((await value()) === "שלום 👋", "explicit output reuse and decode");
  await page.getByRole("button", { name: "Copy output", exact: true }).click();
  check(
    await page.evaluate(() => window.fixture.clipboard === "שלום 👋"),
    "explicit clipboard write",
  );
  await selectTool("JSON format / validate");
  await input().fill('{"broken":}');
  await page.getByRole("button", { name: "Run tool", exact: true }).click();
  await page.getByRole("alert").waitFor();
  check(
    (await page.getByLabel("Output text", { exact: true }).count()) === 0,
    "failure removes prior successful output",
  );
  await page.getByRole("button", { name: "Recipe", exact: true }).click();
  check(
    await page
      .locator("#toolsmith-recipe")
      .evaluate(
        (el) =>
          document.activeElement === el &&
          el.getBoundingClientRect().top >= 0 &&
          el.getBoundingClientRect().top < innerHeight,
      ),
    "Recipe toggle reveals and focuses its panel",
  );
  await page.screenshot({
    path: "test-results/recipe-open.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Load demo and example input" })
    .click();
  await page.getByRole("button", { name: "Run recipe" }).click();
  await page.getByLabel("Output text", { exact: true }).waitFor();
  check(
    (await value()).includes("Hello, Toolsmith!"),
    "demonstration uses production recipe engine",
  );
  check(
    (await page
      .getByRole("heading", { name: "Recipe result", exact: true })
      .count()) === 1,
    "recipe output has explicit provenance",
  );
  check(
    (await page.locator(".ts-intermediates details").count()) === 3,
    "all intermediate results inspectable",
  );
  await page.getByRole("button", { name: "Save definition" }).click();
  check(
    !JSON.stringify(
      await page.evaluate(() => window.fixture.persisted),
    ).includes("Hello, Toolsmith!"),
    "saved recipe does not contain output",
  );
  await page.locator(".ts-main").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({
    path: "test-results/workspace-dark.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Select entire output for chat" })
    .click();
  await page.getByRole("button", { name: "Attach Toolsmith" }).click();
  await page.getByRole("dialog").waitFor();
  check(
    (await page.getByLabel("Text to insert", { exact: true }).inputValue()) ===
      (await value()),
    "handoff shows only selected output",
  );
  await page
    .getByLabel("Text to insert", { exact: true })
    .fill("Only this reviewed text");
  await page.screenshot({ path: "test-results/handoff.png", fullPage: true });
  await page.getByRole("button", { name: "Insert into draft" }).click();
  check(
    JSON.stringify(await page.evaluate(() => window.fixture.inserted)) ===
      '["Only this reviewed text"]',
    "only edited review is inserted once",
  );
  check(
    await page.evaluate(() => window.fixture.sends === 0),
    "no message send",
  );
  await page.getByLabel("Output text", { exact: true }).evaluate((el) => {
    const start = el.value.indexOf("Hello, Toolsmith!");
    el.focus();
    el.setSelectionRange(start, start + "Hello, Toolsmith!".length);
  });
  await page
    .getByRole("button", {
      name: "Select highlighted text for chat",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Attach Toolsmith" }).click();
  check(
    (await page.getByLabel("Text to insert", { exact: true }).inputValue()) ===
      "Hello, Toolsmith!",
    "highlighted substring alone reaches handoff",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Select entire output for chat" })
    .click();
  await page.getByRole("button", { name: "Attach Toolsmith" }).click();
  await page.evaluate(() => window.fixture.state.profile.set("other"));
  await page.getByRole("dialog").waitFor({ state: "detached" });
  check(
    await page.evaluate(() => window.fixture.atomListeners() === 0),
    "profile switch discards insertion callback and listeners",
  );
  const retainedOutput = await value();
  await page.evaluate(() => window.fixture.navigate("/skills"));
  await page
    .getByLabel("Output text", { exact: true })
    .waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Palette: Toolsmith" }).click();
  check(
    (await value()) === retainedOutput,
    "navigation preserves the active recipe and result",
  );
  check(
    (await page.locator(".ts-intermediates details").count()) === 3,
    "returning to Toolsmith restores recipe steps without a render error",
  );
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  check((await input().inputValue()) === "", "clear empties original input");
  check(
    (await page.locator(".ts-intermediates details").count()) === 0,
    "clear discards intermediate results",
  );
  await selectTool("JSON tree");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await run();
  check(
    (await page.locator(".ts-tree-row").count()) === 1,
    "tree initially renders just root",
  );
  await page.getByRole("button", { name: "Expand root", exact: true }).click();
  check(
    (await page.locator(".ts-tree-row").count()) === 4,
    "tree expands lazily",
  );
  await page.getByRole("button", { name: "Toggle theme" }).click();
  check(
    (await input().evaluate((el) => getComputedStyle(el).backgroundColor)) !==
      darkEditor,
    "editor inherits live host theme changes",
  );
  await page.locator(".ts-main").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({
    path: "test-results/workspace-light.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 420, height: 900 });
  await page.locator(".ts-main").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({
    path: "test-results/workspace-narrow.png",
    fullPage: true,
  });
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "narrow fixture has no page overflow",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Palette: Toolsmith" }).click();
  check(
    (await input().inputValue()) === "",
    "closing and reopening clears payload",
  );
  await page.evaluate(() => window.fixture.disable());
  check(
    await page.evaluate(
      () =>
        window.fixture.count() === 0 && window.fixture.atomListeners() === 0,
    ),
    "disable removes every contribution and listener",
  );
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.fixture.enable());
    await page.getByRole("button", { name: "Palette: Toolsmith" }).click();
    await page.evaluate(() => window.fixture.disable());
  }
  check(
    await page.evaluate(() => window.fixture.count() === 0),
    "repeated enable and hot-reload equivalent cycles do not duplicate UI",
  );
  await page.evaluate(() => {
    window.fixture.fallback();
    window.fixture.enable();
  });
  await page.getByRole("button", { name: "Palette: Toolsmith" }).click();
  check(
    (await input().inputValue()) === "",
    "direct page works without workspace-tab API",
  );
  await page.evaluate(() => window.fixture.disable());
  check(network.length === 0, "no external network requests");
  check(pageErrors.length === 0, `no browser errors: ${pageErrors.join("; ")}`);
  await writeFile(
    "test-results/browser-report.json",
    JSON.stringify(
      {
        checks,
        network,
        pageErrors,
        artifactBytes: artifact.length,
        scope:
          "Built plugin ESM in Chromium with mock SDK components; not a native Hermes smoke test.",
      },
      null,
      2,
    ),
  );
  console.log(
    `${checks} browser checks passed. Screenshots in test-results. Native Hermes remains unverified.`,
  );
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
