import type { ArcChain } from "./wallet";

export const ARC_TESTNET: ArcChain = {
  key: "arc-testnet",
  chainIdHex: "0x4cef52",
  chainIdDec: 5042002,
  chainName: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: ["https://rpc.testnet.arc.io"],
  blockExplorerUrls: ["https://explorer.testnet.arc.io"],
  faucet: "https://faucet.circle.com",
};

export const ARC_MAINNET: ArcChain = {
  key: "arc-mainnet",
  chainIdHex: "0x13b2",
  chainIdDec: 5042,
  chainName: "Arc Mainnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: ["https://rpc.mainnet.arc.io"],
  blockExplorerUrls: ["https://explorer.arc.io"],
};

export const CHAINS: ArcChain[] = [ARC_TESTNET, ARC_MAINNET];
