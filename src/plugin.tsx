import {
  host,
  PALETTE_AREA,
  COMPOSER_AREAS,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  type PluginContext,
} from "@hermes/plugin-sdk";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Handoff,
  preferences,
  Preferences,
  WorkspaceModel,
} from "./core/state";
import { LIMITS } from "./core/types";
import { Workspace } from "./ui/Workspace";
import { Action, Textarea } from "./ui/controls";
import styles from "./ui/style.css";

const ID = "hermes-toolsmith";
export default {
  id: ID,
  name: "Hermes Toolsmith",
  description: "Everyday developer tools. Right inside Hermes.",
  register(ctx: PluginContext) {
    // onDispose is required: accepting an older host without it would leak registrations.
    if (typeof ctx.onDispose !== "function") {
      host.notify({
        kind: "error",
        message:
          "Toolsmith requires the Desktop SDK with PluginContext.onDispose. Update Hermes Desktop.",
      });
      return;
    }
    let disposed = false,
      model: WorkspaceModel | undefined;
    let prefs = preferences(ctx.storage.get("preferences", {}));
    let preview: { text: string; invocation: number } | undefined,
      invocation = 0,
      handoffMounted = false;
    const handoff = new Handoff(),
      listeners = new Set<() => void>();
    let unsubscribeTarget: (() => void)[] = [];
    const broadcast = () => listeners.forEach((fn) => fn());
    const cancelHandoff = () => {
      handoff.cancel();
      preview = undefined;
      unsubscribeTarget.splice(0).forEach((fn) => fn());
      broadcast();
    };
    const close = () => {
      cancelHandoff();
      model?.destroy();
      model = undefined;
      if (!disposed) host.navigate("/skills");
    };
    const render = () =>
      model ? (
        <Workspace
          model={model}
          getPreferences={() => prefs}
          persist={(value: Preferences) => {
            const safe = preferences(value);
            ctx.storage.set("preferences", safe);
            prefs = safe;
          }}
          clipboard={(text) => ctx.os.writeClipboard(text)}
          close={close}
        />
      ) : null;
    const open = () => {
      if (disposed) return;
      if (!model) model = new WorkspaceModel(prefs.selected);
      host.navigate("/hermes-toolsmith");
    };
    const subscribe = (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    };
    function ToolsmithPage() {
      if (!model) model = new WorkspaceModel(prefs.selected);
      return render();
    }
    ctx.register({
      id: "page",
      area: ROUTES_AREA,
      title: "Toolsmith",
      data: { path: "/hermes-toolsmith" },
      render: () => <ToolsmithPage />,
    });
    ctx.register({
      id: "nav",
      area: SIDEBAR_NAV_AREA,
      order: 60,
      data: { path: "/hermes-toolsmith", label: "Toolsmith", codicon: "tools" },
    });
    function HandoffButton() {
      const pending = useSyncExternalStore(subscribe, () => preview);
      useEffect(() => {
        handoffMounted = true;
        return () => {
          handoffMounted = false;
          cancelHandoff();
        };
      }, []);
      return (
        <>
          <Action onClick={open} aria-label="Open Hermes Toolsmith">
            Toolsmith
          </Action>
          {pending && <Preview key={pending.invocation} text={pending.text} />}
        </>
      );
    }
    function Preview({ text }: { text: string }) {
      const [reviewed, setReviewed] = useState(text),
        [error, setError] = useState("");
      return (
        <Dialog
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) cancelHandoff();
          }}
        >
          <DialogContent className="ts-handoff">
            <style>{styles}</style>
            <DialogTitle>Review Toolsmith output</DialogTitle>
            <DialogDescription>
              Only the text below will be inserted into the composer that opened
              this review. It becomes part of that chat draft and follows
              Hermes's normal storage and sending behavior.
            </DialogDescription>
            <label>
              Text to insert
              <Textarea
                aria-label="Text to insert"
                dir="auto"
                value={reviewed}
                maxLength={LIMITS.output}
                spellCheck={false}
                onChange={(e) => setReviewed(e.target.value)}
              />
            </label>
            <p>
              Remove secrets or other sensitive content before inserting. This
              action does not send a message.
            </p>
            <div className="ts-actions">
              <Action
                variant="default"
                disabled={!reviewed}
                onClick={() => {
                  try {
                    const ok = handoff.commit(reviewed);
                    cancelHandoff();
                    if (!ok)
                      host.notify({
                        kind: "info",
                        message:
                          "Composer target changed. Open Toolsmith from the destination attachment menu again.",
                      });
                    else model?.selectOutput("");
                  } catch {
                    cancelHandoff();
                    host.notify({
                      kind: "error",
                      message:
                        "Draft insertion could not complete. Copy the selected text instead.",
                    });
                  }
                }}
              >
                Insert into draft
              </Action>
              <Action
                onClick={() => {
                  void ctx.os.writeClipboard(reviewed).then(
                    (ok) =>
                      setError(
                        ok
                          ? "Copied."
                          : "Clipboard unavailable. Select and copy this text manually.",
                      ),
                    () => setError("Clipboard unavailable."),
                  );
                }}
              >
                Copy reviewed text
              </Action>
              <Action onClick={cancelHandoff}>Cancel</Action>
            </div>
            {error && <p role="status">{error}</p>}
          </DialogContent>
        </Dialog>
      );
    }
    ctx.register({
      id: "open",
      area: PALETTE_AREA,
      data: {
        id: ID + ":open",
        label: "Toolsmith: Open",
        keywords: ["developer", "convert", "json", "base64", "tools"],
        run: open,
      },
    });
    // A single status-bar contribution hosts the dialog, independent of any
    // workspace page and without reaching into the application's DOM.
    ctx.register({
      id: "entry",
      area: "statusBar.right",
      order: 130,
      render: () => <HandoffButton />,
    });
    ctx.register({
      id: "attach",
      area: COMPOSER_AREAS.attachments,
      data: {
        label: "Toolsmith: insert reviewed output",
        icon: "tools",
        run: ({ insertText }: { insertText(text: string): void }) => {
          cancelHandoff();
          const text = model?.get().selection;
          if (!text || !handoffMounted) {
            host.notify({
              kind: "info",
              message: !text
                ? "Select output in Toolsmith first, then open this attachment action again."
                : "Toolsmith review is unavailable while the status bar is hidden. Copy the output or show the status bar.",
            });
            return;
          }
          const required = [
            host.state.focusedSessionId,
            host.state.activeSessionId,
            host.state.profile,
            host.state.connectionId,
          ];
          const atoms = [
            ...required,
            ...[
              host.state.focusedSessionOwner,
              host.state.focusedSessionProfile,
              host.state.focusedStoredSessionId,
            ].filter(Boolean),
          ];
          if (
            atoms.some((atom) => !atom || typeof atom.listen !== "function")
          ) {
            host.notify({
              kind: "info",
              message:
                "This Desktop SDK cannot guard the composer target. Copy output instead, or update Hermes Desktop.",
            });
            return;
          }
          const original = atoms.map((atom) => atom!.get());
          const valid = () =>
            !disposed && atoms.every((atom, i) => atom!.get() === original[i]);
          handoff.begin(insertText, valid);
          unsubscribeTarget = atoms.map((atom) => atom!.listen(cancelHandoff));
          preview = { text, invocation: ++invocation };
          broadcast();
        },
      },
    });
    ctx.onDispose(() => {
      disposed = true;
      close();
      listeners.clear();
    });
  },
};
