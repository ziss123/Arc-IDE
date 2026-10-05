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
  if (!win.ethereum) throw new Error("No compatible EVM wallet was detected in this browser.");
  const provider = new BrowserProvider(win.ethereum);
  const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
  if (accounts.length === 0) throw new Error("The wallet did not return an account. Unlock it and try again.");
  const signer = await provider.getSigner();
  return { provider, signer, address: accounts[0] };
}

export async function switchToChain(chain: ArcChain): Promise<void> {
  const win = window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } };
  if (!win.ethereum) throw new Error("No compatible wallet was detected.");
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
      await win.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chain.chainIdHex }],
      });
    } else {
      throw err;
    }
  }

  const activeChainId = await win.ethereum.request({ method: "eth_chainId" });
  if (typeof activeChainId !== "string" || activeChainId.toLowerCase() !== chain.chainIdHex.toLowerCase()) {
    throw new Error(`The wallet did not switch to ${chain.chainName}. Check the active network in your wallet.`);
  }
}
