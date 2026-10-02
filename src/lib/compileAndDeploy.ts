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

export async function compileContract(fileName: string, source: string): Promise<CompileResult> {
  const res = await fetch("/api/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, source }),
  });
  const data = await res.json() as { errors?: string[]; error?: string } & CompileResult;
  if (!res.ok) {
    throw new Error(data.errors ? data.errors.join("\n") : (data.error ?? "Compile gagal"));
  }
  return data;
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
  const receipt = await contract.deploymentTransaction()?.wait();
  return {
    address: await contract.getAddress(),
    txHash: receipt?.hash ?? "",
  };
}
