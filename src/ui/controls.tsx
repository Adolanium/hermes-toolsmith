import {
  Button,
  Input,
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@hermes/plugin-sdk";
import { useId } from "react";
import { Options, Tool } from "../core/types";
export { Input, Textarea };
export function Action(props: React.ComponentProps<typeof Button>) {
  return <Button type="button" variant="outline" size="sm" {...props} />;
}
export function Choice({
  id,
  label,
  value,
  options,
  change,
}: {
  id?: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  change(value: string): void;
}) {
  return (
    <Select value={value} onValueChange={change}>
      <SelectTrigger id={id} aria-label={label} className="ts-choice">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function OptionsEditor({
  tool,
  value,
  change,
}: {
  tool: Tool;
  value: Options;
  change(value: Options): void;
}) {
  const prefix = useId();
  return (
    <div className="ts-options">
      {tool.options.map((option) => {
        const id = prefix + option.key;
        return (
          <label
            key={id}
            htmlFor={id}
            className={typeof option.default === "boolean" ? "ts-check" : ""}
          >
            {typeof option.default !== "boolean" && <span>{option.label}</span>}
            {option.values ? (
              <Choice
                id={id}
                label={option.label}
                value={String(value[option.key])}
                change={(next) => change({ ...value, [option.key]: next })}
                options={option.values.map((v) => ({ value: v, label: v }))}
              />
            ) : typeof option.default === "boolean" ? (
              <>
                <input
                  id={id}
                  type="checkbox"
                  checked={Boolean(value[option.key])}
                  onChange={(e) =>
                    change({ ...value, [option.key]: e.target.checked })
                  }
                />
                <span>{option.label}</span>
              </>
            ) : (
              <Input
                id={id}
                type="number"
                min={option.min}
                max={option.max}
                value={
                  Number.isNaN(value[option.key])
                    ? ""
                    : Number(value[option.key])
                }
                onChange={(e) =>
                  change({
                    ...value,
                    [option.key]:
                      e.target.value === "" ? NaN : Number(e.target.value),
                  })
                }
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
