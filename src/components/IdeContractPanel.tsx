import { useState, useRef, useCallback } from "react";
import {
  CheckCircle2, ExternalLink, Copy, ChevronDown, ChevronRight,
  Play, Pencil, Loader2, AlertCircle, X, RefreshCw, Hash, Rocket,
} from "lucide-react";
import type { JsonRpcSigner, InterfaceAbi } from "ethers";
import { Contract, BrowserProvider, parseEther } from "ethers";
import { coerceArg, formatResult } from "../lib/contractInteract";

interface ActiveContract {
  contractName: string;
  address: string;
  txHash: string;
  network: string;
  explorerBase: string;
  abi: InterfaceAbi;
  fileName: string;
}

interface FnState {
  open: boolean;
  args: Record<string, string>;
  ethValue: string; // untuk payable functions
  result: string | null;
  loading: boolean;
  error: string | null;
}

interface AbiFunction {
  name: string;
  type: string;
  stateMutability: string;
  inputs: { name: string; type: string }[];
  outputs?: { name: string; type: string }[];
}

interface TxRecord {
  fn: string;
  hash: string;
  time: string;
  explorerBase: string;
}

interface PendingDeploy {
  abi: InterfaceAbi;
  bytecode: string;
  constructorInputs: { name: string; type: string }[];
}

interface Props {
  contract: ActiveContract | null;
  signer: JsonRpcSigner | null;
  onLog: (text: string, type?: "info" | "success" | "warn" | "error", category?: string, url?: string) => void;
  onClose: () => void;
  onDeploy: () => Promise<void>;
  onConfirmDeploy: () => Promise<void>;
  deploying: boolean;
  compiling: boolean;
  pendingDeploy: PendingDeploy | null;
  constructorArgs: Record<string, string>;
  onConstructorArgChange: (name: string, val: string) => void;
}

function copyToClipboard(text: string) {
  return navigator.clipboard.writeText(text);
}

