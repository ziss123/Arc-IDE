import { ContractFactory, formatUnits, type InterfaceAbi, JsonRpcSigner } from "ethers";

export interface CompileResult {
  contractName: string;
  abi: InterfaceAbi;
  bytecode: string;
  warnings: string[];
  diagnostics: CompileDiagnostic[];
}

export interface CompileDiagnostic {
  severity: "error" | "warning";
  message: string;
  fileName?: string;
  start?: number;
  end?: number;
  line?: number;
  column?: number;
}

export interface DeployResult {
  address: string;
  txHash: string;
}

export interface DeploymentEstimate {
  gas: bigint;
  cost: string | null;
}

interface CompileErrorResponse {
  errors?: string[];
  error?: string;
  details?: string;
  diagnostics?: CompileDiagnostic[];
}

export class CompileFailure extends Error {
  readonly diagnostics: CompileDiagnostic[];

  constructor(message: string, diagnostics: CompileDiagnostic[] = []) {
    super(message);
    this.name = "CompileFailure";
    this.diagnostics = diagnostics;
  }
}

function normalizeDiagnostics(
  diagnostics: CompileDiagnostic[] | undefined,
  source: string,
  fileName: string,
): CompileDiagnostic[] {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") lineStarts.push(index + 1);
  }
  return (diagnostics ?? []).map((diagnostic) => {
    if (diagnostic.start === undefined || (diagnostic.fileName && diagnostic.fileName !== fileName)) {
      return diagnostic;
    }
    let low = 0;
    let high = lineStarts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (lineStarts[middle] <= diagnostic.start) low = middle;
      else high = middle;
    }
    return { ...diagnostic, line: low + 1, column: diagnostic.start - lineStarts[low] + 1 };
  });
}

function stripMarkdownCodeFence(source: string): string {
  const match = source.match(/^\s*```[^\r\n]*\r?\n([\s\S]*?)\r?\n```[ \t]*\s*$/);
  return match?.[1] ?? source;
}

export async function compileContract(fileName: string, source: string): Promise<CompileResult> {
  const soliditySource = stripMarkdownCodeFence(source);
  if (!soliditySource.trim()) {
    throw new Error("The Solidity file contains only an empty Markdown code block.");
  }

  const configuredUrl = import.meta.env.VITE_COMPILE_SERVER_URL?.trim().replace(/\/+$/, "");
  const compileUrl = configuredUrl ? `${configuredUrl}/compile` : "/api/compile";
  let res: Response;
  try {
    res = await fetch(compileUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ fileName, source: soliditySource }),
    });
  } catch (error: unknown) {
    const reason = error instanceof Error ? ` (${error.message})` : "";
    throw new Error(
      `Compile server is unreachable${reason}. Start it with "npm run server" and try again.`
    );
  }

  const responseText = await res.text();
  let data: (CompileErrorResponse & Partial<CompileResult>) | null = null;
  if (responseText.trim()) {
    try {
      data = JSON.parse(responseText) as CompileErrorResponse & Partial<CompileResult>;
    } catch {
      const contentType = res.headers.get("content-type") ?? "unknown content";
      const responsePreview = responseText.replace(/\s+/g, " ").trim().slice(0, 240);
      throw new Error(
        `Compile server returned an invalid response (HTTP ${res.status}, ${contentType}). ` +
        `Response: ${responsePreview || "(empty)"}. Check that the compile server is running and reachable at ${compileUrl}.`
      );
    }
  }

  if (!res.ok) {
    if (data?.errors?.length) {
      throw new CompileFailure(data.errors.join("\n"), normalizeDiagnostics(data.diagnostics, soliditySource, fileName));
    }
    if (data?.error || data?.details) {
      const message = data.error ?? `Compile server request failed (HTTP ${res.status}).`;
      throw new Error(data.details ? `${message}\n${data.details}` : message);
    }
    const responsePreview = responseText.replace(/\s+/g, " ").trim().slice(0, 240);
    throw new Error(
      `Compile server returned HTTP ${res.status} without an error message` +
      `${responsePreview ? `: ${responsePreview}` : " (empty response)"}. ` +
      `Restart the backend with "npm run server" and retry.`
    );
  }
  if (!data) {
    throw new Error(
      `Compile server returned an empty response (HTTP ${res.status}). ` +
      `Start or restart it with "npm run server" and try again.`
    );
  }
  if (
    typeof data.contractName !== "string" ||
    !Array.isArray(data.abi) ||
    typeof data.bytecode !== "string" ||
    !data.bytecode.startsWith("0x") ||
    !Array.isArray(data.warnings)
  ) {
    throw new Error("Compile server response is missing contract data. Restart the server and try again.");
  }
  return {
    ...(data as CompileResult),
    diagnostics: normalizeDiagnostics(data.diagnostics, soliditySource, fileName),
    warnings: source === soliditySource
      ? data.warnings
      : [...data.warnings, "Removed the surrounding Markdown code fence before compilation."],
  };
}

export async function deployContract({
  abi,
  bytecode,
  signer,
  constructorArgs = [],
  onTransactionSent,
}: {
  abi: InterfaceAbi;
  bytecode: string;
  signer: JsonRpcSigner;
  constructorArgs?: unknown[];
  onTransactionSent?: (hash: string) => void;
}): Promise<DeployResult> {
  const factory = new ContractFactory(abi, bytecode, signer);
  const contract = await factory.deploy(...constructorArgs);
  const transaction = contract.deploymentTransaction();
  if (!transaction) throw new Error("The deployment transaction was not created.");
  onTransactionSent?.(transaction.hash);
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Deployment transaction ${transaction.hash} was not successful.`);
  }
  return {
    address: await contract.getAddress(),
    txHash: receipt.hash,
  };
}

export async function estimateDeployment({
  abi,
  bytecode,
  signer,
  constructorArgs = [],
  decimals,
}: {
  abi: InterfaceAbi;
  bytecode: string;
  signer: JsonRpcSigner;
  constructorArgs?: unknown[];
  decimals: number;
}): Promise<DeploymentEstimate> {
  const factory = new ContractFactory(abi, bytecode, signer);
  const request = await factory.getDeployTransaction(...constructorArgs);
  const gas = await signer.estimateGas(request);
  const feeData = await signer.provider?.getFeeData();
  const feePerGas = feeData?.maxFeePerGas ?? feeData?.gasPrice;
  return {
    gas,
    cost: feePerGas === null || feePerGas === undefined
      ? null
      : formatUnits(gas * feePerGas, decimals),
  };
}
