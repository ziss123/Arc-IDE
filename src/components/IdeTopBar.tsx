import { useState, useRef, useEffect } from "react";
import { ChevronDown, Wallet, AlertTriangle, LogOut, Copy, ExternalLink } from "lucide-react";
import { CHAINS } from "../lib/chains";

interface Props {
  address: string | null;
  onConnect: () => unknown;
  onDisconnect: () => unknown;
  selectedChainKey: string;
  onChainChange: (key: string) => unknown;
}

export default function IdeTopBar({ address, onConnect, onDisconnect, selectedChainKey, onChainChange }: Props) {
  const isMainnet = selectedChainKey === "arc-mainnet";
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!walletMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setWalletMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [walletMenuOpen]);

  const selectedChain = CHAINS.find((c) => c.key === selectedChainKey);

  return (
    <div
      className="flex items-center justify-between px-4 shrink-0"
      style={{ height: 52, background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}
    >
      {/* Left: ArcIDE wordmark */}
      <span className="select-none flex items-baseline gap-0" style={{ letterSpacing: "-0.02em" }}>
        <span style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif", color: "var(--ink)" }}>Arc</span>
        <span style={{ fontSize: 18, fontWeight: 300, fontFamily: "'Space Grotesk', sans-serif", color: "var(--ink-2)" }}>IDE</span>
      </span>

      {/* Right: wallet + chain */}
      <div className="flex items-center gap-2">
        {isMainnet && (
          <div
            className="flex items-center gap-1 px-2 py-1 rounded text-xs"
            style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.3)", color: "var(--warn)" }}
          >
            <AlertTriangle size={11} />
            <span>Mainnet</span>
          </div>
        )}

        {/* Chain selector */}
        <div className="relative">
          <select
            value={selectedChainKey}
            onChange={(e) => onChainChange(e.target.value)}
            className="appearance-none rounded text-xs pl-2.5 pr-6 py-1.5 cursor-pointer focus:outline-none"
            style={{ background: "var(--surface-strong)", border: "1px solid var(--border)", color: "var(--ink-2)" }}
          >
            {CHAINS.map((c) => (
              <option key={c.key} value={c.key}>{c.chainName}</option>
            ))}
          </select>
          <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--muted)" }} />
        </div>

        {/* Wallet button / dropdown */}
        {address ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setWalletMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
              style={{ background: "var(--accent)", border: "1px solid var(--accent)", color: "#fff" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="mono">{address.slice(0, 6)}...{address.slice(-4)}</span>
              <ChevronDown size={10} />
            </button>

            {walletMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 rounded-lg shadow-lg z-50 py-1 min-w-[200px]"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                {/* Address info */}
                <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>Connected to</p>
                  <p className="mono text-xs font-medium mt-0.5" style={{ color: "var(--ink)" }}>
                    {address.slice(0, 10)}...{address.slice(-8)}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>
                    {selectedChain?.chainName ?? "Unknown network"}
                  </p>
                </div>

                {/* Actions */}
                <button
                  onClick={() => { void navigator.clipboard.writeText(address); setWalletMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-50"
                  style={{ color: "var(--ink-2)" }}
                >
                  <Copy size={12} />
                  Copy address
                </button>
                <a
                  href={`${selectedChain?.blockExplorerUrls[0] ?? ""}/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setWalletMenuOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-50"
                  style={{ color: "var(--ink-2)" }}
                >
                  <ExternalLink size={12} />
                  View on explorer
                </a>
                <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                <button
                  onClick={() => { onDisconnect(); setWalletMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-red-50"
                  style={{ color: "var(--danger)" }}
                >
                  <LogOut size={12} />
                  Disconnect
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => onConnect()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
            style={{ background: "var(--accent)", border: "1px solid var(--accent)", color: "#fff" }}
          >
            <Wallet size={12} />
            Connect Wallet
          </button>
        )}
      </div>
    </div>
  );
}
