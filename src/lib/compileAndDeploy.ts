import { ContractFactory, type InterfaceAbi, JsonRpcSigner } from "ethers";

export interface CompileResult {
  contractName: string;
  abi: InterfaceAbi;
  bytecode: string;
  warnings: string[];
}

export interface DeployResult {
  address: string;
  txHash: string;
}

interface CompileErrorResponse {
  errors?: string[];
  error?: string;
  details?: string;
}

export async function compileContract(fileName: string, source: string): Promise<CompileResult> {
  const configuredUrl = import.meta.env.VITE_COMPILE_SERVER_URL?.trim().replace(/\/+$/, "");
  const compileUrl = configuredUrl ? `${configuredUrl}/compile` : "/api/compile";
  let res: Response;
  try {
    res = await fetch(compileUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ fileName, source }),
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
    if (data?.errors?.length) throw new Error(data.errors.join("\n"));
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
  return data as CompileResult;
}

export async function deployContract({
  abi,
  bytecode,
  signer,
  constructorArgs = [],
}: {
  abi: InterfaceAbi;
  bytecode: string;
  signer: JsonRpcSigner;
  constructorArgs?: unknown[];
}): Promise<DeployResult> {
  const factory = new ContractFactory(abi, bytecode, signer);
  const contract = await factory.deploy(...constructorArgs);
  const transaction = contract.deploymentTransaction();
  if (!transaction) throw new Error("The deployment transaction was not created.");
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Deployment transaction ${transaction.hash} was not successful.`);
  }
  return {
    address: await contract.getAddress(),
    txHash: receipt.hash,
  };
}
