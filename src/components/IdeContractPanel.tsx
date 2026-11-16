import { useState, useRef, useCallback, useEffect } from "react";
import {
  CheckCircle2, ExternalLink, ChevronDown, ChevronRight,
  Play, Pencil, Loader2, AlertCircle, X, RefreshCw, Hash, Rocket,
} from "lucide-react";
import type { JsonRpcSigner, InterfaceAbi, Provider } from "ethers";
import { BrowserProvider, Contract, JsonRpcProvider, parseUnits } from "ethers";
import { coerceArg, formatResult, type AbiParameter } from "../lib/contractInteract";
import { CHAINS } from "../lib/chains";
import CopyButton from "./CopyButton";
import { readNumberPreference, writePreference } from "../lib/preferences";

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
  inputs: AbiInput[];
  outputs?: AbiInput[];
}

interface AbiInput {
  name: string;
  type: string;
  components?: AbiParameter[];
}

interface TxRecord {
  fn: string;
  hash: string;
  time: string;
  explorerBase: string;
}

interface PendingDeploy {
  contractName: string;
  fileName: string;
  chainKey: string;
  abi: InterfaceAbi;
  bytecode: string;
  constructorInputs: AbiInput[];
  deployer: string;
  gasEstimate: string | null;
  estimatedCost: string | null;
}

interface Props {
  contract: ActiveContract | null;
  signer: JsonRpcSigner | null;
  onLog: (text: string, type?: "info" | "success" | "warn" | "error", category?: string, url?: string) => void;
  onClose: () => void;
  onDeploy: () => Promise<void>;
  onConfirmDeploy: () => Promise<void>;
  deploying: boolean;
  estimatingDeploy: boolean;
  compiling: boolean;
  pendingDeploy: PendingDeploy | null;
  constructorArgs: Record<string, string>;
  onConstructorArgChange: (index: number, val: string) => void;
}

function canonicalAbiType(input: AbiInput): string {
  if (!input.type.startsWith("tuple")) return input.type;
  const suffix = input.type.slice("tuple".length);
  return `(${(input.components ?? []).map(canonicalAbiType).join(",")})${suffix}`;
}

function functionKey(fn: AbiFunction): string {
  return `${fn.name}(${fn.inputs.map(canonicalAbiType).join(",")})`;
}

function emptyFnState(): FnState {
  return { open: false, args: {}, ethValue: "", result: null, loading: false, error: null };
}

function parseFunctionArgs(fn: AbiFunction, values: Record<string, string>): unknown[] {
  return fn.inputs.map((input, index) => {
    const value = values[String(index)] ?? "";
    if (!value.trim() && input.type !== "string") {
      throw new Error(`Enter a value for argument ${index + 1}${input.name ? ` (${input.name})` : ""}, type ${input.type}.`);
    }
    return coerceArg(value, input.type, input.components);
  });
}

function isRpcConnectionError(error: unknown): boolean {
  const message = errorText(error);
  return /failed to fetch|network error|timeout|timed out|server response.*\b(429|5\d\d)\b|http\s+(429|5\d\d)/i.test(message);
}

function errorText(error: unknown, depth = 0): string {
  if (error instanceof Error) {
    if (depth >= 4) return error.message;
    const cause = "cause" in error ? error.cause : undefined;
    return cause === undefined ? error.message : `${error.message} ${errorText(cause, depth + 1)}`;
  }
  if (error && typeof error === "object") {
    if (depth >= 4) return serializeErrorObject(error);
    const details = error as Record<string, unknown>;
    const nested = [details.message, details.error, details.info, details.cause]
      .filter((value) => value !== undefined)
      .map((value) => errorText(value, depth + 1))
      .join(" ");
    return nested || serializeErrorObject(error);
  }
  return String(error);
}

function serializeErrorObject(error: object): string {
  try {
    return JSON.stringify(error) ?? "Unknown error object.";
  } catch {
    return "Unknown error object (circular reference).";
  }
}

