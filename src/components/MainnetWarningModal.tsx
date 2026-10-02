import { AlertTriangle } from "lucide-react";

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function MainnetWarningModal({ onConfirm, onCancel }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onCancel}
    >
      <div
        className="rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4"
        style={{ background: "#0f172a", border: "1px solid #334155", color: "#f1f5f9" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-full shrink-0"
            style={{ width: 36, height: 36, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)" }}
          >
            <AlertTriangle size={18} style={{ color: "#f59e0b" }} />
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: "#f1f5f9" }}>Switching to Arc Mainnet</p>
            <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>Real funds — irreversible</p>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-2 text-sm" style={{ color: "#cbd5e1", lineHeight: 1.6 }}>
          <p>Transactions on mainnet use <strong style={{ color: "#fbbf24" }}>real USDC</strong> and cannot be reversed.</p>
          <p>Make sure you have audited your contract before deploying to mainnet.</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{ background: "#f59e0b", color: "#0f172a" }}
          >
            Continue
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
