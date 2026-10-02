import { X, FileCode, PanelRight, Rocket, Loader2 } from "lucide-react";

interface Props {
  openFiles: string[];
  activeFile: string | null;
  onSelect: (name: string) => void;
  onClose: (name: string) => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onDeploy: () => void;
  deploying: boolean;
  compiling: boolean;
  hasWallet: boolean;
}

export default function IdeTabBar({
  openFiles, activeFile, onSelect, onClose,
  panelOpen, onTogglePanel,
  onDeploy, deploying, compiling, hasWallet,
}: Props) {
  const busy = deploying || compiling;

  return (
    <div
      className="flex items-stretch shrink-0"
      style={{
        background: "var(--surface-muted)",
        borderBottom: "1px solid var(--border)",
        minHeight: 44,
      }}
    >
      {/* Tabs */}
      <div className="flex items-end flex-1 overflow-x-auto">
        {openFiles.map((name) => {
          const isActive = activeFile === name;
          return (
            <div
              key={name}
              onClick={() => onSelect(name)}
              className="group flex items-center gap-1.5 px-3 cursor-pointer text-xs shrink-0 transition-colors self-stretch pt-1"
              style={{
                background: isActive ? "var(--bg)" : "transparent",
                borderTop: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
                borderRight: "1px solid var(--border)",
                color: isActive ? "var(--ink)" : "var(--subtle)",
              }}
            >
              <FileCode size={12} style={{ opacity: 0.6 }} />
              <span className="mono" style={{ fontSize: 12 }}>{name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onClose(name); }}
                className="opacity-0 group-hover:opacity-100 ml-0.5 p-0.5 rounded transition-all"
                style={{ color: "var(--muted)" }}
                title="Close tab"
              >
                <X size={10} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Right side: Deploy + toggle panel */}
      <div className="flex items-stretch shrink-0" style={{ borderLeft: "1px solid var(--border)" }}>
        {/* Deploy button — always visible when a file is active */}
        {activeFile && (
          <button
            onClick={onDeploy}
            disabled={busy || !hasWallet}
            title={!hasWallet ? "Connect wallet first" : busy ? "Processing..." : `Deploy ${activeFile}`}
            className="flex items-center gap-2 px-5 font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed self-stretch"
            style={{
              background: busy ? "#1e293b" : "#0f172a",
              color: "#fff",
              borderRight: "1px solid var(--border)",
              letterSpacing: "0.02em",
              fontSize: 13,
            }}
          >
            {busy
              ? <Loader2 size={14} className="animate-spin" />
              : <Rocket size={14} />}
            <span>{compiling ? "Compiling..." : deploying ? "Deploying..." : "Deploy"}</span>
          </button>
        )}

        {/* Toggle Run & Debug panel */}
        <button
          onClick={onTogglePanel}
          title={panelOpen ? "Close Run & Debug" : "Open Run & Debug"}
          className="flex items-center justify-center px-4 self-stretch transition-colors"
          style={{
            color: panelOpen ? "var(--accent)" : "var(--subtle)",
            background: panelOpen ? "var(--accent-muted)" : "transparent",
          }}
        >
          <PanelRight size={16} />
        </button>
      </div>
    </div>
  );
}
