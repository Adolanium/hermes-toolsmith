import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Codicon } from "@hermes/plugin-sdk";
import { detect, Suggestion } from "../core/detection";
import { Json } from "../core/json";
import { toolMap, tools } from "../core/registry";
import { Preferences, WorkspaceModel } from "../core/state";
import { LIMITS, decodeText, safeError } from "../core/types";
import { Action, Input, OptionsEditor, Textarea } from "./controls";
import { Recipes } from "./Recipes";
import { Tree } from "./Tree";
import styles from "./style.css";

export function Workspace({
  model,
  getPreferences,
  persist,
  clipboard,
  close,
}: {
  model: WorkspaceModel;
  getPreferences(): Preferences;
  persist(value: Preferences): void;
  clipboard(text: string): Promise<boolean>;
  close(): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.get),
    tool = toolMap.get(state.selected)!;
  const [prefs, setPrefs] = useState(getPreferences),
    [search, setSearch] = useState(""),
    [suggestions, setSuggestions] = useState<Suggestion[]>([]),
    [recipeOpen, setRecipeOpen] = useState(false),
    [clearEpoch, setClearEpoch] = useState(0),
    [message, setMessage] = useState("");
  const output = useRef<HTMLTextAreaElement>(null),
    file = useRef<HTMLInputElement>(null),
    recipeRegion = useRef<HTMLDivElement>(null),
    alive = useRef(true),
    fileTicket = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      fileTicket.current++;
    };
  }, []);
  useEffect(() => {
    setSuggestions([]);
    const timer = setTimeout(() => setSuggestions(detect(state.input)), 300);
    return () => clearTimeout(timer);
  }, [state.input]);
  useEffect(() => {
    setMessage("");
  }, [
    state.input,
    state.secondary,
    state.options,
    state.selected,
    state.result,
  ]);
  useEffect(() => {
    if (recipeOpen) {
      recipeRegion.current?.scrollIntoView({ block: "start" });
      recipeRegion.current?.focus({ preventScroll: true });
    }
  }, [recipeOpen]);
  const write = (next: Preferences) => {
    try {
      persist(next);
      setPrefs(next);
    } catch {
      setMessage("Preferences could not be saved by the host.");
    }
  };
  const select = (id: string, options = {}) => {
    model.select(id, options);
    write({ ...prefs, selected: id });
  };
  const copy = async (text: string) => {
    try {
      const ok = await clipboard(text);
      if (alive.current)
        setMessage(
          ok
            ? "Copied."
            : "Clipboard unavailable. Select the output and copy it manually.",
        );
    } catch {
      if (alive.current)
        setMessage(
          "Clipboard unavailable. Select and copy the output manually.",
        );
    }
  };
  const filtered = tools.filter((t) =>
    `${t.name} ${t.terms} ${t.category}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const favoriteTools = filtered.filter((t) => prefs.favorites.includes(t.id));
  const groups = [...new Set(filtered.map((t) => t.category))];
  const toolRow = (id: string) => {
    const t = toolMap.get(id)!,
      favorite = prefs.favorites.includes(id);
    return (
      <div className="ts-tool-row" key={id}>
        <button
          type="button"
          aria-current={state.selected === id ? "true" : undefined}
          onClick={() => select(id)}
        >
          {t.name}
        </button>
        <button
          className="ts-favorite"
          type="button"
          aria-pressed={favorite}
          aria-label={`${favorite ? "Unfavorite" : "Favorite"} ${t.name}`}
          title={favorite ? "Remove favorite" : "Add favorite"}
          onClick={() =>
            write({
              ...prefs,
              favorites: favorite
                ? prefs.favorites.filter((v) => v !== id)
                : [...prefs.favorites, id],
            })
          }
        >
          <Codicon name={favorite ? "star-full" : "star-empty"} size="14px" />
        </button>
      </div>
    );
  };
  const loadFile = async (selected: File) => {
    const ticket = ++fileTicket.current,
      before = model.get();
    try {
      if (selected.size > LIMITS.input) {
        setMessage(`Text files are limited to ${LIMITS.input} bytes.`);
        return;
      }
      const text = decodeText(new Uint8Array(await selected.arrayBuffer()));
      if (
        alive.current &&
        ticket === fileTicket.current &&
        model.get() === before
      ) {
        model.input(text);
        setMessage(
          "Imported as strict UTF-8. Original line endings are preserved.",
        );
      }
    } catch (e) {
      if (alive.current && ticket === fileTicket.current)
        setMessage(safeError(e));
    }
  };
  return (
    <div
      className="hermes-toolsmith"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          void model.run();
        }
      }}
    >
      <style>{styles}</style>
      <header className="ts-header">
        <div>
          <strong>Hermes Toolsmith</strong>
          <span>Everyday developer tools. Right inside Hermes.</span>
        </div>
        <div className="ts-actions">
          <Action
            aria-expanded={recipeOpen}
            aria-controls="toolsmith-recipe"
            onClick={() => setRecipeOpen(!recipeOpen)}
          >
            Recipe
          </Action>
          <Action
            onClick={() => {
              model.clear();
              setMessage("");
              setClearEpoch((v) => v + 1);
              fileTicket.current++;
            }}
          >
            Clear
          </Action>
          <Action onClick={close}>Close</Action>
        </div>
      </header>
      <div className="ts-layout">
        <aside className="ts-sidebar" aria-label="Tool list">
          <label className="ts-search">
            Find a tool
            <Input
              type="search"
              placeholder="Search tools…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <nav aria-label="Tools">
            {favoriteTools.length > 0 && (
              <section>
                <h2>Favorites</h2>
                {favoriteTools.map((t) => toolRow(t.id))}
              </section>
            )}
            {groups.map((category) => (
              <section key={category}>
                <h2>{category}</h2>
                {filtered
                  .filter((t) => t.category === category)
                  .map((t) => toolRow(t.id))}
              </section>
            ))}
            {!filtered.length && <p>No tools match that search.</p>}
          </nav>
        </aside>
        <main className="ts-main">
          <section aria-label="Current tool">
            <div className="ts-heading">
              <h1>{tool.name}</h1>
              <span>Local processing</span>
            </div>
            <p className="ts-description">{tool.description}</p>
            <OptionsEditor
              tool={tool}
              value={state.options}
              change={(value) => model.options(value)}
            />
            <div className="ts-editors">
              <div className="ts-editor">
                <div className="ts-heading">
                  <label htmlFor="toolsmith-input">
                    Input{tool.generator ? " (unused by this generator)" : ""}
                  </label>
                  <span>
                    {state.input.length.toLocaleString()} /{" "}
                    {LIMITS.input.toLocaleString()}
                  </span>
                </div>
                <Textarea
                  id="toolsmith-input"
                  dir="auto"
                  value={state.input}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={
                    tool.generator
                      ? "Your existing input is preserved."
                      : "Paste text here. Your input stays unchanged until you replace it."
                  }
                  onChange={(e) => model.input(e.target.value)}
                />
                <div className="ts-actions">
                  <Action
                    disabled={tool.generator}
                    onClick={() => model.input(tool.example)}
                  >
                    Load example
                  </Action>
                  <Action onClick={() => file.current?.click()}>
                    Import text file
                  </Action>
                  {tool.comparison && (
                    <Action
                      onClick={() => {
                        const first = state.input;
                        model.input(state.secondary);
                        model.input(first, true);
                      }}
                    >
                      Swap inputs
                    </Action>
                  )}
                  <input
                    ref={file}
                    className="ts-file"
                    type="file"
                    aria-label="Import local UTF-8 text file"
                    accept="text/*,.json,.csv,.txt,.log"
                    onChange={(e) => {
                      const picked = e.target.files?.[0];
                      e.target.value = "";
                      if (picked) void loadFile(picked);
                    }}
                  />
                </div>
              </div>
              {tool.comparison && (
                <div className="ts-editor">
                  <label htmlFor="toolsmith-secondary">Comparison input</label>
                  <Textarea
                    id="toolsmith-secondary"
                    dir="auto"
                    value={state.secondary}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => model.input(e.target.value, true)}
                  />
                </div>
              )}
            </div>
            {suggestions.length > 0 && (
              <div className="ts-suggestions" aria-label="Input suggestions">
                <span>Suggested operations</span>
                {suggestions.map((s) => (
                  <Action
                    key={s.label}
                    onClick={() => select(s.tool, s.options)}
                  >
                    {s.label}
                  </Action>
                ))}
              </div>
            )}
            <div className="ts-run">
              <Action
                variant="default"
                disabled={state.busy}
                onClick={() => void model.run()}
              >
                {state.busy
                  ? "Working…"
                  : tool.generator
                    ? "Generate"
                    : "Run tool"}
              </Action>
              <span>Ctrl / Cmd + Enter in this workspace</span>
            </div>
            {state.error && (
              <p role="alert" className="ts-error">
                {state.error}
              </p>
            )}
            <section className="ts-output" aria-label="Result">
              <div className="ts-heading">
                <h2>{state.recipeRun ? "Recipe result" : "Result"}</h2>
                <span>
                  {state.result
                    ? `${state.result.text.length.toLocaleString()} code units · ${state.result.type}`
                    : "Run a tool or recipe to inspect its output"}
                </span>
              </div>
              {state.recipeRun?.final && (
                <p className="ts-muted">
                  Recipe: {state.recipeRun.name}. Open Recipe to inspect its
                  steps.
                </p>
              )}
              {state.result ? (
                <>
                  {state.result.note && (
                    <p className="ts-muted">{state.result.note}</p>
                  )}
                  {state.result.color && (
                    <div
                      className="ts-swatch"
                      style={{ backgroundColor: state.result.color }}
                      role="img"
                      aria-label={`Color preview ${state.result.color}`}
                    />
                  )}
                  {state.result.tree !== undefined && (
                    <Tree
                      key={state.result.text}
                      value={state.result.tree as Json}
                      copy={(text) => void copy(text)}
                      select={(text) => model.selectOutput(text)}
                    />
                  )}
                  {state.result.diff && (
                    <div className="ts-diff" aria-label="Line diff">
                      {state.result.diff.map((line, index) => (
                        <div key={index} data-kind={line.kind}>
                          <span>
                            {line.kind === "same"
                              ? " "
                              : line.kind === "added"
                                ? "+"
                                : "−"}
                          </span>
                          <code>
                            {line.prefix !== undefined ? (
                              <>
                                {line.text.slice(0, line.prefix)}
                                <mark>
                                  {line.text.slice(
                                    line.prefix,
                                    line.text.length - (line.suffix ?? 0),
                                  )}
                                </mark>
                                {line.suffix
                                  ? line.text.slice(-line.suffix)
                                  : ""}
                              </>
                            ) : (
                              line.text
                            )}
                            <small>
                              {line.text.endsWith("\r\n")
                                ? " [CRLF]"
                                : line.text.endsWith("\n")
                                  ? " [LF]"
                                  : line.text.endsWith("\r")
                                    ? " [CR]"
                                    : " [no EOL]"}
                            </small>
                          </code>
                        </div>
                      ))}
                    </div>
                  )}
                  <label className="ts-field">
                    Output text
                    <Textarea
                      ref={output}
                      dir="auto"
                      value={state.result.text}
                      readOnly
                      spellCheck={false}
                      aria-label="Output text"
                    />
                  </label>
                  <div className="ts-actions">
                    <Action onClick={() => void copy(state.result!.text)}>
                      Copy output
                    </Action>
                    <Action onClick={() => model.input(state.result!.text)}>
                      Use output as input
                    </Action>
                    <Action
                      onClick={() => {
                        const editor = output.current;
                        if (
                          editor &&
                          editor.selectionStart !== editor.selectionEnd
                        ) {
                          model.selectOutput(
                            state.result!.text.slice(
                              editor.selectionStart,
                              editor.selectionEnd,
                            ),
                          );
                          setMessage(
                            "Selection ready. In the destination chat, open Attach → Toolsmith: insert reviewed output.",
                          );
                        } else
                          setMessage(
                            "Highlight the exact text in Output text, or use Select entire output.",
                          );
                      }}
                    >
                      Select highlighted text for chat
                    </Action>
                    <Action
                      onClick={() => {
                        model.selectOutput(state.result!.text);
                        setMessage(
                          "Output selected. Review it through the destination chat attachment menu.",
                        );
                      }}
                    >
                      Select entire output for chat
                    </Action>
                  </div>
                </>
              ) : (
                <p className="ts-empty">
                  Input is never sent to a model. Results appear here after an
                  explicit run.
                </p>
              )}
            </section>
            {state.selection && (
              <div className="ts-selection">
                <span>
                  {state.selection.length.toLocaleString()} code units selected
                  for chat. Open the destination composer's attachment menu,
                  then choose “Toolsmith: insert reviewed output”.
                </span>
                <Action onClick={() => model.selectOutput("")}>
                  Discard selection
                </Action>
              </div>
            )}
            <p className="ts-status" role="status">
              {message}
            </p>
          </section>
          <div
            id="toolsmith-recipe"
            ref={recipeRegion}
            tabIndex={-1}
            aria-label="Recipe panel"
            hidden={!recipeOpen}
          >
            <Recipes
              key={clearEpoch}
              model={model}
              saved={prefs.recipes}
              save={(recipe) => {
                const index = prefs.recipes.findIndex(
                  (r) => r.name === recipe.name,
                );
                const recipes = [...prefs.recipes];
                if (index >= 0) recipes[index] = recipe;
                else if (recipes.length < LIMITS.recipes) recipes.push(recipe);
                else {
                  setMessage(
                    "Delete a saved recipe before adding another. Limit: 20.",
                  );
                  return;
                }
                write({ ...prefs, recipes });
              }}
              remove={(index) =>
                write({
                  ...prefs,
                  recipes: prefs.recipes.filter((_, i) => i !== index),
                })
              }
              copy={(text) => void copy(text)}
            />
          </div>
          <footer className="ts-footer">
            Processing stays in this renderer. Inputs and results are cleared
            when this workspace closes. Copies and chat drafts follow their
            destination's storage behavior.
          </footer>
        </main>
      </div>
    </div>
  );
}
