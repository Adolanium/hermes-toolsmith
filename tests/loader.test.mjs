import test from "node:test";
import assert from "node:assert/strict";
import { assertLoaderCompatible } from "../scripts/loader-contract.mjs";

test("host scanner reproduces comma import from an ordinary option key", () => {
  assert.throws(
    () => assertLoaderCompatible('select("from", "From base")'),
    /runtime loader rejects/,
  );
});
test("renamed option and supported SDK imports pass the host scanner", () => {
  assert.doesNotThrow(() =>
    assertLoaderCompatible(
      'import { host } from "@hermes/plugin-sdk"; import { jsx } from "react/jsx-runtime"; select("fromBase", "From base");',
    ),
  );
});
