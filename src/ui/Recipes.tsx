import { useState } from "react";
import {
  compatible,
  demoInput,
  demoRecipe,
  exportRecipe,
  importRecipe,
  Recipe,
  Step,
  stepDefaults,
  validateRecipe,
} from "../core/recipes";
import { toolMap, tools } from "../core/registry";
import { WorkspaceModel } from "../core/state";
import { DataType, LIMITS, safeError } from "../core/types";
import { Action, Choice, Input, OptionsEditor, Textarea } from "./controls";

export function Recipes({
  model,
  saved,
  save,
  remove,
  copy,
}: {
  model: WorkspaceModel;
  saved: Recipe[];
  save(recipe: Recipe): void;
  remove(index: number): void;
  copy(text: string): void;
}) {
  const [recipe, setRecipe] = useState<Recipe>(
    () =>
      model.get().recipeDefinition ?? {
        version: 1,
        name: "My recipe",
        steps: [],
      },
  );
  const [error, setError] = useState(""),
    [imports, setImports] = useState<string | undefined>();
  const [addTool, setAddTool] = useState("url-codec");
  const change = (next: Recipe) => {
    model.invalidate();
    model.patch({ recipeDefinition: next });
    setError("");
    setRecipe(next);
  };
  const patch = (index: number, step: Step) =>
    change({
      ...recipe,
      steps: recipe.steps.map((s, i) => (i === index ? step : s)),
    });
  const move = (index: number, direction: number) => {
    const steps = [...recipe.steps];
    [steps[index], steps[index + direction]] = [
      steps[index + direction],
      steps[index],
    ];
    change({ ...recipe, steps });
  };
  let endType: DataType = "text";
  for (const step of recipe.steps)
    if (step.enabled)
      endType = toolMap.get(step.tool)!.outputType(step.options);
  const eligible = tools.filter(
    (t) =>
      t.recipe &&
      t.outputType(stepDefaults(endType, t.id)) !== "report" &&
      compatible(endType, t.id, stepDefaults(endType, t.id)),
  );
  const selectedAdd = eligible.some((t) => t.id === addTool)
    ? addTool
    : eligible[0]?.id;
  const attempt = (run: () => void) => {
    try {
      run();
      setError("");
    } catch (e) {
      setError(safeError(e));
    }
  };
  return (
    <section className="ts-recipes" aria-label="Transformation recipe">
      <div className="ts-heading">
        <h2>Recipe</h2>
        <span>Up to {LIMITS.steps} local steps</span>
      </div>
      <p className="ts-muted">
        Each enabled step uses the previous result. Only the definition is
        saved.
      </p>
      <label className="ts-field">
        Recipe name
        <Input
          maxLength={80}
          value={recipe.name}
          onChange={(e) => change({ ...recipe, name: e.target.value })}
        />
      </label>
      <div className="ts-actions">
        <Action
          onClick={() => {
            change(structuredClone(demoRecipe));
            model.input(demoInput);
          }}
        >
          Load demo and example input
        </Action>
        <Action onClick={() => attempt(() => save(validateRecipe(recipe)))}>
          Save definition
        </Action>
        <Action
          onClick={() =>
            attempt(() => {
              copy(exportRecipe(recipe));
            })
          }
        >
          Copy definition
        </Action>
        <Action
          onClick={() => setImports(imports === undefined ? "" : undefined)}
        >
          Import definition
        </Action>
      </div>
      {saved.length > 0 && (
        <div className="ts-saved">
          {saved.map((r, i) => (
            <div key={i}>
              <Action onClick={() => change(structuredClone(r))}>
                Load {r.name}
              </Action>
              <Action
                aria-label={`Delete recipe ${r.name}`}
                onClick={() => remove(i)}
              >
                Delete
              </Action>
            </div>
          ))}
        </div>
      )}
      {imports !== undefined && (
        <div className="ts-import">
          <label>
            Recipe JSON
            <Textarea
              value={imports}
              maxLength={LIMITS.recipeBytes + 1}
              onChange={(e) => setImports(e.target.value)}
              spellCheck={false}
            />
          </label>
          <Action
            onClick={() =>
              attempt(() => {
                change(importRecipe(imports));
                setImports(undefined);
              })
            }
          >
            Validate and load
          </Action>
          <Action onClick={() => setImports(undefined)}>Cancel import</Action>
        </div>
      )}
      <ol className="ts-steps">
        {recipe.steps.map((step, index) => (
          <li key={index}>
            <div className="ts-step-heading">
              <label>
                <input
                  type="checkbox"
                  checked={step.enabled}
                  onChange={(e) =>
                    patch(index, { ...step, enabled: e.target.checked })
                  }
                />
                {index + 1}. {toolMap.get(step.tool)!.name}
              </label>
              <div className="ts-actions">
                <Action
                  disabled={index === 0}
                  aria-label={`Move step ${index + 1} up`}
                  onClick={() => move(index, -1)}
                >
                  Up
                </Action>
                <Action
                  disabled={index === recipe.steps.length - 1}
                  aria-label={`Move step ${index + 1} down`}
                  onClick={() => move(index, 1)}
                >
                  Down
                </Action>
                <Action
                  aria-label={`Remove step ${index + 1}`}
                  onClick={() =>
                    change({
                      ...recipe,
                      steps: recipe.steps.filter((_, i) => i !== index),
                    })
                  }
                >
                  Remove
                </Action>
              </div>
            </div>
            <OptionsEditor
              tool={toolMap.get(step.tool)!}
              value={step.options}
              change={(options) => patch(index, { ...step, options })}
            />
          </li>
        ))}
      </ol>
      <div className="ts-actions">
        <label>
          Add operation
          <Choice
            label="Add operation"
            value={selectedAdd ?? ""}
            change={setAddTool}
            options={eligible.map((t) => ({ value: t.id, label: t.name }))}
          />
        </label>
        <Action
          disabled={!selectedAdd || recipe.steps.length >= LIMITS.steps}
          onClick={() => {
            if (selectedAdd)
              change({
                ...recipe,
                steps: [
                  ...recipe.steps,
                  {
                    tool: selectedAdd,
                    options: stepDefaults(endType, selectedAdd),
                    enabled: true,
                  },
                ],
              });
          }}
        >
          Add step
        </Action>
        <Action
          variant="default"
          disabled={!recipe.steps.length || model.get().busy}
          onClick={() => void model.recipe(recipe)}
        >
          Run recipe
        </Action>
      </div>
      {error && (
        <p role="alert" className="ts-error">
          {error}
        </p>
      )}
      {model.get().recipeRun && (
        <div className="ts-intermediates">
          <h3>Intermediate results</h3>
          {model.get().recipeRun!.results.map(({ index, result }) => (
            <details key={index}>
              <summary>
                Step {index + 1}: {toolMap.get(recipe.steps[index].tool)!.name}{" "}
                · {result.type}
              </summary>
              <pre>{result.text}</pre>
              <div className="ts-actions">
                <Action onClick={() => copy(result.text)}>
                  Copy step output
                </Action>
                <Action onClick={() => model.selectOutput(result.text)}>
                  Select step output for chat
                </Action>
              </div>
            </details>
          ))}
          {model.get().recipeRun!.final && (
            <div className="ts-actions">
              <Action onClick={() => copy(model.get().recipeRun!.final!.text)}>
                Copy final result
              </Action>
              <Action
                onClick={() =>
                  model.selectOutput(model.get().recipeRun!.final!.text)
                }
              >
                Select final result for chat
              </Action>
            </div>
          )}
          {model.get().recipeRun!.error && (
            <p role="alert" className="ts-error">
              {model.get().recipeRun!.failedIndex === undefined
                ? ""
                : `Step ${model.get().recipeRun!.failedIndex! + 1} stopped: `}
              {model.get().recipeRun!.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