function friendlyContractError(error: unknown, network: string): string {
  if (error && typeof error === "object") {
    const details = error as { shortMessage?: unknown; reason?: unknown; message?: unknown };
    if (typeof details.reason === "string" && details.reason) return `Contract reverted: ${details.reason}`;
    if (typeof details.shortMessage === "string" && details.shortMessage) return details.shortMessage;
    if (typeof details.message === "string" && details.message) {
      if (isRpcConnectionError(error)) {
        return `Could not reach the ${network} RPC. Check your connection and try again. (${details.message})`;
      }
      return details.message;
    }
  }
  return error && typeof error === "object" ? errorText(error) : String(error);
}

export default function IdeContractPanel({
  contract, signer, onLog, onClose, onDeploy, onConfirmDeploy,
  deploying, estimatingDeploy, compiling, pendingDeploy, constructorArgs, onConstructorArgChange,
}: Props) {
  const [states, setStates] = useState<Record<string, FnState>>({});
  const [txHistory, setTxHistory] = useState<TxRecord[]>([]);
  const [width, setWidth] = useState(() => readNumberPreference("qms-ide-run-width", 300, 240, 560));
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  useEffect(() => {
    setStates({});
    setTxHistory([]);
  }, [contract?.address, contract?.network, contract?.txHash]);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const nextWidth = Math.max(240, Math.min(560, startW.current - (ev.clientX - startX.current)));
      setWidth(nextWidth);
      writePreference("qms-ide-run-width", nextWidth);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [width]);

  const busy = compiling || deploying || estimatingDeploy;

  const abiArr = contract
    ? (Array.isArray(contract.abi) ? contract.abi : []) as AbiFunction[]
    : [];
  const contractChain = contract
    ? CHAINS.find((candidate) => candidate.chainName === contract.network)
    : undefined;

  const readFns = abiArr.filter(
    (f) => f.type === "function" && (f.stateMutability === "view" || f.stateMutability === "pure"),
  );
  const writeFns = abiArr.filter(
    (f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure",
  );

  const getState = (key: string): FnState => states[key] ?? emptyFnState();

  const toggle = (key: string) =>
    setStates((prev) => {
      const current = prev[key] ?? emptyFnState();
      return { ...prev, [key]: { ...current, open: !current.open } };
    });

  const setArg = (key: string, argIndex: number, val: string) =>
    setStates((prev) => {
      const current = prev[key] ?? emptyFnState();
      return { ...prev, [key]: { ...current, args: { ...current.args, [String(argIndex)]: val } } };
    });

  const setEthValue = (key: string, val: string) =>
    setStates((prev) => ({ ...prev, [key]: { ...(prev[key] ?? emptyFnState()), ethValue: val } }));

  const setFnState = (key: string, patch: Partial<FnState>) =>
    setStates((prev) => ({ ...prev, [key]: { ...(prev[key] ?? emptyFnState()), ...patch } }));

  const callRead = async (fn: AbiFunction) => {
    if (!contract) return;
    const key = functionKey(fn);
    const st = getState(key);
    setFnState(key, { loading: true, error: null, result: null });
    try {
      const chain = CHAINS.find((candidate) => candidate.chainName === contract.network);
      if (!chain) throw new Error(`Unsupported contract network: ${contract.network}`);
      const providers: Provider[] = [];
      providers.push(new JsonRpcProvider(chain.rpcUrls[0], chain.chainIdDec, { staticNetwork: true }));
      if (signer?.provider) {
        try {
          const signerNetwork = await signer.provider.getNetwork();
          if (signerNetwork.chainId === BigInt(chain.chainIdDec)) providers.push(signer.provider);
        } catch {
          // Fall back to the injected wallet provider or the configured public RPC.
        }
      }
      const win = window as unknown as {
        ethereum?: ConstructorParameters<typeof BrowserProvider>[0];
      };
      if (win.ethereum) {
        const walletProvider = new BrowserProvider(win.ethereum);
        try {
          const walletNetwork = await walletProvider.getNetwork();
          if (walletNetwork.chainId === BigInt(chain.chainIdDec) && !providers.includes(walletProvider)) {
            providers.push(walletProvider);
          }
        } catch {
          // The public RPC below remains available when the wallet provider is unavailable.
        }
      }
      const args = parseFunctionArgs(fn, st.args);

      let lastError: unknown;
      for (const provider of providers) {
        try {
          const c = new Contract(contract.address, contract.abi, provider);
          const res = await c.getFunction(functionKey(fn))(...args) as unknown;
          setFnState(key, { loading: false, result: formatResult(res), error: null });
          return;
        } catch (error: unknown) {
          lastError = error;
          if (!isRpcConnectionError(error)) throw error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error("All RPC providers failed.");
    } catch (e: unknown) {
      const msg = friendlyContractError(e, contract.network);
      setFnState(key, { loading: false, error: msg });
      onLog(msg, "error", "contract");
    }
  };

  const callWrite = async (fn: AbiFunction) => {
    if (!contract) return;
    const key = functionKey(fn);
    if (!signer) {
      const msg = "Connect a wallet before sending a transaction.";
      setFnState(key, { loading: false, error: msg });
      onLog(msg, "error", "wallet");
      return;
    }
    const st = getState(key);
    setFnState(key, { loading: true, error: null, result: null });
    try {
      const chain = CHAINS.find((candidate) => candidate.chainName === contract.network);
      if (!chain) throw new Error(`Unsupported contract network: ${contract.network}`);
      const walletNetwork = await signer.provider?.getNetwork();
      if (walletNetwork?.chainId !== BigInt(chain.chainIdDec)) {
        throw new Error(`Switch your wallet to ${chain.chainName} before sending this transaction.`);
      }
      const c = new Contract(contract.address, contract.abi, signer);
      const args = parseFunctionArgs(fn, st.args);
      const method = c.getFunction(functionKey(fn));
      const overrides = fn.stateMutability === "payable" && st.ethValue.trim()
        ? { value: parseUnits(st.ethValue.trim(), chain.nativeCurrency.decimals) }
        : undefined;
      const tx = overrides ? await method(...args, overrides) : await method(...args);
      onLog(`Tx sent: ${tx.hash}`, "info", "contract", `${contract.explorerBase}/tx/${tx.hash}`);
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error(`Transaction ${tx.hash} was not successful.`);
      }
      const hash = receipt?.hash ?? tx.hash;
      setFnState(key, { loading: false, result: `Tx: ${hash}`, error: null });
      onLog(`Tx confirmed: ${hash}`, "success", "contract", `${contract.explorerBase}/tx/${hash}`);
      // Catat ke transactions history
      setTxHistory((prev) => [
        { fn: functionKey(fn), hash, time: new Date().toLocaleTimeString(), explorerBase: contract.explorerBase },
        ...prev,
      ]);
    } catch (e: unknown) {
      const msg = friendlyContractError(e, contract.network);
      setFnState(key, { loading: false, error: msg });
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
              <p className="text-xs font-semibold" style={{ color: "var(--accent)" }}>Deployment Review</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Deploy <strong>{pendingDeploy.contractName}</strong> from <span className="mono">{pendingDeploy.fileName}</span> to{" "}
                <strong>{CHAINS.find((chain) => chain.key === pendingDeploy.chainKey)?.chainName ?? "the selected network"}</strong>.
                {pendingDeploy.constructorInputs.length > 0
                  ? "Fill in all arguments, then estimate gas to review the deployment."
                  : "Review the deployment details and estimate gas before confirming."}
              </p>
              {pendingDeploy.constructorInputs.map((inp, index) => (
                <div key={index} className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted)" }}>
                    {inp.name || `Argument ${index + 1}`}{" "}
                    <span className="mono" style={{ color: "var(--subtle)", fontSize: 10 }}>({inp.type})</span>
                  </label>
                  <input
                    type="text"
                    placeholder={inp.type}
                    value={constructorArgs[String(index)] ?? ""}
                    onChange={(e) => onConstructorArgChange(index, e.target.value)}
                    disabled={estimatingDeploy || deploying}
                    className="w-full rounded px-2 py-1.5 text-xs mono focus:outline-none"
                    style={{ background: "var(--surface-muted)", border: "1px solid var(--border)", color: "var(--ink)" }}
                  />
                </div>
              ))}
              <div className="space-y-1 rounded-md p-2 text-xs" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <div className="flex justify-between gap-2">
                  <span style={{ color: "var(--muted)" }}>Network</span>
                  <strong className="text-right">{CHAINS.find((chain) => chain.key === pendingDeploy.chainKey)?.chainName ?? "Unknown"}</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span style={{ color: "var(--muted)" }}>Deployer</span>
                  <span className="mono">{pendingDeploy.deployer.slice(0, 8)}...{pendingDeploy.deployer.slice(-6)}</span>
                </div>
                {pendingDeploy.gasEstimate && (
                  <>
                    <div className="flex justify-between gap-2">
                      <span style={{ color: "var(--muted)" }}>Estimated gas</span>
                      <span className="mono">{BigInt(pendingDeploy.gasEstimate).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span style={{ color: "var(--muted)" }}>Estimated fee</span>
                      <span className="mono">{pendingDeploy.estimatedCost ?? "Unavailable"} {CHAINS[0].nativeCurrency.symbol}</span>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => { void onConfirmDeploy(); }}
                disabled={deploying || estimatingDeploy}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-semibold disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {deploying || estimatingDeploy ? <Loader2 size={11} className="animate-spin" /> : <Rocket size={11} />}
                {deploying ? "Deploying..." : estimatingDeploy ? "Estimating gas..." : pendingDeploy.gasEstimate ? "Confirm & Deploy" : "Estimate Gas & Review"}
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
                <CopyButton
                  text={contract.address}
                  label="Copy contract address"
                  iconSize={11}
                  className="rounded p-0.5 transition-colors hover:bg-[#382d52]"
                  style={{ color: "var(--subtle)" }}
                />
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
                  key={functionKey(fn)}
                  fn={fn}
                  state={getState(functionKey(fn))}
                  onToggle={() => toggle(functionKey(fn))}
                  onArgChange={(argIndex, val) => setArg(functionKey(fn), argIndex, val)}
                  onEthValueChange={() => {}}
                  onCall={() => { void callRead(fn); }}
                  isRead
                  nativeCurrencySymbol={contractChain?.nativeCurrency.symbol ?? "native"}
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
                  key={functionKey(fn)}
                  fn={fn}
                  state={getState(functionKey(fn))}
                  onToggle={() => toggle(functionKey(fn))}
                  onArgChange={(argIndex, val) => setArg(functionKey(fn), argIndex, val)}
                  onEthValueChange={(val) => setEthValue(functionKey(fn), val)}
                  onCall={() => { void callWrite(fn); }}
                  isRead={false}
                  nativeCurrencySymbol={contractChain?.nativeCurrency.symbol ?? "native"}
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
  onArgChange: (argIndex: number, val: string) => void;
  onEthValueChange: (val: string) => void;
  onCall: () => void;
  isRead: boolean;
  nativeCurrencySymbol: string;
}

function FnAccordion({ fn, state, onToggle, onArgChange, onEthValueChange, onCall, isRead, nativeCurrencySymbol }: FnAccordionProps) {
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
          <span className="mono text-xs font-medium truncate" title={functionKey(fn)}>{functionKey(fn)}</span>
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
          {fn.inputs.map((inp, index) => (
            <div key={index} className="space-y-1">
              <label className="text-xs" style={{ color: "var(--muted)" }}>
                {inp.name || "_"}{" "}
                <span className="mono" style={{ color: "var(--subtle)", fontSize: 10 }}>({inp.type})</span>
              </label>
              <input
                type="text"
                placeholder={inp.type}
                value={state.args[String(index)] ?? ""}
                onChange={(e) => onArgChange(index, e.target.value)}
                className="w-full rounded px-2 py-1 text-xs mono focus:outline-none"
                style={{ background: "var(--surface-muted)", border: "1px solid var(--border)", color: "var(--ink)" }}
              />
            </div>
          ))}

          {/* Payable value field */}
          {isPayable && (
            <div className="space-y-1">
              <label className="text-xs" style={{ color: "var(--warn)" }}>
                Value ({nativeCurrencySymbol}){" "}
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
