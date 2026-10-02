import { ExternalLink, Copy, Trash2, History, ChevronRight } from "lucide-react";
import type { InterfaceAbi } from "ethers";

export interface HistoryEntry {
  contractName: string;
  fileName: string;
  address: string;
  txHash: string;
  network: string;
  explorerBase: string;
  abi: InterfaceAbi;
  deployedAt: string; // ISO string
}

interface Props {
  history: HistoryEntry[];
  onLoad: (entry: HistoryEntry) => void;
  onDelete: (address: string) => void;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

export default function IdeHistoryPanel({ history, onLoad, onDelete }: Props) {
  return (
    <div
      className="flex flex-col shrink-0"
      style={{
        width: 260,
        borderRight: "1px solid var(--border)",
        background: "var(--surface-muted)",
        fontSize: 13,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span className="font-semibold text-sm" style={{ color: "var(--ink)" }}>
          Contract History
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded mono"
          style={{ background: "var(--surface-strong)", color: "var(--muted)", border: "1px solid var(--border)" }}
        >
          {history.length}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
            <History size={28} style={{ opacity: 0.2, color: "var(--muted)" }} />
            <p className="text-xs" style={{ color: "var(--subtle)" }}>
              No deployed contracts yet.
            </p>
          </div>
        ) : (
          history.map((entry) => (
            <div
              key={entry.address}
              className="group mx-2 mb-1 rounded-lg px-3 py-2.5 cursor-pointer transition-colors"
              style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
              onClick={() => onLoad(entry)}
            >
              {/* Contract name + file */}
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-xs" style={{ color: "var(--ink)" }}>
                  {entry.contractName}
                </span>
                <ChevronRight size={12} style={{ color: "var(--subtle)" }} />
              </div>
              <p className="text-xs mb-1.5 mono" style={{ color: "var(--subtle)" }}>
                {entry.fileName}
              </p>

              {/* Address */}
              <div className="flex items-center gap-1 mb-1.5">
                <span className="mono text-xs" style={{ color: "var(--ink-2)" }}>
                  {shortAddr(entry.address)}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); copyToClipboard(entry.address); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: "var(--subtle)" }}
                >
                  <Copy size={10} />
                </button>
                <a
                  href={`${entry.explorerBase}/address/${entry.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ color: "var(--accent-text, var(--accent))" }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ExternalLink size={10} />
                </a>
              </div>

              {/* Network + time + delete */}
              <div className="flex items-center justify-between">
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "var(--accent-muted)", color: "var(--accent)", fontSize: 10 }}
                >
                  {entry.network}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs" style={{ color: "var(--subtle)", fontSize: 10 }}>
                    {new Date(entry.deployedAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(entry.address); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                    style={{ color: "var(--danger)" }}
                    title="Remove from history"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
