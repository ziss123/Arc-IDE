# ArcIDE

ArcIDE is a browser-based Solidity IDE for compiling, deploying, and interacting with smart contracts on Arc Testnet and Arc Mainnet. It uses React, TypeScript, Monaco Editor, Vite, and ethers.js.

## Features

- **Solidity editor** — Monaco Editor with Solidity syntax highlighting
- **Compile and deploy** — Compile locally through the included Solidity compile server, then deploy with an EVM wallet
- **Run & Debug** — Call contract read methods and send write transactions
- **Contract history** — Keep deployed contract records in browser storage
- **Logs** — Search messages and filter by activity type
- **File explorer** — Create, upload, download, and remove Solidity files
- **Starter contract** — `HelloArc.sol` is the only contract included by default

## Requirements

- Node.js 18 or later
- npm
- An EVM wallet such as MetaMask to deploy or send transactions

## Install

```bash
npm install
```

## Run locally

Start both processes in separate terminals from the project directory.

**Terminal 1 — Solidity compile server**

```bash
npm run server
```

The API listens on `http://localhost:3001`.

**Terminal 2 — ArcIDE frontend**

```bash
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`.

The frontend development server proxies `/api/compile` to the local compile server. Keep the backend running while compiling.

## Validate and build

```bash
npm run check
```

This runs the TypeScript check, Oxlint, and the production build. To run only the build:

```bash
npm run build
```

The production frontend is generated in `dist/`. The compile API must also be deployed; the static frontend cannot compile contracts by itself.

## Arc networks

| Network | Chain ID | RPC URL | Explorer |
| --- | ---: | --- | --- |
| Arc Testnet | `5042002` | `https://rpc.testnet.arc.io` | `https://explorer.testnet.arc.io` |
| Arc Mainnet | `5042` | `https://rpc.mainnet.arc.io` | `https://explorer.arc.io` |

The native currency is USDC with 18 decimals. Switching to Mainnet displays a confirmation before changing the wallet network. Mainnet transactions use real funds and are irreversible.

If your wallet does not have the network configured, ArcIDE asks the wallet to add it when you select the network.

## Deploy the compile API

The repository includes two ways to run the compiler:

- **Node service:** Run `npm run server` and expose the Express service. Set `VITE_COMPILE_SERVER_URL` at frontend build time to the backend base URL when it is hosted separately.
- **Vercel function:** `api/compile.js` provides a serverless compile endpoint. Deploy the project with Vercel's Node.js function support enabled.

For a public deployment, configure the backend URL and CORS policy for your frontend origin. Do not expose administrative keys or wallet secrets in frontend environment variables.

## Project layout

```text
api/compile.js                  Vercel-compatible compile endpoint
server/index.js                 Local Express compile server
src/App.tsx                     Application state and starter HelloArc.sol
src/components/                 Editor, explorer, history, logs, and wallet UI
src/lib/chains.ts               Arc Testnet and Mainnet configuration
src/lib/compileAndDeploy.ts     Compile and deployment client
src/lib/contractInteract.ts     Contract interaction and argument validation
src/lib/wallet.ts               Wallet connection and network switching
```

## License

MIT