export default function IdeContractPanel({
  contract, signer, onLog, onClose, onDeploy, onConfirmDeploy,
  deploying, compiling, pendingDeploy, constructorArgs, onConstructorArgChange,
}: Props) {
  const [states, setStates] = useState<Record<string, FnState>>({});
  const [txHistory, setTxHistory] = useState<TxRecord[]>([]);
  const [width, setWidth] = useState(300);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setWidth(Math.max(240, Math.min(560, startW.current - (ev.clientX - startX.current))));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [width]);

  const busy = compiling || deploying;

  const abiArr = contract
    ? (Array.isArray(contract.abi) ? contract.abi : []) as AbiFunction[]
    : [];

  const readFns = abiArr.filter(
    (f) => f.type === "function" && (f.stateMutability === "view" || f.stateMutability === "pure"),
  );
  const writeFns = abiArr.filter(
    (f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure",
  );

  const getState = (name: string): FnState =>
    states[name] ?? { open: false, args: {}, ethValue: "", result: null, loading: false, error: null };

  const toggle = (name: string) =>
    setStates((prev) => ({ ...prev, [name]: { ...getState(name), open: !getState(name).open } }));

  const setArg = (fn: string, arg: string, val: string) =>
    setStates((prev) => ({ ...prev, [fn]: { ...getState(fn), args: { ...getState(fn).args, [arg]: val } } }));

  const setEthValue = (fn: string, val: string) =>
    setStates((prev) => ({ ...prev, [fn]: { ...getState(fn), ethValue: val } }));

  const setFnState = (name: string, patch: Partial<FnState>) =>
    setStates((prev) => ({ ...prev, [name]: { ...getState(name), ...patch } }));

  const callRead = async (fn: AbiFunction) => {
    if (!contract) return;
    const provider = signer
      ? signer.provider
      : new BrowserProvider((window as unknown as { ethereum: ConstructorParameters<typeof BrowserProvider>[0] }).ethereum);
    const c = new Contract(contract.address, contract.abi, provider);
    const st = getState(fn.name);
    // Coerce setiap arg ke tipe yang benar
    const args = fn.inputs.map((inp) => coerceArg(st.args[inp.name] ?? "", inp.type));
    setFnState(fn.name, { loading: true, error: null, result: null });
    try {
      const res = await c[fn.name](...args) as unknown;
      setFnState(fn.name, { loading: false, result: formatResult(res) });
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "Error";
      setFnState(fn.name, { loading: false, error: msg });
      onLog(msg, "error", "contract");
    }
  };

  const callWrite = async (fn: AbiFunction) => {
    if (!contract) return;
    if (!signer) {
      onLog("Hubungkan wallet untuk mengirim transaksi.", "error", "wallet");
      return;
    }
    const c = new Contract(contract.address, contract.abi, signer);
    const st = getState(fn.name);
    const args = fn.inputs.map((inp) => coerceArg(st.args[inp.name] ?? "", inp.type));
    setFnState(fn.name, { loading: true, error: null, result: null });
    try {
      // Handle payable — kirim ETH/native value jika diisi
      const overrides = fn.stateMutability === "payable" && st.ethValue
        ? { value: parseEther(st.ethValue) }
        : {};
      const tx = await c[fn.name](...args, overrides) as { hash: string; wait: () => Promise<{ hash: string }> };
      onLog(`Tx sent: ${tx.hash}`, "info", "contract", `${contract.explorerBase}/tx/${tx.hash}`);
      const receipt = await tx.wait();
      const hash = receipt?.hash ?? tx.hash;
      setFnState(fn.name, { loading: false, result: `Tx: ${hash}` });
      onLog(`Tx confirmed: ${hash}`, "success", "contract", `${contract.explorerBase}/tx/${hash}`);
      // Catat ke transactions history
      setTxHistory((prev) => [
        { fn: fn.name, hash, time: new Date().toLocaleTimeString(), explorerBase: contract.explorerBase },
        ...prev,
      ]);
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "Error";
      setFnState(fn.name, { loading: false, error: msg });
      onLog(msg, "error", "contract");
    }
  };

  return (
    <div
      className="flex relative"
      style={{ width, background: "var(--surface-muted)", borderLeft: "1px solid var(--border)", fontSize: 13 }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={onResizeMouseDown}
        className="absolute left-0 top-0 bottom-0 flex items-center justify-center"
        style={{ width: 4, cursor: "col-resize", zIndex: 10 }}
      >
        <div style={{ width: 2, height: 32, borderRadius: 2, background: "var(--border-strong)", opacity: 0.5 }} />
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2.5 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span className="font-semibold text-sm" style={{ color: "var(--ink)" }}>Run and Debug</span>
          <button onClick={onClose} className="p-1 rounded" style={{ color: "var(--subtle)" }} title="Close panel">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">

          {/* Constructor args form */}
          {pendingDeploy && (
            <div className="rounded-lg p-3 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--accent)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--accent)" }}>Constructor Arguments</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Fill in all arguments then click <strong>Confirm Deploy</strong>.
              </p>
              {pendingDeploy.constructorInputs.map((inp) => (
                <div key={inp.name} className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted)" }}>
                    {inp.name || "_"}{" "}
                    <span className="mono" style={{ color: "var(--subtle)", fontSize: 10 }}>({inp.type})</span>
                  </label>
                  <input
                    type="text"
                    placeholder={inp.type}
                    value={constructorArgs[inp.name] ?? ""}
                    onChange={(e) => onConstructorArgChange(inp.name, e.target.value)}
                    className="w-full rounded px-2 py-1.5 text-xs mono focus:outline-none"
                    style={{ background: "var(--surface-muted)", border: "1px solid var(--border)", color: "var(--ink)" }}
                  />
                </div>
              ))}
              <button
                onClick={() => { void onConfirmDeploy(); }}
                disabled={deploying}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-semibold disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {deploying ? <Loader2 size={11} className="animate-spin" /> : <Rocket size={11} />}
                {deploying ? "Deploying..." : "Confirm Deploy"}
              </button>
            </div>
          )}

          {/* Empty state */}
          {!contract && !pendingDeploy && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3" style={{ color: "var(--subtle)" }}>
              <Rocket size={32} style={{ opacity: 0.2 }} />
              <div className="space-y-1">
                <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>No contract deployed yet</p>
                <p className="text-xs">Click <strong style={{ color: "var(--accent)" }}>Deploy</strong> in the tab bar to start.</p>
              </div>
            </div>
          )}

          {/* Contract info */}
          {contract && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Contract{" "}
                <span className="mono font-medium" style={{ color: "var(--ink)" }}>{contract.contractName}</span>
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <CheckCircle2 size={12} style={{ color: "var(--success)", flexShrink: 0 }} />
                <span className="mono text-xs" style={{ color: "var(--ink-2)" }}>
                  {contract.address.slice(0, 8)}...{contract.address.slice(-6)}
                </span>
                <button onClick={() => { void copyToClipboard(contract.address); }} title="Copy address" style={{ color: "var(--subtle)" }}>
                  <Copy size={11} />
                </button>
                <a href={`${contract.explorerBase}/address/${contract.address}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-text)" }}>
                  <ExternalLink size={11} />
                </a>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded text-xs" style={{ background: "var(--accent-muted)", color: "var(--accent)" }}>
                  {contract.network}
                </span>
                <button
                  onClick={() => { void onDeploy(); }}
                  disabled={busy}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xs disabled:opacity-40"
                  style={{ background: "var(--surface-strong)", color: "var(--muted)", border: "1px solid var(--border)" }}
                >
                  <RefreshCw size={10} />
                  Redeploy
                </button>
              </div>
            </div>
          )}

          {/* Read Methods */}
          {contract && readFns.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase" style={{ color: "var(--muted)", letterSpacing: "0.08em" }}>Read Methods</p>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(16,185,129,0.08)", color: "var(--success)", fontSize: 10 }}>
                  view / pure
                </span>
              </div>
              {readFns.map((fn) => (
                <FnAccordion
                  key={fn.name}
                  fn={fn}
                  state={getState(fn.name)}
                  onToggle={() => toggle(fn.name)}
                  onArgChange={(argName, val) => setArg(fn.name, argName, val)}
                  onEthValueChange={() => {}}
                  onCall={() => { void callRead(fn); }}
                  isRead
                />
              ))}
            </div>
          )}

          {/* Write Methods */}
          {contract && writeFns.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase" style={{ color: "var(--muted)", letterSpacing: "0.08em" }}>Write Methods</p>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(30,58,95,0.08)", color: "var(--accent)", fontSize: 10 }}>
                  state-changing
                </span>
              </div>
              {writeFns.map((fn) => (
                <FnAccordion
                  key={fn.name}
                  fn={fn}
                  state={getState(fn.name)}
                  onToggle={() => toggle(fn.name)}
                  onArgChange={(argName, val) => setArg(fn.name, argName, val)}
                  onEthValueChange={(val) => setEthValue(fn.name, val)}
                  onCall={() => { void callWrite(fn); }}
                  isRead={false}
                />
              ))}
            </div>
          )}

          {/* Transactions */}
          {contract && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase mb-2" style={{ color: "var(--muted)", letterSpacing: "0.08em" }}>Transactions</p>
              {txHistory.length === 0 ? (
                <div
                  className="rounded-lg py-6 text-center text-xs"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--subtle)" }}
                >
                  No transactions yet.
                </div>
              ) : (
                <div className="space-y-1">
                  {txHistory.map((tx, i) => (
                    <div
                      key={i}
                      className="rounded-lg px-3 py-2 flex items-center justify-between gap-2"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Hash size={11} style={{ color: "var(--success)", flexShrink: 0 }} />
                        <span className="mono text-xs truncate" style={{ color: "var(--ink-2)" }}>
                          {tx.fn}
                        </span>
                        <span className="text-xs" style={{ color: "var(--subtle)", flexShrink: 0 }}>{tx.time}</span>
                      </div>
                      <a
                        href={`${tx.explorerBase}/tx/${tx.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--accent-text)", flexShrink: 0 }}
                        title={tx.hash}
                      >
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface FnAccordionProps {
  fn: AbiFunction;
  state: FnState;
  onToggle: () => void;
  onArgChange: (argName: string, val: string) => void;
  onEthValueChange: (val: string) => void;
  onCall: () => void;
  isRead: boolean;
}

function FnAccordion({ fn, state, onToggle, onArgChange, onEthValueChange, onCall, isRead }: FnAccordionProps) {
  const isPayable = fn.stateMutability === "payable";
  const outputHint = fn.outputs && fn.outputs.length > 0
    ? fn.outputs.map((o) => o.type).join(", ")
    : null;

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
        style={{ color: "var(--ink-2)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="mono text-xs font-medium truncate">{fn.name}</span>
          {outputHint && isRead && (
            <span className="mono shrink-0" style={{ fontSize: 10, color: "var(--subtle)" }}>→ {outputHint}</span>
          )}
          {isPayable && (
            <span className="px-1 rounded shrink-0" style={{ fontSize: 9, background: "rgba(245,158,11,0.12)", color: "var(--warn)" }}>
              payable
            </span>
          )}
        </div>
        {state.open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>

      {state.open && (
        <div className="px-3 pb-3 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
          {fn.inputs.map((inp) => (
            <div key={inp.name} className="space-y-1">
              <label className="text-xs" style={{ color: "var(--muted)" }}>
                {inp.name || "_"}{" "}
                <span className="mono" style={{ color: "var(--subtle)", fontSize: 10 }}>({inp.type})</span>
              </label>
              <input
                type="text"
                placeholder={inp.type}
                value={state.args[inp.name] ?? ""}
                onChange={(e) => onArgChange(inp.name, e.target.value)}
                className="w-full rounded px-2 py-1 text-xs mono focus:outline-none"
                style={{ background: "var(--surface-muted)", border: "1px solid var(--border)", color: "var(--ink)" }}
              />
            </div>
          ))}

          {/* Payable value field */}
          {isPayable && (
            <div className="space-y-1">
              <label className="text-xs" style={{ color: "var(--warn)" }}>
                Value (ETH/native){" "}
                <span className="mono" style={{ fontSize: 10, color: "var(--subtle)" }}>(payable)</span>
              </label>
              <input
                type="text"
                placeholder="0.0"
                value={state.ethValue ?? ""}
                onChange={(e) => onEthValueChange(e.target.value)}
                className="w-full rounded px-2 py-1 text-xs mono focus:outline-none"
                style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.3)", color: "var(--ink)" }}
              />
            </div>
          )}

          <button
            onClick={onCall}
            disabled={state.loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium w-full justify-center disabled:opacity-50"
            style={{
              background: isRead ? "rgba(16,185,129,0.10)" : "rgba(30,58,95,0.08)",
              color: isRead ? "var(--success)" : "var(--accent)",
              border: `1px solid ${isRead ? "rgba(16,185,129,0.2)" : "rgba(30,58,95,0.2)"}`,
            }}
          >
            {state.loading ? <Loader2 size={11} className="animate-spin" /> : isRead ? <Play size={11} /> : <Pencil size={11} />}
            {isRead ? "Call" : "Send"}
          </button>

          {state.result !== null && (
            <div className="rounded p-2 space-y-1" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-1" style={{ color: "var(--success)", fontSize: 10 }}>
                <CheckCircle2 size={10} />
                <span>Result</span>
              </div>
              <pre className="mono text-xs break-all whitespace-pre-wrap" style={{ color: "var(--ink-2)" }}>
                {state.result}
              </pre>
            </div>
          )}

          {state.error !== null && (
            <div className="rounded p-2 flex gap-1.5" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <AlertCircle size={10} className="mt-0.5 shrink-0" style={{ color: "var(--danger)" }} />
              <pre className="mono text-xs break-all whitespace-pre-wrap" style={{ color: "var(--danger)" }}>
                {state.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
