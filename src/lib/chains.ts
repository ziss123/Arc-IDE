import type { EvmChain } from "./wallet";

export const QMS_TESTNET: EvmChain = {
  key: "qms-testnet",
  chainIdHex: "0x4c18",
  chainIdDec: 19480,
  chainName: "QMS Testnet",
  nativeCurrency: { name: "QMS", symbol: "QMS", decimals: 18 },
  rpcUrls: ["https://rpc.testnet.qms.finance"],
  blockExplorerUrls: ["https://testnet.qmsscan.io"],
};

export const CHAINS: EvmChain[] = [QMS_TESTNET];
