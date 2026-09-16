// Browser test fixture only. This is not included in the installable artifact.
import React, { useSyncExternalStore, useState } from "react";
import { createRoot } from "react-dom/client";
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import * as SelectPrimitive from "@radix-ui/react-select";
export const Select = SelectPrimitive.Root;
export const SelectTrigger = (props: any) => (
  <SelectPrimitive.Trigger data-slot="select-trigger" {...props} />
);
export const SelectValue = SelectPrimitive.Value;
export const SelectContent = ({ children }: any) => (
  <SelectPrimitive.Portal container={document.querySelector(".mock-host")}>
    <SelectPrimitive.Content className="mock-select-content" position="popper">
      <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
);
export const SelectItem = ({ children, ...props }: any) => (
  <SelectPrimitive.Item className="mock-select-item" {...props}>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
);
export const ReactExports = React;
export const jsxExports = { jsx, jsxs, Fragment };
export function Codicon({
  name,
  size,
}: {
  name: string;
  size?: string | number;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size ?? 14}
      height={size ?? 14}
      viewBox="0 0 20 20"
    >
      <polygon
        points="10,2 12.4,7.2 18,8 14,12 15,18 10,15.2 5,18 6,12 2,8 7.6,7.2"
        fill={name === "star-full" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
type Contribution = {
  id: string;
  area: string;
  render?: () => React.ReactNode;
  data?: any;
};
const contributions = new Map<string, Contribution>(),
  listeners = new Set<() => void>();
let revision = 0;
const update = () => {
  revision++;
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const atom = (initial: unknown) => {
  let value = initial;
  const callbacks = new Set<() => void>();
  return {
    get: () => value,
    listen: (fn: () => void) => {
      callbacks.add(fn);
      return () => callbacks.delete(fn);
    },
    set: (next: unknown) => {
      value = next;
      callbacks.forEach((fn) => fn());
    },
    count: () => callbacks.size,
  };
};
export const host = {
  navigate: (path: string) => {
    fixture.route = path;
    update();
  },
  state: {
    focusedSessionId: atom("session-A"),
    activeSessionId: atom("session-A"),
    profile: atom("default"),
    connectionId: atom("local"),
    focusedSessionOwner: atom("owner-A"),
  },
  notify: (message: unknown) => {
    fixture.notifications.push(message);
    update();
  },
  openWorkspace: (
    id: string,
    options: { render(): React.ReactNode; onClose(): void },
  ) => {
    fixture.workspaceOpens++;
    contributions.set(id, { id, area: "workspace", render: options.render });
    update();
    return () => {
      contributions.delete(id);
      options.onClose();
      update();
    };
  },
};
export const PALETTE_AREA = "palette",
  COMPOSER_AREAS = { attachments: "composer.attachments" };
export const ROUTES_AREA = "routes",
  SIDEBAR_NAV_AREA = "sidebar.nav";
export function Button({ variant = "outline", size, ...props }: any) {
  return <button data-variant={variant} {...props} />;
}
export const Input = React.forwardRef<HTMLInputElement, any>((props, ref) => (
  <input {...props} ref={ref} />
));
export const Textarea = React.forwardRef<HTMLTextAreaElement, any>(
  (props, ref) => <textarea {...props} ref={ref} />,
);
const DialogContext = React.createContext<() => void>(() => {});
export function Dialog({ open, onOpenChange, children }: any) {
  return open ? (
    <DialogContext.Provider value={() => onOpenChange(false)}>
      <div
        className="mock-overlay"
        onKeyDown={(e) => {
          if (e.key === "Escape") onOpenChange(false);
        }}
      >
        {children}
      </div>
    </DialogContext.Provider>
  ) : null;
}
export function DialogContent({ children, className }: any) {
  return (
    <div role="dialog" aria-modal="true" className={"mock-dialog " + className}>
      {children}
    </div>
  );
}
export const DialogTitle = ({ children }: any) => <h2>{children}</h2>;
export const DialogDescription = ({ children }: any) => <p>{children}</p>;
let disposers: (() => void)[] = [],
  plugin: { register(ctx: unknown): void };
export const fixture = {
  navigate: host.navigate,
  workspaceOpens: 0,
  route: "",
  persisted: {} as Record<string, unknown>,
  clipboard: "",
  inserted: [] as string[],
  notifications: [] as unknown[],
  sends: 0,
  open: () => (contributions.get("open")!.data.run as () => void)(),
  attach: () =>
    contributions.get("attach")!.data.run({
      insertText: (text: string) => {
        fixture.inserted.push(text);
        update();
      },
    }),
  disable: () => {
    disposers.splice(0).forEach((fn) => fn());
    update();
  },
  enable: () => {
    plugin.register({
      register: (item: Contribution) => {
        contributions.set(item.id, item);
        update();
        const dispose = () => {
          contributions.delete(item.id);
          update();
        };
        disposers.push(dispose);
        return dispose;
      },
      onDispose: (fn: () => void) => disposers.push(fn),
      storage: {
        get: (key: string, fallback: unknown) =>
          fixture.persisted[key] ?? fallback,
        set: (key: string, value: unknown) => {
          fixture.persisted[key] = structuredClone(value);
        },
        remove: (key: string) => {
          delete fixture.persisted[key];
        },
      },
      os: {
        writeClipboard: async (text: string) => {
          fixture.clipboard = text;
          return true;
        },
      },
    });
  },
  count: () => contributions.size,
  atomListeners: () =>
    Object.values(host.state).reduce((n, a) => n + a.count(), 0),
  state: host.state,
  fallback: () => {
    (host as any).openWorkspace = undefined;
  },
};
(window as any).fixture = fixture;
function Host() {
  useSyncExternalStore(subscribe, () => revision);
  const [light, setLight] = useState(false);
  return (
    <div className={light ? "mock-host light" : "mock-host"}>
      <header className="mock-header">
        <b>SDK browser fixture</b>
        <span>Built plugin · disconnected gateway · mock host components</span>
        <button onClick={() => setLight(!light)}>Toggle theme</button>
        <button onClick={fixture.open}>Palette: Toolsmith</button>
        <button onClick={fixture.attach}>Attach Toolsmith</button>
        {[...contributions.values()]
          .filter((c) => c.area === SIDEBAR_NAV_AREA)
          .map((c) => (
            <button
              key={c.id}
              onClick={() => {
                fixture.route = c.data.path;
                update();
              }}
            >
              Sidebar: {c.data.label}
            </button>
          ))}
      </header>
      <div className="mock-workspace">
        {fixture.route &&
          [...contributions.values()]
            .filter(
              (c) => c.area === ROUTES_AREA && c.data.path === fixture.route,
            )
            .map((c) => (
              <React.Fragment key={c.id}>{c.render?.()}</React.Fragment>
            ))}
        {[...contributions.values()]
          .filter((c) => c.area === "workspace" || c.area === "panes")
          .map((c) => (
            <React.Fragment key={c.id}>{c.render?.()}</React.Fragment>
          ))}
      </div>
      <footer className="mock-status">
        {[...contributions.values()]
          .filter((c) => c.area === "statusBar.right")
          .map((c) => (
            <React.Fragment key={c.id}>{c.render?.()}</React.Fragment>
          ))}
      </footer>
    </div>
  );
}
export async function start() {
  plugin = (await import(/* @vite-ignore */ "/plugin.js")).default;
  createRoot(document.getElementById("root")!).render(<Host />);
  fixture.enable();
}
