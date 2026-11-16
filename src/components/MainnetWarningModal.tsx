import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

interface Props {
  onConfirm: () => Promise<boolean>;
  onCancel: () => void;
}

export default function MainnetWarningModal({ onConfirm, onCancel }: Props) {
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSwitching(true);
    setSwitchError(null);
    try {
      if (!(await onConfirm())) {
        setSwitchError("Wallet did not switch networks. Check the wallet popup and try again, or cancel to stay on the current network.");
      }
    } catch (error: unknown) {
      setSwitchError(error instanceof Error ? error.message : "Wallet network switch failed.");
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(2px)" }}
      onClick={() => { if (!switching) onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mainnet-warning-title"
        className="w-full max-w-[360px] mx-4 rounded-lg p-4 space-y-3 shadow-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--ink)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center rounded-md shrink-0"
            style={{ width: 30, height: 30, background: "var(--accent-muted)", border: "1px solid rgba(0,122,204,0.32)" }}
          >
            <AlertTriangle size={15} style={{ color: "var(--accent-hover)" }} />
          </div>
          <div>
            <p id="mainnet-warning-title" className="font-semibold text-[13px]" style={{ color: "var(--ink)" }}>
              Switch to Arc Mainnet?
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>Transactions are irreversible</p>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-1.5 text-xs" style={{ color: "var(--ink-2)", lineHeight: 1.55 }}>
          <p>
            Mainnet transactions use <strong style={{ color: "var(--accent-hover)" }}>real USDC</strong> and cannot be reversed
          </p>
          <p>Review your contract carefully before deploying</p>
        </div>

        {switchError && (
          <p className="rounded-md px-2.5 py-2 text-[11px]" role="alert" style={{ background: "rgba(244,135,113,0.12)", color: "var(--danger)" }}>
            {switchError}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-0.5">
          <button
            onClick={() => { void handleConfirm(); }}
            disabled={switching}
            className="flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-60"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {switching ? <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Switching...</span> : "Continue"}
          </button>
          <button
            onClick={onCancel}
            disabled={switching}
            className="flex-1 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-60"
            style={{ background: "var(--surface-strong)", color: "var(--ink-2)", border: "1px solid var(--border)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
