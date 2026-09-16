import { execute, toolMap } from "./registry";
import { Recipe, RecipeRun, runRecipe, validateRecipe } from "./recipes";
import { defaults, LIMITS, Options, Result, safeError } from "./types";

export interface Preferences {
  selected: string;
  favorites: string[];
  recipes: Recipe[];
}
export function preferences(value: unknown): Preferences {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const selected =
    typeof raw.selected === "string" && toolMap.has(raw.selected)
      ? raw.selected
      : "json";
  const favorites = Array.isArray(raw.favorites)
    ? [
        ...new Set(
          raw.favorites.filter(
            (v): v is string => typeof v === "string" && toolMap.has(v),
          ),
        ),
      ].slice(0, 19)
    : [];
  const recipes: Recipe[] = [];
  if (Array.isArray(raw.recipes))
    for (const candidate of raw.recipes.slice(0, LIMITS.recipes)) {
      try {
        recipes.push(validateRecipe(candidate));
      } catch {
        /* Ignore unsupported saved definitions, never execute them. */
      }
    }
  return { selected, favorites, recipes };
}
export interface Snapshot {
  input: string;
  secondary: string;
  selected: string;
  options: Options;
  result?: Result;
  recipeRun?: RecipeRun;
  recipeDefinition?: Recipe;
  error?: string;
  busy: boolean;
  selection: string;
}
/** A workspace owns this state. Closing it destroys all payload references. */
export class WorkspaceModel {
  private generation = 0;
  private live = true;
  private listeners = new Set<() => void>();
  private snapshot: Snapshot;
  constructor(selected = "json") {
    this.snapshot = {
      input: "",
      secondary: "",
      selected,
      options: defaults(toolMap.get(selected)!),
      busy: false,
      selection: "",
    };
  }
  get = () => this.snapshot;
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  patch(update: Partial<Snapshot>) {
    if (!this.live) return;
    this.snapshot = { ...this.snapshot, ...update };
    this.listeners.forEach((f) => f());
  }
  invalidate() {
    this.generation++;
    this.patch({
      result: undefined,
      recipeRun: undefined,
      error: undefined,
      busy: false,
      selection: "",
    });
  }
  input(value: string, secondary = false) {
    this.invalidate();
    this.patch(secondary ? { secondary: value } : { input: value });
  }
  select(id: string, overrides: Options = {}) {
    this.invalidate();
    this.patch({
      selected: id,
      options: { ...defaults(toolMap.get(id)!), ...overrides },
    });
  }
  options(options: Options) {
    this.invalidate();
    this.patch({ options });
  }
  clear() {
    this.invalidate();
    this.patch({ input: "", secondary: "", recipeDefinition: undefined });
  }
  selectOutput(text: string) {
    this.patch({ selection: text.slice(0, LIMITS.output) });
  }
  async run() {
    this.invalidate();
    const ticket = this.generation,
      state = this.snapshot;
    this.patch({ busy: true });
    try {
      const output = await execute(
        state.selected,
        state.input,
        state.options,
        state.secondary,
      );
      if (this.live && ticket === this.generation)
        this.patch({ result: output, busy: false });
    } catch (error) {
      if (this.live && ticket === this.generation)
        this.patch({ error: safeError(error), busy: false });
    }
  }
  async recipe(recipe: Recipe) {
    this.invalidate();
    const ticket = this.generation,
      input = this.snapshot.input;
    this.patch({ busy: true, recipeDefinition: recipe });
    const current = () => this.live && ticket === this.generation;
    try {
      const run = await runRecipe(recipe, input, current);
      if (current())
        this.patch({ recipeRun: run, result: run.final, busy: false });
    } catch (error) {
      if (current()) this.patch({ error: safeError(error), busy: false });
    }
  }
  destroy() {
    this.clear();
    this.live = false;
    this.listeners.clear();
  }
}

/** A callback exists only for one live attachment-menu invocation. */
export class Handoff {
  private insert?: (text: string) => void;
  private guard?: () => boolean;
  begin(insert: (text: string) => void, guard: () => boolean) {
    this.cancel();
    this.insert = insert;
    this.guard = guard;
  }
  cancel() {
    this.insert = undefined;
    this.guard = undefined;
  }
  commit(reviewed: string): boolean {
    const insert = this.insert,
      valid = this.guard?.();
    this.cancel();
    if (!insert || !valid || !reviewed || reviewed.length > LIMITS.output)
      return false;
    insert(reviewed);
    return true;
  }
}
