import { useState, useRef, useEffect } from "react";
import { ChevronDown, Wallet, LogOut, ExternalLink } from "lucide-react";
import { CHAINS } from "../lib/chains";
import CopyButton from "./CopyButton";

interface Props {
  address: string | null;
  onConnect: () => unknown;
  onDisconnect: () => unknown;
  selectedChainKey: string;
  onChainChange: (key: string) => unknown;
}

export default function IdeTopBar({ address, onConnect, onDisconnect, selectedChainKey, onChainChange }: Props) {
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
      className="qms-topbar-pattern flex items-center justify-between px-4 shrink-0"
      style={{
        height: 44,
        borderBottom: "2px solid rgba(255,255,255,0.32)",
        boxShadow: "0 1px 0 rgba(20,12,43,0.8)",
      }}
    >
      {/* Left: QMS IDE wordmark */}
      <span className="select-none flex items-baseline gap-0" style={{ letterSpacing: "-0.02em" }}>
        <span style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>QMS</span>
        <span style={{ fontSize: 16, fontWeight: 400, fontFamily: "'Space Grotesk', sans-serif", color: "rgba(255,255,255,0.78)" }}> IDE</span>
      </span>

      {/* Right: wallet + chain */}
      <div className="flex items-center gap-2">
        {/* Chain selector */}
        <div className="relative">
          <select
            value={selectedChainKey}
            onChange={(e) => onChainChange(e.target.value)}
            className="appearance-none rounded text-xs pl-2.5 pr-6 py-1.5 cursor-pointer focus:outline-none"
            style={{ background: "rgba(45,30,103,0.24)", border: "1px solid rgba(255,255,255,0.22)", color: "#fff" }}
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
              className="qms-button-light flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
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
                <CopyButton
                  text={address}
                  label="Copy address"
                  showLabel
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-[#382d52]"
                  style={{ color: "var(--ink-2)" }}
                />
                <a
                  href={`${selectedChain?.blockExplorerUrls[0] ?? ""}/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setWalletMenuOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-[#382d52]"
                  style={{ color: "var(--ink-2)" }}
                >
                  <ExternalLink size={12} />
                  View on explorer
                </a>
                <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                <button
                  onClick={() => { onDisconnect(); setWalletMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-[#4c2938]"
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
            className="qms-button-light flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
          >
            <Wallet size={12} />
            Connect Wallet
          </button>
        )}
      </div>
    </div>
  );
}
