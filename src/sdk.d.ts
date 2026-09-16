/** Public subset verified against Hermes 3c3ab69 and upstream 3abeca16. */
declare module "@hermes/plugin-sdk" {
  import type {
    ComponentType,
    ReactNode,
    ButtonHTMLAttributes,
    InputHTMLAttributes,
    TextareaHTMLAttributes,
    RefAttributes,
  } from "react";
  interface Atom<T = unknown> {
    get(): T;
    listen(callback: () => void): () => void;
  }
  export interface PluginContext {
    register(c: {
      id: string;
      area: string;
      title?: string;
      order?: number;
      render?: () => ReactNode;
      data?: unknown;
    }): () => void;
    onDispose(fn: () => void): void;
    storage: {
      get<T>(key: string, fallback: T): T;
      set(key: string, value: unknown): void;
      remove(key: string): void;
    };
    os: { writeClipboard(text: string): Promise<boolean> };
  }
  export const host: {
    navigate(path: string): void;
    openWorkspace?: (
      id: string,
      options: {
        title: string;
        render: () => ReactNode;
        onClose: () => void;
        minWidth?: string;
      },
    ) => () => void;
    state: {
      focusedSessionId?: Atom;
      activeSessionId?: Atom;
      profile?: Atom;
      connectionId?: Atom;
      focusedSessionOwner?: Atom;
      focusedSessionProfile?: Atom;
      focusedStoredSessionId?: Atom;
    };
    notify(options: { kind: "info" | "error"; message: string }): void;
  };
  export const PALETTE_AREA: string;
  export const ROUTES_AREA: string;
  export const SIDEBAR_NAV_AREA: string;
  export const Select: ComponentType<{
    value: string;
    onValueChange(value: string): void;
    children: ReactNode;
  }>;
  export const SelectTrigger: ComponentType<
    ButtonHTMLAttributes<HTMLButtonElement>
  >;
  export const SelectValue: ComponentType;
  export const SelectContent: ComponentType<{ children: ReactNode }>;
  export const SelectItem: ComponentType<{
    value: string;
    children: ReactNode;
  }>;
  export const Codicon: ComponentType<{ name: string; size?: string | number }>;
  export const COMPOSER_AREAS: { attachments: string };
  export const Button: ComponentType<
    ButtonHTMLAttributes<HTMLButtonElement> & {
      variant?: "default" | "outline" | "ghost" | "secondary";
      size?: "sm" | "xs";
    }
  >;
  export const Input: ComponentType<InputHTMLAttributes<HTMLInputElement>>;
  export const Textarea: ComponentType<
    TextareaHTMLAttributes<HTMLTextAreaElement> &
      RefAttributes<HTMLTextAreaElement>
  >;
  export const Dialog: ComponentType<{
    open: boolean;
    onOpenChange(open: boolean): void;
    children: ReactNode;
  }>;
  export const DialogContent: ComponentType<{
    className?: string;
    children: ReactNode;
  }>;
  export const DialogTitle: ComponentType<{ children: ReactNode }>;
  export const DialogDescription: ComponentType<{ children: ReactNode }>;
}
declare module "*.css" {
  const content: string;
  export default content;
}
