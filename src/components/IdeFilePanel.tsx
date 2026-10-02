import { useState, useRef, useCallback } from "react";
import { FilePlus, Upload, Download, Trash2, FileCode, Check, X } from "lucide-react";

interface FileEntry {
  name: string;
  content: string;
}

interface Props {
  files: FileEntry[];
  activeFile: string | null;
  onSelect: (name: string) => void;
  onNewFile: (name: string) => void;
  onUpload: (name: string, content: string) => void;
  onDownload: () => void;
  onDelete: (name: string) => void;
}

export default function IdeFilePanel({ files, activeFile, onSelect, onNewFile, onUpload, onDownload, onDelete }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [width, setWidth] = useState(220);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const [showNewInput, setShowNewInput] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.max(160, Math.min(400, startW.current + ev.clientX - startX.current));
      setWidth(next);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [width]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onUpload(file.name, typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleNewConfirm = () => {
    const trimmed = newFileName.trim();
    if (!trimmed) return;
    const name = trimmed.endsWith(".sol") ? trimmed : `${trimmed}.sol`;
    onNewFile(name);
    setShowNewInput(false);
    setNewFileName("");
  };

  const handleNewKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleNewConfirm();
    if (e.key === "Escape") { setShowNewInput(false); setNewFileName(""); }
  };

  return (
    <div
      className="flex shrink-0 relative"
      style={{ width, background: "var(--surface-muted)", borderRight: "1px solid var(--border)" }}
    >
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2.5 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--muted)", letterSpacing: "0.08em" }}>
            Your Contracts
          </span>
          <div className="flex items-center gap-0.5">
            <button
              title="New file"
              onClick={() => { setShowNewInput(true); setNewFileName(""); setConfirmDelete(null); }}
              className="p-1 rounded transition-colors hover:bg-slate-100"
              style={{ color: "var(--subtle)" }}
            >
              <FilePlus size={13} />
            </button>
            <button title="Upload .sol file" onClick={handleUploadClick} className="p-1 rounded transition-colors hover:bg-slate-100" style={{ color: "var(--subtle)" }}>
              <Upload size={13} />
            </button>
            <button title="Download active file" onClick={onDownload} className="p-1 rounded transition-colors hover:bg-slate-100" style={{ color: "var(--subtle)" }}>
              <Download size={13} />
            </button>
            <input ref={fileInputRef} type="file" accept=".sol" onChange={handleFileChosen} className="hidden" />
          </div>
        </div>

        {/* Inline new file input */}
        {showNewInput && (
          <div className="px-2 pt-2 pb-2 shrink-0" style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
            <p className="text-xs mb-1.5" style={{ color: "var(--muted)" }}>New file name</p>
            <div className="flex items-center gap-1">
              <input
                autoFocus
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={handleNewKeyDown}
                placeholder="MyContract.sol"
                className="flex-1 text-xs px-2 py-1 rounded outline-none"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--accent)",
                  color: "var(--ink)",
                  fontSize: 11,
                }}
              />
              <button
                onClick={handleNewConfirm}
                className="p-1 rounded"
                style={{ background: "var(--accent)", color: "#fff" }}
                title="Create"
              >
                <Check size={11} />
              </button>
              <button
                onClick={() => { setShowNewInput(false); setNewFileName(""); }}
                className="p-1 rounded"
                style={{ background: "var(--surface-strong)", color: "var(--muted)" }}
                title="Cancel"
              >
                <X size={11} />
              </button>
            </div>
          </div>
        )}

        {/* File list */}
        <div className="flex-1 overflow-y-auto py-1">
          {files.length === 0 && !showNewInput && (
            <p className="text-xs px-4 py-3" style={{ color: "var(--subtle)" }}>No contracts yet.</p>
          )}
          {files.map((f) => {
            const isActive = activeFile === f.name;
            const isDeleting = confirmDelete === f.name;
            return (
              <div key={f.name}>
                <div
                  onClick={() => { if (!isDeleting) { onSelect(f.name); setConfirmDelete(null); } }}
                  className="group flex items-center justify-between px-3 py-1.5 cursor-pointer text-xs transition-colors"
                  style={{
                    background: isActive ? "var(--accent-muted)" : "transparent",
                    borderLeft: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
                    color: isActive ? "var(--accent-hover)" : "var(--ink-2)",
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--surface-strong)"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
                    <span className="truncate mono" style={{ fontSize: 12 }}>{f.name}</span>
                  </div>
                  <button
                    title="Delete"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(f.name); setShowNewInput(false); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all"
                    style={{ color: "var(--danger)" }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                {/* Inline delete confirm */}
                {isDeleting && (
                  <div
                    className="mx-2 mb-1 px-2 py-2 rounded text-xs space-y-2"
                    style={{ background: "var(--surface)", border: "1px solid #fecaca" }}
                  >
                    <p style={{ color: "var(--ink-2)" }}>
                      Delete <span className="mono font-semibold">{f.name}</span>?
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { onDelete(f.name); setConfirmDelete(null); }}
                        className="flex-1 py-1 rounded text-xs font-medium"
                        style={{ background: "#ef4444", color: "#fff" }}
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="flex-1 py-1 rounded text-xs"
                        style={{ background: "var(--surface-strong)", color: "var(--muted)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        className="absolute right-0 top-0 bottom-0 flex items-center justify-center"
        style={{ width: 4, cursor: "col-resize", zIndex: 10 }}
        title="Drag to resize"
      >
        <div style={{ width: 2, height: 32, borderRadius: 2, background: "var(--border-strong)", opacity: 0.5 }} />
      </div>
    </div>
  );
}
