import { Contract, JsonRpcSigner, BrowserProvider, isAddress } from "ethers";
import type { InterfaceAbi, TransactionResponse } from "ethers";

export interface AbiFunction {
  name: string;
  type: "function";
  stateMutability: "view" | "pure" | "nonpayable" | "payable";
  inputs: AbiInput[];
  outputs: AbiOutput[];
}

export interface AbiInput {
  name: string;
  type: string;
}

export interface AbiOutput {
  name: string;
  type: string;
}

export function parseAbi(abi: InterfaceAbi): AbiFunction[] {
  if (!Array.isArray(abi)) return [];
  return (abi as unknown[]).filter(
    (item): item is AbiFunction =>
      typeof item === "object" &&
      item !== null &&
      (item as { type?: string }).type === "function"
  );
}

export function isReadFunction(fn: AbiFunction): boolean {
  return fn.stateMutability === "view" || fn.stateMutability === "pure";
}

export async function callReadFunction(
  address: string,
  abi: InterfaceAbi,
  fnName: string,
  args: unknown[]
): Promise<unknown> {
  const win = window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } };
  if (!win.ethereum) throw new Error("Wallet tidak terdeteksi");
  const provider = new BrowserProvider(win.ethereum);
  const contract = new Contract(address, abi, provider);
  const fn = contract[fnName] as ((...a: unknown[]) => Promise<unknown>) | undefined;
  if (!fn) throw new Error(`Function ${fnName} tidak ditemukan`);
  return fn(...args);
}

export async function callWriteFunction(
  address: string,
  abi: InterfaceAbi,
  fnName: string,
  args: unknown[],
  signer: JsonRpcSigner
): Promise<{ txHash: string }> {
  const contract = new Contract(address, abi, signer);
  const fn = contract[fnName] as ((...a: unknown[]) => Promise<TransactionResponse>) | undefined;
  if (!fn) throw new Error(`Function ${fnName} tidak ditemukan`);
  const tx: TransactionResponse = await fn(...args);
  const receipt = await tx.wait();
  return { txHash: receipt?.hash ?? tx.hash };
}

export function formatResult(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (isAddress(value)) return value;
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${(value as unknown[]).map(formatResult).join(", ")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => isNaN(Number(k)));
    if (keys.length > 0) {
      return `{ ${keys.map((k) => `${k}: ${formatResult(obj[k])}`).join(", ")} }`;
    }
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

export function coerceArg(value: string, type: string): unknown {
  const t = type.toLowerCase();
  if (t === "bool") return value === "true" || value === "1";
  if (t.startsWith("uint") || t.startsWith("int")) {
    if (value.trim() === "") return 0n;
    return BigInt(value.trim());
  }
  if (t === "address") return value.trim();
  if (t.includes("[]")) {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value.split(",").map((v) => v.trim());
    }
  }
  return value;
}
