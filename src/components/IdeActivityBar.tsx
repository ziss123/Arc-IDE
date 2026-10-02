import { FileCode2, Play, History, Download } from "lucide-react";

type ActivePanel = "files" | "run" | "history" | "import" | null;

interface Props {
  activePanel: ActivePanel;
  onSelect: (panel: ActivePanel) => void;
}

const items = [
  { id: "files" as const, icon: FileCode2, title: "Your Contracts" },
  { id: "run" as const, icon: Play, title: "Run and Debug" },
  { id: "history" as const, icon: History, title: "Contract History" },
  { id: "import" as const, icon: Download, title: "Import Contract" },
];

export default function IdeActivityBar({ activePanel, onSelect }: Props) {
  return (
    <div
      className="flex flex-col items-center py-2 gap-1 shrink-0"
      style={{ width: 48, background: "var(--surface-muted)", borderRight: "1px solid var(--border)" }}
    >
      {items.map(({ id, icon: Icon, title }) => {
        const active = activePanel === id;
        return (
          <button
            key={id}
            onClick={() => onSelect(active ? null : id)}
            title={title}
            className="flex items-center justify-center rounded transition-colors"
            style={{
              width: 34,
              height: 34,
              background: active ? "var(--accent-muted)" : "transparent",
              color: active ? "var(--accent)" : "var(--subtle)",
              borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            <Icon size={18} />
          </button>
        );
      })}
    </div>
  );
}
