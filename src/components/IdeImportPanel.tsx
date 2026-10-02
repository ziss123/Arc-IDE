import { useState } from "react";
import { Download, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { BrowserProvider, Contract } from "ethers";
import type { InterfaceAbi } from "ethers";

interface Props {
  onImport: (params: {
    address: string;
    abi: InterfaceAbi;
    contractName: string;
    network: string;
    explorerBase: string;
  }) => void;
  selectedNetwork: string;
  explorerBase: string;
}

const SAMPLE_ABI = `[
  {"type":"function","name":"balanceOf","stateMutability":"view","inputs":[{"name":"account","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},
  {"type":"function","name":"transfer","stateMutability":"nonpayable","inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"name":"","type":"bool"}]}
]`;

export default function IdeImportPanel({ onImport, selectedNetwork, explorerBase }: Props) {
  const [address, setAddress] = useState("");
  const [abiText, setAbiText] = useState("");
  const [contractName, setContractName] = useState("");
  const [probing, setProbing] = useState(false);
  const [probeStatus, setProbeStatus] = useState<"idle" | "ok" | "error">("idle");
  const [probeMsg, setProbeMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(address.trim());

  /** Probe — cek apakah address adalah contract yang valid */
  const handleProbe = async () => {
    if (!isValidAddress) return;
    setProbing(true);
    setProbeStatus("idle");
    setProbeMsg("");
    try {
      const win = window as unknown as { ethereum?: ConstructorParameters<typeof BrowserProvider>[0] };
      if (!win.ethereum) throw new Error("Wallet not detected");
      const provider = new BrowserProvider(win.ethereum);
      const code = await provider.getCode(address.trim());
      if (code === "0x" || code === "") {
        setProbeStatus("error");
        setProbeMsg("Not a contract address — no bytecode found at this address.");
      } else {
        setProbeStatus("ok");
        setProbeMsg("Contract found on chain.");
      }
    } catch (e: unknown) {
      setProbeStatus("error");
      setProbeMsg((e as Error).message ?? "Failed to check address");
    } finally {
      setProbing(false);
    }
  };

  /** Setelah ABI diisi — coba parse nama contract dari ABI (opsional) */
  const handleAbiChange = (val: string) => {
    setAbiText(val);
    setError(null);
    if (!contractName) {
      // Coba deteksi nama dari komentar atau biarkan user isi manual
    }
  };

  const handleImport = () => {
    setError(null);
    const addr = address.trim();
    if (!isValidAddress) { setError("Address tidak valid — harus 0x diikuti 40 hex character."); return; }

    let abi: InterfaceAbi;
    try {
      abi = JSON.parse(abiText.trim()) as InterfaceAbi;
      if (!Array.isArray(abi)) throw new Error("ABI harus berupa array JSON");
    } catch (e: unknown) {
      setError(`ABI tidak valid: ${(e as Error).message}`);
      return;
    }

    const name = contractName.trim() || `Contract_${addr.slice(2, 8)}`;
    onImport({ address: addr, abi, contractName: name, network: selectedNetwork, explorerBase });
    setAddress("");
    setAbiText("");
    setContractName("");
    setProbeStatus("idle");
  };

  /** Quick-test: panggil fungsi read pertama dari ABI */
  const handleQuickTest = async () => {
    setError(null);
    const addr = address.trim();
    let abi: InterfaceAbi;
    try {
      abi = JSON.parse(abiText.trim()) as InterfaceAbi;
    } catch {
      setError("ABI tidak valid");
      return;
    }
    try {
      const win = window as unknown as { ethereum?: ConstructorParameters<typeof BrowserProvider>[0] };
      if (!win.ethereum) throw new Error("Wallet not detected");
      const provider = new BrowserProvider(win.ethereum);
      const contract = new Contract(addr, abi, provider);
      const readFn = (abi as { type: string; name: string; stateMutability: string }[])
        .find((f) => f.type === "function" && (f.stateMutability === "view" || f.stateMutability === "pure") );
      if (!readFn) { setError("No read function found in this ABI."); return; }
      const result = await contract[readFn.name]() as unknown;
      setProbeStatus("ok");
      setProbeMsg(`${readFn.name}() = ${String(result)}`);
    } catch (e: unknown) {
      setProbeStatus("error");
      setProbeMsg((e as Error).message ?? "Quick test failed");
    }
  };

  return (
    <div
      className="flex flex-col shrink-0"
      style={{ width: 280, borderRight: "1px solid var(--border)", background: "var(--surface-muted)", fontSize: 13 }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <Download size={14} style={{ color: "var(--accent)" }} />
        <span className="font-semibold text-sm" style={{ color: "var(--ink)" }}>Import Contract</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Address */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>
            Contract Address
          </label>
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="0x..."
              value={address}
              onChange={(e) => { setAddress(e.target.value); setProbeStatus("idle"); }}
              className="flex-1 rounded px-2 py-1.5 text-xs mono focus:outline-none"
              style={{ background: "var(--surface)", border: `1px solid ${probeStatus === "error" ? "var(--danger)" : probeStatus === "ok" ? "var(--success)" : "var(--border)"}`, color: "var(--ink)" }}
            />
            <button
              onClick={() => { void handleProbe(); }}
              disabled={!isValidAddress || probing}
              className="px-2 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#fff" }}
              title="Cek apakah address ini adalah contract"
            >
              {probing ? <Loader2 size={12} className="animate-spin" /> : "Probe"}
            </button>
          </div>
          {probeStatus !== "idle" && (
            <div className="flex items-start gap-1.5 text-xs" style={{ color: probeStatus === "ok" ? "var(--success)" : "var(--danger)" }}>
              {probeStatus === "ok" ? <CheckCircle2 size={11} className="mt-0.5 shrink-0" /> : <AlertCircle size={11} className="mt-0.5 shrink-0" />}
              <span>{probeMsg}</span>
            </div>
          )}
        </div>

        {/* Contract Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>
            Contract Name <span style={{ color: "var(--subtle)", fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            type="text"
            placeholder="MyContract"
            value={contractName}
            onChange={(e) => setContractName(e.target.value)}
            className="w-full rounded px-2 py-1.5 text-xs mono focus:outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink)" }}
          />
        </div>

        {/* ABI */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>ABI (JSON)</label>
            <button
              onClick={() => setAbiText(SAMPLE_ABI)}
              className="text-xs transition-colors"
              style={{ color: "var(--accent)" }}
            >
              Example ABI
            </button>
          </div>
          <textarea
            rows={8}
            placeholder={'[\n  {"type":"function","name":"...",...}\n]'}
            value={abiText}
            onChange={(e) => handleAbiChange(e.target.value)}
            className="w-full rounded px-2 py-1.5 text-xs mono focus:outline-none resize-none"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink)", lineHeight: 1.5 }}
            spellCheck={false}
          />
        </div>

        {/* Network info */}
        <div
          className="rounded-lg px-3 py-2 text-xs"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <span style={{ color: "var(--muted)" }}>Network: </span>
          <span className="font-medium" style={{ color: "var(--ink-2)" }}>{selectedNetwork}</span>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-1.5 rounded p-2 text-xs" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", color: "var(--danger)" }}>
            <AlertCircle size={11} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleImport}
            disabled={!isValidAddress || !abiText.trim()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <Download size={12} />
            Import and Open in Run &amp; Debug
          </button>
          <button
            onClick={() => { void handleQuickTest(); }}
            disabled={!isValidAddress || !abiText.trim()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--surface-strong)", border: "1px solid var(--border)", color: "var(--ink-2)" }}
          >
            Quick Test (Read only)
          </button>
        </div>
      </div>
    </div>
  );
}
