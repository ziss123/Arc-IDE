import { useState, useEffect, useCallback } from "react";
import IdeTopBar from "./components/IdeTopBar";
import IdeActivityBar from "./components/IdeActivityBar";
import IdeFilePanel from "./components/IdeFilePanel";
import IdeTabBar from "./components/IdeTabBar";
import IdeEditor from "./components/IdeEditor";
import IdeLogsPanel, { type LogEntry } from "./components/IdeLogsPanel";
import IdeContractPanel from "./components/IdeContractPanel";
import IdeHistoryPanel, { type HistoryEntry } from "./components/IdeHistoryPanel";
import IdeImportPanel from "./components/IdeImportPanel";
import MainnetWarningModal from "./components/MainnetWarningModal";
import { connectWallet, switchToChain, type ArcChain } from "./lib/wallet";
import { compileContract, deployContract, type CompileResult } from "./lib/compileAndDeploy";
import { CHAINS, ARC_TESTNET } from "./lib/chains";
import { BrowserProvider } from "ethers";
import type { JsonRpcSigner, InterfaceAbi } from "ethers";

interface FileEntry {
  name: string;
  content: string;
}

interface ActiveContract {
  contractName: string;
  address: string;
  txHash: string;
  network: string;
  explorerBase: string;
  abi: InterfaceAbi;
  fileName: string;
}

interface DeployRecord {
  contractName: string;
  address: string;
  txHash: string;
  network: string;
  explorerBase: string;
  timestamp: string;
}

const STORAGE_KEY = "arc-ide-files-v5";
const CONTRACTS_KEY = "arc-ide-contracts-v2";

const TPL_ERC20 = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ERC-20 Token
/// @notice Standard fungible token. Deploy with name, symbol, decimals, and initial supply.
contract ERC20Token {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Mint(address indexed to, uint256 value);
    event Burn(address indexed from, uint256 value);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(string memory _name, string memory _symbol, uint8 _decimals, uint256 _initialSupply) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        owner = msg.sender;
        _mint(msg.sender, _initialSupply * 10 ** _decimals);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Burn(msg.sender, amount);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Mint(to, amount);
        emit Transfer(address(0), to, amount);
    }
}
`;

const TPL_ERC721 = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ERC-721 NFT Collection
/// @notice Basic NFT collection with mint, burn, and transfer.
contract ERC721NFT {
    string public name;
    string public symbol;
    address public owner;
    uint256 private _nextTokenId;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    mapping(uint256 => string) private _tokenURIs;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
        owner = msg.sender;
    }

    function balanceOf(address addr) external view returns (uint256) { return _balances[addr]; }
    function ownerOf(uint256 tokenId) public view returns (address) {
        address o = _owners[tokenId];
        require(o != address(0), "Token does not exist");
        return o;
    }
    function tokenURI(uint256 tokenId) external view returns (string memory) { return _tokenURIs[tokenId]; }
    function totalSupply() external view returns (uint256) { return _nextTokenId; }

    function mint(address to, string calldata uri) external onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _owners[tokenId] = to;
        _balances[to]++;
        _tokenURIs[tokenId] = uri;
        emit Transfer(address(0), to, tokenId);
        return tokenId;
    }

    function burn(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        _balances[msg.sender]--;
        delete _owners[tokenId];
        delete _tokenURIs[tokenId];
        emit Transfer(msg.sender, address(0), tokenId);
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf(tokenId) == from, "Not owner");
        require(msg.sender == from || _tokenApprovals[tokenId] == msg.sender || _operatorApprovals[from][msg.sender], "Not approved");
        _balances[from]--;
        _balances[to]++;
        _owners[tokenId] = to;
        delete _tokenApprovals[tokenId];
        emit Transfer(from, to, tokenId);
    }

    function approve(address to, uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        _tokenApprovals[tokenId] = to;
        emit Approval(msg.sender, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }
}
`;

