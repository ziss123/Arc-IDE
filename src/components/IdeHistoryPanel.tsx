import { useMemo, useState } from "react";
import { ExternalLink, FileCode2, History, Search, Trash2 } from "lucide-react";
import type { InterfaceAbi } from "ethers";
import CopyButton from "./CopyButton";

export interface HistoryEntry {
  contractName: string;
  fileName: string;
  address: string;
  txHash: string;
  network: string;
  explorerBase: string;
  abi: InterfaceAbi;
  deployedAt: string;
}

interface Props {
  history: HistoryEntry[];
  onLoad: (entry: HistoryEntry) => void;
  onDelete: (network: string, address: string) => void;
}

function shortAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export default function IdeHistoryPanel({ history, onLoad, onDelete }: Props) {
  const [query, setQuery] = useState("");
  const visibleHistory = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return history;
    return history.filter((entry) =>
      [entry.contractName, entry.fileName, entry.address, entry.network]
        .some((value) => value.toLowerCase().includes(normalizedQuery))
    );
  }, [history, query]);

  return (
    <main className="flex flex-1 min-w-0 flex-col" style={{ background: "var(--bg)", fontSize: 13 }}>
      <header
        className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 shrink-0"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <History size={19} style={{ color: "var(--accent-hover)" }} />
          <div>
            <h1 className="font-semibold" style={{ color: "var(--ink)", fontSize: 16 }}>Contract History</h1>
            <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
              Deployed contracts saved in this browser
            </p>
          </div>
          <span
            className="rounded px-2 py-0.5 text-xs mono"
            style={{ background: "var(--surface-strong)", border: "1px solid var(--border)", color: "var(--muted)" }}
          >
            {history.length}
          </span>
        </div>

        <label
          className="flex h-8 w-full max-w-xs items-center gap-2 rounded px-2.5"
          style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)" }}
        >
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contracts..."
            aria-label="Search contract history"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
            style={{ color: "var(--ink)" }}
          />
        </label>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="min-w-[760px]">
          <div
            className="grid items-center gap-4 px-6 py-2 text-[11px] font-semibold uppercase tracking-wider"
            style={{
              gridTemplateColumns: "minmax(180px, 1.15fr) minmax(160px, 1fr) minmax(180px, 1fr) 130px 120px 92px",
              background: "var(--surface)",
              borderBottom: "1px solid var(--border)",
              color: "var(--muted)",
            }}
          >
            <span>Contract</span>
            <span>Source file</span>
            <span>Address</span>
            <span>Network</span>
            <span>Deployed</span>
            <span className="text-right">Actions</span>
          </div>

          {visibleHistory.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
              <History size={32} style={{ color: "var(--subtle)", opacity: 0.65 }} />
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--ink-2)" }}>
                  {history.length === 0 ? "No deployed contracts yet" : "No matching contracts"}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  {history.length === 0
                    ? "Contracts you deploy will appear here."
                    : "Try a different name, address, file, or network."}
                </p>
              </div>
            </div>
          ) : (
            visibleHistory.map((entry) => (
              <div
                key={`${entry.network}:${entry.address}`}
                className="group grid items-center gap-4 px-6 py-3 transition-colors hover:bg-[#2a2d2e]"
                style={{
                  gridTemplateColumns: "minmax(180px, 1.15fr) minmax(160px, 1fr) minmax(180px, 1fr) 130px 120px 92px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <button
                  onClick={() => onLoad(entry)}
                  className="flex min-w-0 items-center gap-2 text-left"
                  title="Open contract in Run & Debug"
                >
                  <FileCode2 size={15} className="shrink-0" style={{ color: "var(--accent-hover)" }} />
                  <span className="truncate font-medium" style={{ color: "var(--ink)" }}>{entry.contractName}</span>
                </button>
                <button
                  onClick={() => onLoad(entry)}
                  className="truncate text-left mono text-xs"
                  style={{ color: "var(--muted)" }}
                  title={`Open ${entry.fileName}`}
                >
                  {entry.fileName}
                </button>
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate mono text-xs" style={{ color: "var(--ink-2)" }} title={entry.address}>
                    {shortAddress(entry.address)}
                  </span>
                  <CopyButton
                    text={entry.address}
                    label={`Copy ${entry.contractName} address`}
                    className="shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[#3c3c3c]"
                    style={{ color: "var(--muted)" }}
                  />
                </div>
                <span
                  className="w-fit rounded px-2 py-1 text-[11px]"
                  style={{
                    background: entry.network.includes("Mainnet") ? "rgba(204,167,0,0.14)" : "rgba(78,201,176,0.12)",
                    color: entry.network.includes("Mainnet") ? "var(--warn)" : "var(--success)",
                  }}
                >
                  {entry.network}
                </span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {new Date(entry.deployedAt).toLocaleDateString()}
                </span>
                <div className="flex items-center justify-end gap-1">
                  <a
                    href={`${entry.explorerBase}/address/${entry.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded p-1.5 hover:bg-[#3c3c3c]"
                    style={{ color: "var(--muted)" }}
                    title="Open contract in explorer"
                    aria-label={`Open ${entry.contractName} in explorer`}
                  >
                    <ExternalLink size={14} />
                  </a>
                  <button
                    onClick={() => onDelete(entry.network, entry.address)}
                    className="rounded p-1.5 hover:bg-[#4a2928]"
                    style={{ color: "var(--danger)" }}
                    title="Remove from history"
                    aria-label={`Remove ${entry.contractName} from history`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
