# ArcIDE

A browser-based Solidity IDE for deploying smart contracts to **Arc Testnet** and **Arc Mainnet** — built with React, Monaco Editor, and ethers.js.

![ArcIDE](https://img.shields.io/badge/Arc-IDE-1e3a5f?style=for-the-badge)
![Solidity](https://img.shields.io/badge/Solidity-0.8.28-363636?style=for-the-badge&logo=solidity)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)

## Features

- **Monaco Editor** — VS Code-style Solidity editor with syntax highlighting
- **Compile** — Compile Solidity contracts via a local solc server
- **Deploy** — Deploy to Arc Testnet or Arc Mainnet directly from your browser wallet (MetaMask)
- **Run & Debug** — Interact with deployed contracts: call Read/Write methods, view transaction history
- **Contract History** — Persistent history of all deployed contracts (stored in localStorage)
- **Import Contract** — Import any existing contract by address + ABI
- **File Management** — Create, upload, download, and delete Solidity files
- **Resizable panels** — Drag to resize sidebar, logs panel, and Run & Debug panel

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Editor:** Monaco Editor (`@monaco-editor/react`)
- **Blockchain:** ethers.js v6, MetaMask wallet
- **Compile server:** Express.js + solc (Node.js)
- **Chains:** Arc Testnet (Chain ID: 1313161567), Arc Mainnet

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Bun](https://bun.sh/) (recommended) or npm
- [MetaMask](https://metamask.io/) browser extension

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/arc-ide.git
cd arc-ide

# Install dependencies
bun install
# or: npm install
```

### Running Locally

You need to run **two processes** simultaneously:

**Terminal 1 — Compile server:**
```bash
bun run server
# or: node server/index.js
```

**Terminal 2 — Frontend dev server:**
```bash
bun run dev
# or: npm run dev
```

Then open http://localhost:5173 in your browser.

### Build for Production

```bash
bun run build
# or: npm run build
```

Output is in the `dist/` folder. Deploy the `dist/` folder as a static site (Vercel, Netlify, etc.).

> **Note:** The compile server (`server/index.js`) must also be deployed as a backend service. For Vercel, use Vercel Serverless Functions or a separate backend deployment.

## Deploying to Vercel

### Frontend (Static)

The Vite frontend can be deployed directly to Vercel:

1. Push this repo to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Set build command: `bun run build` or `npm run build`
4. Set output directory: `dist`
5. Deploy

### Compile Server (Backend)

The compile server needs to run separately. Options:

- **Vercel Serverless:** Convert `server/index.js` to a Vercel API route at `api/compile.js`
- **Railway / Render:** Deploy `server/index.js` as a Node.js service
- **Set environment variable:** `VITE_COMPILE_SERVER_URL=https://your-server.com`

## Project Structure

```
arc-ide/
├── src/
│   ├── App.tsx                    # Main component
│   ├── components/
│   │   ├── IdeActivityBar.tsx     # Left icon bar
│   │   ├── IdeContractPanel.tsx   # Run & Debug panel
│   │   ├── IdeEditor.tsx          # Monaco editor
│   │   ├── IdeFilePanel.tsx       # Your Contracts sidebar
│   │   ├── IdeHistoryPanel.tsx    # Contract History
│   │   ├── IdeImportPanel.tsx     # Import Contract
│   │   ├── IdeLogsPanel.tsx       # Logs panel
│   │   ├── IdeTabBar.tsx          # Tab bar + Deploy button
│   │   ├── IdeTopBar.tsx          # Top bar (wallet, chain)
│   │   └── MainnetWarningModal.tsx
│   └── lib/
│       ├── chains.ts              # Arc chain configs
│       ├── compileAndDeploy.ts    # Compile + deploy logic
│       ├── contractInteract.ts    # Read/Write contract calls
│       └── wallet.ts             # Wallet connection
├── server/
│   └── index.js                  # Solidity compile server
├── index.html
├── package.json
└── vite.config.ts
```

## Supported Networks

| Network | Chain ID | RPC |
|---------|----------|-----|
| Arc Testnet | 1313161567 | https://rpc.testnet.arc.io |
| Arc Mainnet | 1313161555 | https://rpc.arc.io |

## Adding Arc Network to MetaMask

**Arc Testnet:**
- Network Name: Arc Testnet
- RPC URL: https://rpc.testnet.arc.io
- Chain ID: 1313161567
- Currency Symbol: USDC
- Explorer: https://explorer.testnet.arc.io

**Arc Mainnet:**
- Network Name: Arc Mainnet
- RPC URL: https://rpc.arc.io
- Chain ID: 1313161555
- Currency Symbol: USDC
- Explorer: https://explorer.arc.io

## License

MIT