const TPL_MULTISIG = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MultiSig Wallet
/// @notice M-of-N multisignature wallet. Owners submit and confirm transactions.
contract MultiSigWallet {
    address[] public owners;
    uint256 public required;
    uint256 public transactionCount;

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 confirmations;
    }

    mapping(uint256 => Transaction) public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmed;
    mapping(address => bool) public isOwner;

    event Deposit(address indexed sender, uint256 value);
    event Submit(uint256 indexed txId);
    event Confirm(address indexed owner, uint256 indexed txId);
    event Revoke(address indexed owner, uint256 indexed txId);
    event Execute(uint256 indexed txId);

    modifier onlyOwner() { require(isOwner[msg.sender], "Not owner"); _; }
    modifier txExists(uint256 txId) { require(txId < transactionCount, "Tx does not exist"); _; }
    modifier notExecuted(uint256 txId) { require(!transactions[txId].executed, "Already executed"); _; }

    constructor(address[] memory _owners, uint256 _required) {
        require(_owners.length > 0, "Owners required");
        require(_required > 0 && _required <= _owners.length, "Invalid required");
        for (uint256 i = 0; i < _owners.length; i++) {
            address o = _owners[i];
            require(o != address(0) && !isOwner[o], "Invalid owner");
            isOwner[o] = true;
            owners.push(o);
        }
        required = _required;
    }

    receive() external payable { emit Deposit(msg.sender, msg.value); }

    function submit(address to, uint256 value, bytes calldata data) external onlyOwner returns (uint256) {
        uint256 txId = transactionCount++;
        transactions[txId] = Transaction(to, value, data, false, 0);
        emit Submit(txId);
        return txId;
    }

    function confirm(uint256 txId) external onlyOwner txExists(txId) notExecuted(txId) {
        require(!confirmed[txId][msg.sender], "Already confirmed");
        confirmed[txId][msg.sender] = true;
        transactions[txId].confirmations++;
        emit Confirm(msg.sender, txId);
    }

    function execute(uint256 txId) external onlyOwner txExists(txId) notExecuted(txId) {
        Transaction storage t = transactions[txId];
        require(t.confirmations >= required, "Not enough confirmations");
        t.executed = true;
        (bool ok,) = t.to.call{value: t.value}(t.data);
        require(ok, "Execution failed");
        emit Execute(txId);
    }

    function revoke(uint256 txId) external onlyOwner txExists(txId) notExecuted(txId) {
        require(confirmed[txId][msg.sender], "Not confirmed");
        confirmed[txId][msg.sender] = false;
        transactions[txId].confirmations--;
        emit Revoke(msg.sender, txId);
    }

    function getOwners() external view returns (address[] memory) { return owners; }
    function getBalance() external view returns (uint256) { return address(this).balance; }
}
`;

const TPL_VAULT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Token Vault
/// @notice Deposit ERC-20 tokens, earn shares, withdraw proportionally.
interface IERC20 {
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

contract TokenVault {
    IERC20 public immutable token;
    address public owner;
    uint256 public totalShares;
    mapping(address => uint256) public shares;

    event Deposited(address indexed user, uint256 amount, uint256 sharesMinted);
    event Withdrawn(address indexed user, uint256 amount, uint256 sharesBurned);

    constructor(address _token) {
        token = IERC20(_token);
        owner = msg.sender;
    }

    function deposit(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        uint256 totalAssets = token.balanceOf(address(this));
        uint256 newShares = totalShares == 0
            ? amount
            : (amount * totalShares) / totalAssets;
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        shares[msg.sender] += newShares;
        totalShares += newShares;
        emit Deposited(msg.sender, amount, newShares);
    }

    function withdraw(uint256 shareAmount) external {
        require(shares[msg.sender] >= shareAmount, "Insufficient shares");
        uint256 totalAssets = token.balanceOf(address(this));
        uint256 amount = (shareAmount * totalAssets) / totalShares;
        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;
        require(token.transfer(msg.sender, amount), "Transfer failed");
        emit Withdrawn(msg.sender, amount, shareAmount);
    }

    function previewWithdraw(address user) external view returns (uint256) {
        if (totalShares == 0) return 0;
        return (shares[user] * token.balanceOf(address(this))) / totalShares;
    }
}
`;

