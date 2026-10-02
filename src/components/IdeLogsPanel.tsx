import { useState, useRef, useCallback } from "react";
import { Trash2, ExternalLink, GripHorizontal } from "lucide-react";

export interface LogEntry {
  text: string;
  type: "info" | "success" | "warn" | "error";
  category: string;
  time: string;
  explorerUrl?: string;
}

interface Props {
  logs: LogEntry[];
  onClear: () => void;
}

const FILTERS = ["All", "Compile", "Deploy", "Wallet", "Network"] as const;
type Filter = typeof FILTERS[number];

const TYPE_COLORS: Record<LogEntry["type"], string> = {
  info: "var(--ink-2)",
  success: "var(--success)",
  warn: "var(--warn)",
  error: "var(--danger)",
};

const TYPE_BG: Record<LogEntry["type"], string> = {
  info: "rgba(100,116,139,0.08)",
  success: "rgba(16,185,129,0.08)",
  warn: "rgba(245,158,11,0.08)",
  error: "rgba(239,68,68,0.08)",
};

export default function IdeLogsPanel({ logs, onClear }: Props) {
  const [filter, setFilter] = useState<Filter>("All");
  const [height, setHeight] = useState(160);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    startH.current = height;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.max(80, Math.min(500, startH.current - (ev.clientY - startY.current)));
      setHeight(next);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [height]);

  const visible = filter === "All"
    ? logs
    : logs.filter((l) => l.category.toLowerCase() === filter.toLowerCase());

  return (
    <div
      className="shrink-0 flex flex-col"
      style={{
        height,
        borderTop: "1px solid var(--border)",
        background: "var(--surface-muted)",
        fontSize: 12,
      }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        className="flex items-center justify-center shrink-0"
        style={{ height: 10, cursor: "row-resize", background: "var(--surface-strong)", borderBottom: "1px solid var(--border)" }}
        title="Drag to resize"
      >
        <GripHorizontal size={12} style={{ color: "var(--subtle)" }} />
      </div>

      {/* Header bar */}
      <div
        className="flex items-center gap-1 px-3 shrink-0 flex-wrap"
        style={{ minHeight: 34, borderBottom: "1px solid var(--border)", gap: "4px 8px" }}
      >
        <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>Logs</span>

        <div
          className="flex items-center px-2 rounded"
          style={{ background: "var(--surface-strong)", border: "1px solid var(--border)", height: 22, minWidth: 120 }}
        >
          <span style={{ color: "var(--subtle)", fontSize: 10 }}>Filter by hash, method, etc.</span>
        </div>

        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-2 py-0.5 rounded text-xs transition-colors"
              style={{
                background: filter === f ? "var(--accent-muted)" : "transparent",
                color: filter === f ? "var(--accent-hover)" : "var(--subtle)",
                border: `1px solid ${filter === f ? "rgba(59,130,246,0.25)" : "transparent"}`,
                fontWeight: filter === f ? 600 : 400,
              }}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          {(["info", "success", "error"] as const).map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 rounded text-xs capitalize"
              style={{ background: TYPE_BG[t], color: TYPE_COLORS[t], border: `1px solid ${TYPE_COLORS[t]}33` }}
            >
              {t}
            </span>
          ))}
          <button onClick={onClear} title="Clear logs" className="p-1 rounded ml-1 transition-colors hover:bg-slate-100" style={{ color: "var(--subtle)" }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto px-3 py-1 space-y-0.5">
        {visible.length === 0 && (
          <p className="text-xs py-3 text-center" style={{ color: "var(--subtle)" }}>No logs found.</p>
        )}
        {visible.map((l, i) => (
          <div key={i} className="flex items-start gap-2 py-0.5">
            <span className="mono shrink-0" style={{ color: "var(--subtle)", fontSize: 10, paddingTop: 1 }}>{l.time}</span>
            <span
              className="px-1.5 py-0.5 rounded text-xs shrink-0 capitalize"
              style={{ background: TYPE_BG[l.type], color: TYPE_COLORS[l.type], fontSize: 10 }}
            >
              {l.category}
            </span>
            <span className="flex-1 break-all" style={{ color: TYPE_COLORS[l.type] }}>{l.text}</span>
            {l.explorerUrl && (
              <a href={l.explorerUrl} target="_blank" rel="noopener noreferrer" className="shrink-0" style={{ color: "var(--accent-hover)" }}>
                <ExternalLink size={11} />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
