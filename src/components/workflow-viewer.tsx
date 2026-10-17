"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Native renderer runs in an opaque-origin sandbox. Uploaded data never becomes markup. */
export default function WorkflowViewer({
  workflow,
  className = "",
}: {
  workflow: unknown;
  className?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const token = useRef("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [format, setFormat] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [subgraphs, setSubgraphs] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [inspection, setInspection] = useState<{
    title: string;
    type: string;
    values: { name: string; value: unknown }[];
  } | null>(null);
  const send = useCallback(
    (type: string, payload: Record<string, unknown> = {}) => {
      if (!token.current) token.current = crypto.randomUUID();
      // '*' is required for opaque sandbox origins; receiver verifies source + unguessable channel token.
      frame.current?.contentWindow?.postMessage(
        { channel: "komfyflow-host", type, token: token.current, ...payload },
        "*",
      );
    },
    [],
  );
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== "null" ||
        event.data?.channel !== "komfyflow-viewer"
      )
        return;
      const m = event.data;
      if (m.type === "ready") {
        setReady(true);
        return;
      }
      if (m.token !== token.current) return;
      if (m.type === "error") setError(String(m.message).slice(0, 500));
      if (m.type === "loaded") {
        setFormat(m.format);
        setWarnings(Array.isArray(m.warnings) ? m.warnings : []);
        setSubgraphs(Array.isArray(m.subgraphs) ? m.subgraphs : []);
        setError("");
      }
      if (m.type === "inspect") setInspection(m.node);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  useEffect(() => {
    if (ready) send("load", { workflow });
  }, [ready, workflow, send]);
  const button =
    "rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10";
  return (
    <div
      ref={container}
      className={`relative overflow-hidden rounded-xl border border-white/10 bg-[#151719] ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-3">
        <span className="text-xs text-zinc-400">
          {format === "api"
            ? "API graph · auto-layout"
            : "Native ComfyUI canvas"}{" "}
          <span className="ml-2 text-emerald-400">Read only</span>
        </span>
        <div className="flex items-center gap-1.5">
          {subgraphs.length > 0 && (
            <select
              aria-label="Inspect subgraph"
              className={button}
              onChange={(e) =>
                e.target.value
                  ? send("subgraph", { id: e.target.value })
                  : send("root")
              }
            >
              <option value="">Root graph</option>
              {subgraphs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.id}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className={button}
            onClick={() => send("zoom", { direction: -1 })}
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className={button}
            onClick={() => send("zoom", { direction: 1 })}
            aria-label="Zoom in"
          >
            +
          </button>
          <button type="button" className={button} onClick={() => send("fit")}>
            Fit
          </button>
          <button
            type="button"
            className={button}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void container.current
                  ?.requestFullscreen()
                  .catch(() =>
                    setError("Fullscreen is unavailable in this browser."),
                  );
            }}
          >
            Fullscreen
          </button>
        </div>
      </div>
      <iframe
        ref={frame}
        src="/viewer/index.html"
        title="Read-only native ComfyUI workflow graph"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="h-[520px] min-h-[360px] w-full border-0"
        onLoad={() => setReady(true)}
      />
      {error && (
        <div
          role="alert"
          className="absolute inset-x-4 bottom-14 rounded-lg border border-red-400/20 bg-zinc-950 p-3 text-sm text-red-300"
        >
          {error}
        </div>
      )}
      {warnings.map((w, i) => (
        <p key={i} className="px-4 py-2 text-xs text-amber-300">
          {w}
        </p>
      ))}
      {inspection && (
        <div className="border-t border-white/10 p-3 text-xs text-zinc-300">
          <div className="flex justify-between">
            <strong>{inspection.title}</strong>
            <button onClick={() => setInspection(null)}>Close inspector</button>
          </div>
          <p className="mt-1 text-zinc-500">{inspection.type}</p>
          {inspection.values.map((v, i) => (
            <p className="mt-1 break-all" key={i}>
              {v.name}: {String(v.value)}
            </p>
          ))}
        </div>
      )}
      <p className="border-t border-white/5 px-4 py-2 text-[11px] text-zinc-500">
        Scroll to zoom · Drag to pan · Custom widget values are safe text
        placeholders. Current pinned native nodes and canvas · original connection renderer. Custom extensions are not executed.
      </p>
    </div>
  );
}