const TPL_STAKING = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Simple Staking
/// @notice Stake ETH/native token and earn rewards distributed by owner.
contract SimpleStaking {
    address public owner;
    uint256 public totalStaked;
    uint256 public rewardPerShare; // scaled by 1e18
    uint256 public constant PRECISION = 1e18;

    struct StakeInfo {
        uint256 amount;
        uint256 rewardDebt;
        uint256 pendingRewards;
    }

    mapping(address => StakeInfo) public stakers;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event RewardAdded(uint256 amount);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    constructor() { owner = msg.sender; }

    function stake() external payable {
        require(msg.value > 0, "Must stake > 0");
        StakeInfo storage s = stakers[msg.sender];
        _settle(s);
        s.amount += msg.value;
        totalStaked += msg.value;
        emit Staked(msg.sender, msg.value);
    }

    function unstake(uint256 amount) external {
        StakeInfo storage s = stakers[msg.sender];
        require(s.amount >= amount, "Insufficient stake");
        _settle(s);
        s.amount -= amount;
        totalStaked -= amount;
        payable(msg.sender).transfer(amount);
        emit Unstaked(msg.sender, amount);
    }

    function claimRewards() external {
        StakeInfo storage s = stakers[msg.sender];
        _settle(s);
        uint256 reward = s.pendingRewards;
        require(reward > 0, "No rewards");
        s.pendingRewards = 0;
        payable(msg.sender).transfer(reward);
        emit RewardClaimed(msg.sender, reward);
    }

    function addReward() external payable onlyOwner {
        require(totalStaked > 0, "No stakers");
        rewardPerShare += (msg.value * PRECISION) / totalStaked;
        emit RewardAdded(msg.value);
    }

    function pendingReward(address user) external view returns (uint256) {
        StakeInfo storage s = stakers[user];
        uint256 pending = (s.amount * rewardPerShare) / PRECISION;
        return s.pendingRewards + (pending > s.rewardDebt ? pending - s.rewardDebt : 0);
    }

    function _settle(StakeInfo storage s) internal {
        uint256 earned = (s.amount * rewardPerShare) / PRECISION;
        if (earned > s.rewardDebt) s.pendingRewards += earned - s.rewardDebt;
        s.rewardDebt = (s.amount * rewardPerShare) / PRECISION;
    }
}
`;

const TPL_COUNTER = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Counter — contract paling sederhana untuk test deploy pertama kali
/// @notice Deploy tanpa constructor args. Cocok untuk testnet maupun mainnet.
contract Counter {
    uint256 public count;
    address public owner;

    event Incremented(address indexed by, uint256 newCount);
    event Reset(address indexed by);

    constructor() {
        owner = msg.sender;
    }

    function increment() external {
        count += 1;
        emit Incremented(msg.sender, count);
    }

    function incrementBy(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        count += amount;
        emit Incremented(msg.sender, count);
    }

    function reset() external {
        require(msg.sender == owner, "Only owner");
        count = 0;
        emit Reset(msg.sender);
    }

    function getCount() external view returns (uint256) {
        return count;
    }
}
`;

const TPL_FAUCET = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title TestFaucet — faucet native token untuk testing di testnet
/// @notice Owner deposit native token, pengguna claim sekali per 24 jam.
/// @dev Deploy di Arc Testnet, isi dengan test USDC/native, lalu bagikan ke tester.
contract TestFaucet {
    address public owner;
    uint256 public claimAmount;
    uint256 public cooldown; // detik antara claim
    mapping(address => uint256) public lastClaim;

    event Deposit(address indexed sender, uint256 amount);
    event Claimed(address indexed to, uint256 amount);
    event Withdrawn(address indexed owner, uint256 amount);
    event ClaimAmountUpdated(uint256 newAmount);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    constructor(uint256 _claimAmount, uint256 _cooldownSeconds) {
        owner = msg.sender;
        claimAmount = _claimAmount;
        cooldown = _cooldownSeconds;
    }

    receive() external payable { emit Deposit(msg.sender, msg.value); }

    function claim() external {
        require(block.timestamp >= lastClaim[msg.sender] + cooldown, "Cooldown active");
        require(address(this).balance >= claimAmount, "Faucet empty");
        lastClaim[msg.sender] = block.timestamp;
        payable(msg.sender).transfer(claimAmount);
        emit Claimed(msg.sender, claimAmount);
    }

    function canClaim(address user) external view returns (bool) {
        return block.timestamp >= lastClaim[user] + cooldown;
    }

    function nextClaimTime(address user) external view returns (uint256) {
        uint256 next = lastClaim[user] + cooldown;
        return next > block.timestamp ? next : block.timestamp;
    }

    function setClaimAmount(uint256 amount) external onlyOwner {
        claimAmount = amount;
        emit ClaimAmountUpdated(amount);
    }

    function withdraw() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "Nothing to withdraw");
        payable(owner).transfer(bal);
        emit Withdrawn(owner, bal);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
