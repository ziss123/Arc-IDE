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

export interface AbiParameter {
  name: string;
  type: string;
  components?: AbiParameter[];
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
  if (!win.ethereum) throw new Error("No compatible wallet was detected.");
  const provider = new BrowserProvider(win.ethereum);
  const contract = new Contract(address, abi, provider);
  return contract.getFunction(fnName)(...args);
}

export async function callWriteFunction(
  address: string,
  abi: InterfaceAbi,
  fnName: string,
  args: unknown[],
  signer: JsonRpcSigner
): Promise<{ txHash: string }> {
  const contract = new Contract(address, abi, signer);
  const tx: TransactionResponse = await contract.getFunction(fnName)(...args);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Transaction ${tx.hash} was not successful.`);
  }
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

export function coerceArg(
  value: string,
  type: string,
  components?: AbiParameter[],
): unknown {
  const t = type.toLowerCase();
  if (t === "bool") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
    throw new Error(`Expected true or false for bool, received "${value}".`);
  }

  const arrayType = /^(.*)\[(\d*)\]$/.exec(t);
  if (arrayType) {
    let entries: unknown;
    try {
      entries = JSON.parse(value) as unknown;
    } catch {
      throw new Error(`Expected a JSON array for ${type}.`);
    }
    if (!Array.isArray(entries)) throw new Error(`Expected a JSON array for ${type}.`);
    if (arrayType[2] && entries.length !== Number(arrayType[2])) {
      throw new Error(`Expected exactly ${arrayType[2]} values for ${type}.`);
    }
    return entries.map((entry) => coerceArg(
      typeof entry === "string" ? entry : JSON.stringify(entry),
      arrayType[1],
      components,
    ));
  }

  const integerType = /^(u?int)(\d*)$/.exec(t);
  if (integerType) {
    if (!value.trim()) throw new Error(`Enter a value for ${type}.`);
    let integer: bigint;
    try {
      integer = BigInt(value.trim());
    } catch {
      throw new Error(`"${value}" is not a valid ${type}.`);
    }
    const bits = Number(integerType[2] || 256);
    if (bits < 8 || bits > 256 || bits % 8 !== 0) throw new Error(`Invalid Solidity integer type: ${type}.`);
    const unsigned = integerType[1] === "uint";
    const min = unsigned ? 0n : -(1n << BigInt(bits - 1));
    const max = unsigned ? (1n << BigInt(bits)) - 1n : (1n << BigInt(bits - 1)) - 1n;
    if (integer < min || integer > max) throw new Error(`Value is outside the ${type} range.`);
    return integer;
  }

  if (t === "address") {
    const address = value.trim();
    if (!isAddress(address)) throw new Error(`"${value}" is not a valid Ethereum address.`);
    return address;
  }
  const fixedBytes = /^bytes(\d+)$/.exec(t);
  if (t === "bytes" || fixedBytes) {
    const bytes = value.trim();
    if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(bytes)) {
      throw new Error(`Expected a 0x-prefixed even-length hex value for ${type}.`);
    }
    if (fixedBytes && (bytes.length - 2) / 2 !== Number(fixedBytes[1])) {
      throw new Error(`Expected exactly ${fixedBytes[1]} bytes for ${type}.`);
    }
    return bytes;
  }
  if (t === "tuple" || t.startsWith("tuple(")) {
    let tuple: unknown;
    try {
      tuple = JSON.parse(value) as unknown;
    } catch {
      throw new Error(`Expected a JSON array for ${type}.`);
    }
    if (!Array.isArray(tuple)) throw new Error(`Expected a JSON array for ${type}.`);
    if (!components?.length) return tuple;
    if (tuple.length !== components.length) {
      throw new Error(`Expected exactly ${components.length} values for ${type}.`);
    }
    return tuple.map((entry, index) => coerceArg(
      typeof entry === "string" ? entry : JSON.stringify(entry),
      components[index].type,
      components[index].components,
    ));
  }
  return value;
}
