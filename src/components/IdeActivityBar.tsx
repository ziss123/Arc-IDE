import { FileCode2, Play, History } from "lucide-react";

type ActivePanel = "files" | "run" | "history" | null;

interface Props {
  activePanel: ActivePanel;
  onSelect: (panel: ActivePanel) => void;
}

const items = [
  { id: "files" as const, icon: FileCode2, title: "Your Contracts" },
  { id: "run" as const, icon: Play, title: "Run and Debug" },
  { id: "history" as const, icon: History, title: "Contract History" },
];

export default function IdeActivityBar({ activePanel, onSelect }: Props) {
  return (
    <div
      className="flex flex-col items-center py-2 gap-1 shrink-0"
      style={{ width: 48, background: "#333333", borderRight: "1px solid #252526" }}
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
              background: active ? "rgba(255,255,255,0.08)" : "transparent",
              color: active ? "#ffffff" : "#858585",
              borderLeft: active ? "2px solid #ffffff" : "2px solid transparent",
            }}
          >
            <Icon size={18} />
          </button>
        );
      })}
    </div>
  );
}
