import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

interface Props {
  text: string;
  label: string;
  iconSize?: number;
  className?: string;
  style?: React.CSSProperties;
  showLabel?: boolean;
  onCopied?: () => void;
}

export default function CopyButton({
  text,
  label,
  iconSize = 12,
  className = "",
  style,
  showLabel = false,
  onCopied,
}: Props) {
  const [status, setStatus] = useState<"copied" | "failed" | null>(null);

  useEffect(() => {
    if (!status) return;
    const timeout = window.setTimeout(() => setStatus(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      onCopied?.();
    } catch {
      setStatus("failed");
    }
  };

  const confirmation = status === "copied" ? "Copied!" : status === "failed" ? "Copy failed" : "";

  return (
    <span className="copy-action">
      <button
        type="button"
        onClick={() => { void copy(); }}
        className={`copy-action-button ${className}`}
        style={style}
        title={status === "copied" ? "Copied to clipboard" : status === "failed" ? "Could not copy to clipboard" : label}
        aria-label={status === "copied" ? `${label} copied` : status === "failed" ? `Failed to copy ${label}` : label}
      >
        {status === "copied" ? <Check size={iconSize} className="copy-success-icon" /> : <Copy size={iconSize} />}
        {showLabel && <span>{status === "copied" ? "Copied!" : status === "failed" ? "Copy failed" : label}</span>}
      </button>
      {!showLabel && status && (
        <span
          key={status}
          className={`copy-feedback ${status === "failed" ? "copy-feedback-error" : ""}`}
          role="status"
          aria-live="polite"
        >
          {confirmation}
        </span>
      )}
    </span>
  );
}
