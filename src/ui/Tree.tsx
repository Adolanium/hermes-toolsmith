import { useState } from "react";
import { Json, JsonNumber, pointer, stringifyJson } from "../core/json";
import { Action } from "./controls";
export function Tree({
  value,
  path = "",
  name = "root",
  copy,
  select,
}: {
  value: Json;
  path?: string;
  name?: string;
  copy(text: string): void;
  select(text: string): void;
}) {
  const [open, setOpen] = useState(false),
    [count, setCount] = useState(100);
  const branch =
    value !== null &&
    typeof value === "object" &&
    !(value instanceof JsonNumber);
  const keys = branch ? Object.keys(value) : [];
  const label = branch
    ? `${Array.isArray(value) ? "Array" : "Object"} · ${keys.length}`
    : stringifyJson(value);
  return (
    <div className="ts-tree-node">
      <div className="ts-tree-row">
        {branch ? (
          <Action
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            aria-label={`${open ? "Collapse" : "Expand"} ${name}`}
          >
            {open ? "−" : "+"}
          </Action>
        ) : (
          <span className="ts-tree-leaf" />
        )}
        <span className="ts-tree-key" title={name}>
          {name}
        </span>
        <code title={label}>
          {label.length > 120 ? label.slice(0, 120) + "…" : label}
        </code>
        <Action
          onClick={() => copy(stringifyJson(value, 2))}
          aria-label={`Copy subtree ${name}`}
        >
          Copy
        </Action>
        <Action onClick={() => copy(path)} aria-label={`Copy path ${name}`}>
          Path
        </Action>
        <Action
          onClick={() => select(stringifyJson(value, 2))}
          aria-label={`Select subtree ${name} for chat`}
        >
          Select
        </Action>
      </div>
      {branch && open && (
        <div className="ts-tree-children">
          {keys.slice(0, count).map((key) => (
            <Tree
              key={key}
              name={key}
              path={path + "/" + pointer(key)}
              value={(value as Record<string, Json>)[key]}
              copy={copy}
              select={select}
            />
          ))}
          {count < keys.length && (
            <Action
              onClick={() => setCount(Math.min(count + 100, keys.length))}
            >
              Show next {Math.min(100, keys.length - count)} children
            </Action>
          )}
        </div>
      )}
    </div>
  );
}
