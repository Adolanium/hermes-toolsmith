import { execute, toolMap } from "./registry";
import { parseJson } from "./json";
import {
  DataType,
  defaults,
  demand,
  LIMITS,
  Options,
  Result,
  safeError,
  validateOptions,
} from "./types";
export interface Step {
  tool: string;
  options: Options;
  enabled: boolean;
}
export interface Recipe {
  version: 1;
  name: string;
  steps: Step[];
}
export interface RecipeRun {
  name?: string;
  results: { index: number; result: Result }[];
  error?: string;
  failedIndex?: number;
  final?: Result;
}
export const demoRecipe: Recipe = {
  version: 1,
  name: "Decode a JSON envelope",
  steps: [
    {
      tool: "url-codec",
      options: { action: "decode", mode: "component" },
      enabled: true,
    },
    {
      tool: "base64",
      options: {
        action: "decode",
        variant: "standard",
        output: "UTF-8 text",
        bytes: "UTF-8 text",
      },
      enabled: true,
    },
    { tool: "json", options: { action: "format", indent: "2" }, enabled: true },
  ],
};
export const demoInput =
  "eyJtZXNzYWdlIjoiSGVsbG8sIFRvb2xzbWl0aCEiLCJsb2NhbCI6dHJ1ZX0%3D";
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  demand(
    Object.keys(value).every((k) => keys.includes(k)),
    "Recipe contains unsupported fields. Payloads and code cannot be saved.",
  );
}
export function validateRecipe(value: unknown): Recipe {
  demand(
    !!value && typeof value === "object" && !Array.isArray(value),
    "Recipe must be an object.",
  );
  const raw = value as Record<string, unknown>;
  exactKeys(raw, ["version", "name", "steps"]);
  demand(raw.version === 1, "Unsupported recipe schema version.");
  demand(
    typeof raw.name === "string" &&
      raw.name.trim().length > 0 &&
      raw.name.length <= 80,
    "Recipe name must contain 1 to 80 characters.",
  );
  demand(
    Array.isArray(raw.steps) &&
      raw.steps.length > 0 &&
      raw.steps.length <= LIMITS.steps,
    `Recipe must have 1 to ${LIMITS.steps} steps.`,
  );
  const steps = raw.steps.map((item: unknown): Step => {
    demand(
      !!item && typeof item === "object" && !Array.isArray(item),
      "Invalid recipe step.",
    );
    const step = item as Record<string, unknown>;
    exactKeys(step, ["tool", "options", "enabled"]);
    demand(
      typeof step.tool === "string" && typeof step.enabled === "boolean",
      "Step requires a tool identifier and an enabled flag.",
    );
    const tool = toolMap.get(step.tool);
    demand(tool?.recipe, "Unknown or non-chainable recipe operation.");
    const options = validateOptions(tool, step.options);
    demand(
      tool.outputType(options) !== "report",
      "Reports cannot be recipe steps. Choose a transformation operation.",
    );
    return { tool: tool.id, options, enabled: step.enabled };
  });
  return { version: 1, name: raw.name.trim(), steps };
}
export function importRecipe(source: string): Recipe {
  demand(
    source.length <= LIMITS.recipeBytes,
    "Recipe import exceeds 32,768 characters.",
  );
  parseJson(source);
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    demand(false, "Recipe is not valid JSON.");
  }
  return validateRecipe(raw);
}
export function stepDefaults(type: DataType, toolId: string): Options {
  const options = defaults(toolMap.get(toolId)!);
  if (type === "hex") {
    if (toolId === "hex") options.action = "decode";
    if (toolId === "base64") {
      options.action = "encode";
      options.bytes = "hexadecimal bytes";
    }
    if (toolId === "hash") options.encoding = "hexadecimal bytes";
  }
  return options;
}
export function exportRecipe(recipe: Recipe): string {
  return JSON.stringify(validateRecipe(recipe), null, 2);
}
export function compatible(
  type: DataType,
  toolId: string,
  options: Options,
): boolean {
  if (type === "text") return true;
  // Hex is a byte representation, never implicitly treated as ordinary text.
  return (
    type === "hex" &&
    ((toolId === "hex" && options.action === "decode") ||
      (toolId === "base64" &&
        options.action === "encode" &&
        options.bytes === "hexadecimal bytes") ||
      (toolId === "hash" && options.encoding === "hexadecimal bytes"))
  );
}
export async function runRecipe(
  recipe: Recipe,
  input: string,
  current = () => true,
): Promise<RecipeRun> {
  const checked = validateRecipe(recipe),
    run: RecipeRun = { results: [], name: checked.name };
  let value = input,
    type: DataType = "text";
  for (let index = 0; index < checked.steps.length; index++) {
    if (!current()) return { results: [] };
    const step = checked.steps[index];
    if (!step.enabled) continue;
    try {
      demand(
        compatible(type, step.tool, step.options),
        `Input type ${type} is incompatible with this operation. Select an explicit byte decoder.`,
      );
      const next = await execute(step.tool, value, step.options);
      if (!current()) return { results: [] };
      run.results.push({ index, result: next });
      value = next.text;
      type = next.type;
    } catch (error) {
      run.error = safeError(error);
      run.failedIndex = index;
      return run;
    }
  }
  run.final = run.results.at(-1)?.result;
  if (!run.final) run.error = "Enable at least one step to run the recipe.";
  return run;
}