`;

const TPL_HELLO = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title HelloArc — contract test paling minimal untuk Arc Testnet & Mainnet
/// @notice Simpan dan baca pesan onchain. Tidak perlu gas besar.
contract HelloArc {
    string public message;
    address public owner;
    uint256 public updateCount;

    event MessageUpdated(address indexed by, string newMessage);

    constructor(string memory _message) {
        owner = msg.sender;
        message = _message;
    }

    function setMessage(string calldata _message) external {
        require(bytes(_message).length > 0, "Message cannot be empty");
        require(bytes(_message).length <= 280, "Message too long");
        message = _message;
        updateCount++;
        emit MessageUpdated(msg.sender, _message);
    }

    function getMessage() external view returns (string memory) {
        return message;
    }

    function getInfo() external view returns (address, uint256, string memory) {
        return (owner, updateCount, message);
    }
}
`;

const DEFAULT_FILES: FileEntry[] = [
  { name: "Counter.sol", content: TPL_COUNTER },
  { name: "HelloArc.sol", content: TPL_HELLO },
  { name: "TestFaucet.sol", content: TPL_FAUCET },
  { name: "ERC20Token.sol", content: TPL_ERC20 },
  { name: "ERC721NFT.sol", content: TPL_ERC721 },
  { name: "MultiSigWallet.sol", content: TPL_MULTISIG },
  { name: "TokenVault.sol", content: TPL_VAULT },
  { name: "SimpleStaking.sol", content: TPL_STAKING },
];

