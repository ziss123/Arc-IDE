import { BrowserProvider, JsonRpcSigner } from "ethers";

export interface ArcChain {
  key: string;
  chainIdHex: string;
  chainIdDec: number;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
  faucet?: string;
}

export function hasWallet(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { ethereum?: unknown }).ethereum;
}

export async function connectWallet(): Promise<{ provider: BrowserProvider; signer: JsonRpcSigner; address: string }> {
  const win = window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } };
  if (!win.ethereum) throw new Error("MetaMask atau wallet EVM lain tidak terdeteksi di browser.");
  const provider = new BrowserProvider(win.ethereum);
  const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
  const signer = await provider.getSigner();
  return { provider, signer, address: accounts[0] };
}

export async function switchToChain(chain: ArcChain): Promise<void> {
  const win = window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } };
  if (!win.ethereum) throw new Error("Wallet tidak terdeteksi.");
  try {
    await win.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chain.chainIdHex }],
    });
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code === 4902) {
      await win.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chain.chainIdHex,
            chainName: chain.chainName,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: chain.rpcUrls,
            blockExplorerUrls: chain.blockExplorerUrls,
          },
        ],
      });
    } else {
      throw err;
    }
  }
}