function loadFiles(): FileEntry[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as FileEntry[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_FILES;
}

interface PersistedContracts {
  byFile: Record<string, ActiveContract>;
  history: DeployRecord[];
}

function loadContracts(): PersistedContracts {
  try {
    const saved = localStorage.getItem(CONTRACTS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<PersistedContracts>;
      // Validasi shape — versi lama mungkin tidak punya byFile
      if (parsed && typeof parsed.byFile === "object" && parsed.byFile !== null) {
        return {
          byFile: parsed.byFile,
          history: Array.isArray(parsed.history) ? parsed.history : [],
        };
      }
    }
  } catch {
    // ignore
  }
  // Hapus data lama yang shape-nya salah
  try { localStorage.removeItem(CONTRACTS_KEY); } catch { /* ignore */ }
  return { byFile: {}, history: [] };
}

export default function App() {
  const [files, setFiles] = useState<FileEntry[]>(loadFiles);
  const [openFiles, setOpenFiles] = useState<string[]>(() => {
    const f = loadFiles();
    return f.length > 0 ? [f[0].name] : [];
  });
  const [activeFile, setActiveFile] = useState<string | null>(() => loadFiles()[0]?.name ?? null);
  const [address, setAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [chainKey, setChainKey] = useState(ARC_TESTNET.key);
  const [compiling, setCompiling] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [pendingDeploy, setPendingDeploy] = useState<{ abi: import("ethers").InterfaceAbi; bytecode: string; constructorInputs: { name: string; type: string }[] } | null>(null);
  const [constructorArgs, setConstructorArgs] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [deployHistory, setDeployHistory] = useState<DeployRecord[]>(() => loadContracts().history);
  const [contractsByFile, setContractsByFile] = useState<Record<string, ActiveContract>>(() => loadContracts().byFile);
  const [panelOpen, setPanelOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<"files" | "run" | "history" | "import" | null>("files");
  const [showMainnetModal, setShowMainnetModal] = useState(false);
  const [pendingChainKey, setPendingChainKey] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem("arc-ide-history-v1");
      if (saved) return JSON.parse(saved) as HistoryEntry[];
    } catch { /* ignore */ }
    return [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  }, [files]);

  useEffect(() => {
    localStorage.setItem(CONTRACTS_KEY, JSON.stringify({ byFile: contractsByFile, history: deployHistory }));
  }, [contractsByFile, deployHistory]);

  useEffect(() => {
    localStorage.setItem("arc-ide-history-v1", JSON.stringify(historyEntries));
  }, [historyEntries]);

  // Refresh signer setiap kali wallet berpindah network secara manual di MetaMask
  const refreshSigner = useCallback(async () => {
    const win = window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<unknown> } };
    if (!win.ethereum) return;
    try {
      const provider = new BrowserProvider(win.ethereum);
      const accounts = (await provider.send("eth_accounts", [])) as string[];
      if (accounts.length === 0) return;
      const newSigner = await provider.getSigner();
      setSigner(newSigner);
      setAddress(accounts[0]);
    } catch {
      // wallet mungkin terkunci, biarkan saja
    }
  }, []);

  useEffect(() => {
    const win = window as unknown as {
      ethereum?: {
        on: (event: string, handler: (...args: unknown[]) => void) => void;
        removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
      };
    };
    if (!win.ethereum) return;

    const onChainChanged = () => {
      // Chain berubah di MetaMask — refresh signer agar ikut network baru
      void refreshSigner();
    };
    const onAccountsChanged = (accs: unknown) => {
      const accounts = accs as string[];
      if (accounts.length === 0) {
        setAddress(null);
        setSigner(null);
      } else {
        void refreshSigner();
      }
    };

    win.ethereum.on("chainChanged", onChainChanged);
    win.ethereum.on("accountsChanged", onAccountsChanged);
    return () => {
      win.ethereum?.removeListener("chainChanged", onChainChanged);
      win.ethereum?.removeListener("accountsChanged", onAccountsChanged);
    };
  }, [refreshSigner]);

  const log = (text: string, type: LogEntry["type"] = "info", category = "info", explorerUrl?: string) =>
    setLogs((prev) => [...prev, { text, type, category, time: new Date().toLocaleTimeString(), explorerUrl }]);

  const activeContent = files.find((f) => f.name === activeFile)?.content ?? "";

  const updateContent = (value: string) => {
    setFiles((prev) => prev.map((f) => (f.name === activeFile ? { ...f, content: value } : f)));
  };

  const openFile = (name: string) => {
    if (!openFiles.includes(name)) setOpenFiles((p) => [...p, name]);
    setActiveFile(name);
  };

  const closeFile = (name: string) => {
    const remaining = openFiles.filter((n) => n !== name);
    setOpenFiles(remaining);
    if (activeFile === name) setActiveFile(remaining[0] ?? null);
  };

  const handleNewFile = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const finalName = trimmed.endsWith(".sol") ? trimmed : `${trimmed}.sol`;
    if (files.some((f) => f.name === finalName)) {
      log(`File ${finalName} already exists.`, "error");
      return;
    }
    const newFile: FileEntry = { name: finalName, content: "" };
    setFiles((prev) => [...prev, newFile]);
    openFile(finalName);
    log(`New file created: ${finalName}`);
  };

  const handleUpload = (name: string, content: string) => {
    setFiles((prev) => {
      const exists = prev.some((f) => f.name === name);
      return exists ? prev.map((f) => (f.name === name ? { ...f, content } : f)) : [...prev, { name, content }];
    });
    openFile(name);
    log(`File diupload: ${name}`);
  };

  const handleDownload = () => {
    if (!activeFile) return;
    const blob = new Blob([activeContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeFile;
    a.click();
    URL.revokeObjectURL(url);
    log(`File diunduh: ${activeFile}`);
  };

  const handleDeleteFile = (name: string) => {
    const remaining = files.filter((f) => f.name !== name);
    setFiles(remaining);
    setOpenFiles((prev) => prev.filter((n) => n !== name));
    if (activeFile === name) setActiveFile(remaining[0]?.name ?? null);
    log(`File deleted: ${name}`, "warn");
  };

  const handleConnect = async () => {
    try {
      const result = await connectWallet();
      setSigner(result.signer);
      setAddress(result.address);
      log(`Wallet connected: ${result.address}`, "success", "wallet");
    } catch (e: unknown) {
      log((e as Error).message, "error", "wallet");
    }
  };

  const handleDisconnect = () => {
    setSigner(null);
    setAddress(null);
    log("Wallet disconnected.", "info", "wallet");
  };

  /** Load contract dari history ke Run & Debug panel */
  const handleLoadFromHistory = (entry: HistoryEntry) => {
    setContractsByFile((prev) => ({
      ...prev,
      [entry.fileName]: {
        contractName: entry.contractName,
        address: entry.address,
        txHash: entry.txHash,
        network: entry.network,
        explorerBase: entry.explorerBase,
        abi: entry.abi,
        fileName: entry.fileName,
      },
    }));
    if (!openFiles.includes(entry.fileName)) {
      setOpenFiles((p) => [...p, entry.fileName]);
    }
    setActiveFile(entry.fileName);
    setPanelOpen(true);
    setActivePanel("files");
    log(`Loaded ${entry.contractName} from history.`, "info", "deploy");
  };

  /** Hapus entry dari history */
  const handleDeleteHistory = (address: string) => {
    setHistoryEntries((prev) => prev.filter((e) => e.address !== address));
  };

  /** Import contract by address + ABI */
  const handleImportContract = (params: {
    address: string;
    abi: import("ethers").InterfaceAbi;
    contractName: string;
    network: string;
    explorerBase: string;
  }) => {
    const virtualFileName = `${params.contractName}.imported.sol`;
    setContractsByFile((prev) => ({
      ...prev,
      [virtualFileName]: {
        contractName: params.contractName,
        address: params.address,
        txHash: "",
        network: params.network,
        explorerBase: params.explorerBase,
        abi: params.abi,
        fileName: virtualFileName,
      },
    }));
    // Buat file placeholder di editor supaya tab bisa dibuka
    if (!files.some((f) => f.name === virtualFileName)) {
      setFiles((prev) => [
        ...prev,
        {
          name: virtualFileName,
          content: `// Imported contract: ${params.contractName}\n// Address: ${params.address}\n// Network: ${params.network}\n// ABI imported manually\n`,
        },
      ]);
    }
    if (!openFiles.includes(virtualFileName)) {
      setOpenFiles((p) => [...p, virtualFileName]);
    }
    setActiveFile(virtualFileName);
    setPanelOpen(true);
    setActivePanel("files");
    log(`Imported ${params.contractName} (${params.address}).`, "success", "deploy");
  };

  const handleChainChange = async (key: string) => {
    if (key === "arc-mainnet") {
      setPendingChainKey(key);
      setShowMainnetModal(true);
      return;
    }
    await doChainSwitch(key);
  };

  const doChainSwitch = async (key: string) => {
    const chain = CHAINS.find((c) => c.key === key);
    if (!chain) return;
    setChainKey(key);
    try {
      await switchToChain(chain);
      await refreshSigner();
      log(`Switched to: ${chain.chainName}`, "success", "network");
    } catch (e: unknown) {
      log((e as Error).message, "error", "network");
    }
  };

  /** Fase 1: compile dan tampilkan form constructor args kalau ada */
  const handleDeploy = async () => {
    if (!activeFile) { log("Tidak ada file aktif.", "error", "deploy"); return; }
    if (!signer) { log("Hubungkan wallet dulu.", "error", "wallet"); return; }

    const chain = CHAINS.find((c) => c.key === chainKey) as ArcChain;

    // Verifikasi / switch network
    try {
      const network = await signer.provider?.getNetwork();
      const walletChainId = Number(network?.chainId ?? 0);
      if (walletChainId !== chain.chainIdDec) {
        log(`Mencoba switch ke ${chain.chainName}...`, "info", "network");
        await switchToChain(chain);
        await refreshSigner();
        log(`Berhasil pindah ke ${chain.chainName}`, "success", "network");
      }
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "";
      if (!msg.includes("provider")) { log(`Gagal switch network: ${msg}`, "error", "network"); return; }
    }

    setCompiling(true);
    let compiled: CompileResult;
    try {
      log(`Compiling ${activeFile}...`, "info", "compile");
      compiled = await compileContract(activeFile, activeContent);
      compiled.warnings.forEach((w) => log(w, "warn", "compile"));
      log(`Compiled: ${compiled.contractName}`, "success", "compile");
    } catch (e: unknown) {
      log(`Compile failed: ${(e as Error).message}`, "error", "compile");
      setCompiling(false);
      return;
    } finally {
      setCompiling(false);
    }

    // Cek apakah constructor punya inputs
    type AbiItem = { type: string; inputs?: { name: string; type: string }[] };
    const abiArr = compiled.abi as AbiItem[];
    const ctorInputs = abiArr.find((x) => x.type === "constructor")?.inputs ?? [];

    if (ctorInputs.length > 0) {
      // Ada constructor args — tampilkan form, tunggu user isi lalu klik "Confirm Deploy"
      setPendingDeploy({ abi: compiled.abi, bytecode: compiled.bytecode, constructorInputs: ctorInputs });
      setConstructorArgs({});
      setPanelOpen(true);
      log(`Contract has ${ctorInputs.length} constructor argument(s). Fill in the form in the Run & Debug panel then click "Confirm Deploy".`, "info", "deploy");
      return;
    }

    // Tidak ada constructor args — langsung deploy
    await executeDeploy(compiled.abi, compiled.bytecode, compiled.contractName, [], chain);
  };

  /** Fase 2: kirim transaksi deploy setelah args diisi */
  const handleConfirmDeploy = async () => {
    if (!pendingDeploy || !signer || !activeFile) return;
    const chain = CHAINS.find((c) => c.key === chainKey) as ArcChain;
    const args = pendingDeploy.constructorInputs.map((inp) => {
      const raw = constructorArgs[inp.name] ?? "";
      const t = inp.type.toLowerCase();
      if (t === "bool") return raw === "true" || raw === "1";
      if (t.startsWith("uint") || t.startsWith("int")) return raw.trim() === "" ? 0n : BigInt(raw.trim());
      if (t.includes("[]")) { try { return JSON.parse(raw) as unknown; } catch { return raw.split(",").map((v) => v.trim()); } }
      return raw;
    });
    const compiled = pendingDeploy;

    // Dapatkan nama contract dari ABI — fallback ke nama file
    type AbiItem = { type: string; name?: string };
    const abiArr = compiled.abi as AbiItem[];
    const ctorName = abiArr.find((x) => x.type === "constructor")?.name ?? activeFile.replace(".sol", "");

    setPendingDeploy(null);
    await executeDeploy(compiled.abi, compiled.bytecode, ctorName, args, chain);
  };

  const executeDeploy = async (
    abi: import("ethers").InterfaceAbi,
    bytecode: string,
    contractName: string,
    args: unknown[],
    chain: ArcChain,
  ) => {
    if (!signer || !activeFile) return;
    setDeploying(true);
    try {
      log("Mengirim transaksi deploy ke wallet...", "info", "deploy");
      const { address: contractAddress, txHash } = await deployContract({ abi, bytecode, signer, constructorArgs: args });
      const explorerBase = chain.blockExplorerUrls[0];
      const explorerUrl = `${explorerBase}/tx/${txHash}`;
      log(`Deployed: ${contractAddress}`, "success", "deploy", explorerUrl);
      log(`Tx: ${txHash}`, "info", "deploy", explorerUrl);

      setDeployHistory((prev) => [{ contractName, address: contractAddress, txHash, network: chain.chainName, explorerBase, timestamp: new Date().toLocaleTimeString() }, ...prev]);
      setContractsByFile((prev) => ({
        ...prev,
        [activeFile]: { contractName, address: contractAddress, txHash, network: chain.chainName, explorerBase, abi, fileName: activeFile },
      }));
      // Tambah ke history entries permanen
      setHistoryEntries((prev) => [
        { contractName, fileName: activeFile, address: contractAddress, txHash, network: chain.chainName, explorerBase, abi, deployedAt: new Date().toISOString() },
        ...prev.filter((e) => e.address !== contractAddress),
      ]);
      setPanelOpen(true);
    } catch (e: unknown) {
      log(`Deploy failed: ${(e as Error).message}`, "error", "deploy");
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div
      className="flex flex-col"
      style={{ height: "100dvh", background: "var(--bg)", color: "var(--ink)" }}
    >
      {/* Mainnet warning modal */}
      {showMainnetModal && (
        <MainnetWarningModal
          onConfirm={() => {
            setShowMainnetModal(false);
            if (pendingChainKey) void doChainSwitch(pendingChainKey);
            setPendingChainKey(null);
          }}
          onCancel={() => {
            setShowMainnetModal(false);
            setPendingChainKey(null);
          }}
        />
      )}

      {/* Top bar */}
      <IdeTopBar
        address={address}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        selectedChainKey={chainKey}
        onChainChange={handleChainChange}
      />

      {/* Main layout */}
      <div className="flex flex-1 min-h-0">
        {/* Activity bar — icon-only kiri */}
        <IdeActivityBar
          activePanel={activePanel}
          onSelect={setActivePanel}
        />

        {/* File panel */}
        {activePanel === "files" && (
          <IdeFilePanel
            files={files}
            activeFile={activeFile}
            onSelect={openFile}
            onNewFile={handleNewFile}
            onUpload={handleUpload}
            onDownload={handleDownload}
            onDelete={handleDeleteFile}
          />
        )}

        {/* Contract History panel */}
        {activePanel === "history" && (
          <IdeHistoryPanel
            history={historyEntries}
            onLoad={handleLoadFromHistory}
            onDelete={handleDeleteHistory}
          />
        )}

        {/* Import Contract panel */}
        {activePanel === "import" && (
          <IdeImportPanel
            onImport={handleImportContract}
            selectedNetwork={CHAINS.find((c) => c.key === chainKey)?.chainName ?? chainKey}
            explorerBase={CHAINS.find((c) => c.key === chainKey)?.blockExplorerUrls[0] ?? ""}
          />
        )}

        {/* Editor area */}
        <div className="flex flex-col flex-1 min-w-0" style={{ background: "var(--bg)" }}>
          {/* Tabs */}
          <IdeTabBar
            openFiles={openFiles}
            activeFile={activeFile}
            onSelect={setActiveFile}
            onClose={closeFile}
            panelOpen={panelOpen}
            onTogglePanel={() => setPanelOpen((v) => !v)}
            onDeploy={() => { void handleDeploy(); }}
            deploying={deploying}
            compiling={compiling}
            hasWallet={!!signer}
          />

          {/* Editor */}
          <div className="flex-1 min-h-0">
            {activeFile ? (
              <IdeEditor value={activeContent} onChange={updateContent} fileName={activeFile} />
            ) : (
              <div
                className="flex flex-col items-center justify-center h-full text-sm"
                style={{ color: "var(--subtle)" }}
              >
                <p>Select a file from the sidebar or create a new contract</p>
              </div>
            )}
          </div>

          {/* Logs */}
          <IdeLogsPanel logs={logs} onClear={() => setLogs([])} />
        </div>

        {/* Run & Debug panel kanan — hanya muncul setelah deploy berhasil */}
        {panelOpen && activeFile && (contractsByFile[activeFile] || pendingDeploy) && (
          <IdeContractPanel
            contract={activeFile ? (contractsByFile[activeFile] ?? null) : null}
            signer={signer}
            onLog={log}
            onClose={() => setPanelOpen(false)}
            onDeploy={handleDeploy}
            onConfirmDeploy={handleConfirmDeploy}
            deploying={deploying}
            compiling={compiling}
            pendingDeploy={pendingDeploy}
            constructorArgs={constructorArgs}
            onConstructorArgChange={(name, val) => setConstructorArgs((p) => ({ ...p, [name]: val }))}
          />
        )}
      </div>
    </div>
  );
}
