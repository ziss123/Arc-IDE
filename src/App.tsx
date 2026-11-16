import { useState, useEffect, useCallback, useRef } from "react";
import IdeTopBar from "./components/IdeTopBar";
import IdeActivityBar from "./components/IdeActivityBar";
import IdeFilePanel from "./components/IdeFilePanel";
import IdeTabBar from "./components/IdeTabBar";
import IdeEditor from "./components/IdeEditor";
import IdeLogsPanel, { type LogEntry } from "./components/IdeLogsPanel";
import IdeContractPanel from "./components/IdeContractPanel";
import IdeHistoryPanel, { type HistoryEntry } from "./components/IdeHistoryPanel";
import { connectWallet, hasWallet, switchToChain, type EvmChain } from "./lib/wallet";
import {
  compileContract,
  deployContract,
  estimateDeployment,
  CompileFailure,
  type CompileDiagnostic,
  type CompileResult,
} from "./lib/compileAndDeploy";
import { coerceArg, type AbiParameter } from "./lib/contractInteract";
import { CHAINS, QMS_TESTNET } from "./lib/chains";
import { BrowserProvider } from "ethers";
import type { JsonRpcSigner, InterfaceAbi } from "ethers";
import type * as monacoEditor from "monaco-editor";
import { readBooleanPreference, writePreference } from "./lib/preferences";

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

const STORAGE_KEY = "qms-ide-files-v1";
const CONTRACTS_KEY = "qms-ide-contracts-v1";
const HISTORY_KEY = "qms-ide-history-v1";
const WORKSPACE_FORMAT = "qms-ide-workspace";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const _TPL_ERC20 = `// SPDX-License-Identifier: MIT
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

const _TPL_ERC721 = `// SPDX-License-Identifier: MIT
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

const _TPL_MULTISIG = `// SPDX-License-Identifier: MIT
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

const _TPL_VAULT = `// SPDX-License-Identifier: MIT
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

const _TPL_STAKING = `// SPDX-License-Identifier: MIT
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

const _TPL_COUNTER = `// SPDX-License-Identifier: MIT
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

const _TPL_FAUCET = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title TestFaucet — faucet native token untuk testing di testnet
/// @notice Owner deposit native token, pengguna claim sekali per 24 jam.
/// @dev Deploy di QMS Testnet, isi dengan test QMS, lalu bagikan ke tester.
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

/// @title HelloQMS — a minimal contract for QMS Testnet
/// @notice Store and read an on-chain message.
contract HelloQMS {
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

const DEFAULT_FILES: FileEntry[] = [{ name: "HelloQMS.sol", content: TPL_HELLO }];

function loadFiles(): FileEntry[] {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) {
      const parsed: unknown = JSON.parse(current);
      if (Array.isArray(parsed)) {
        return parsed.filter((file): file is FileEntry =>
          !!file &&
          typeof file === "object" &&
          "name" in file &&
          typeof file.name === "string" &&
          "content" in file &&
          typeof file.content === "string"
        );
      }
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return DEFAULT_FILES;
}

interface PersistedContracts {
  byFile: Record<string, ActiveContract>;
  history: DeployRecord[];
}

function parseAbiParameter(value: unknown): AbiParameter | null {
  if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string") {
    return null;
  }
  const input = value as { name?: unknown; type: string; components?: unknown };
  const components = Array.isArray(input.components)
    ? input.components.map(parseAbiParameter).filter((item): item is AbiParameter => item !== null)
    : undefined;
  return {
    name: typeof input.name === "string" ? input.name : "",
    type: input.type,
    ...(components ? { components } : {}),
  };
}

function getConstructorInputs(abi: InterfaceAbi): AbiParameter[] {
  const fragments: unknown[] = Array.isArray(abi) ? abi : [];
  const constructor = fragments.find((item) =>
    typeof item === "object" && item !== null && "type" in item && item.type === "constructor"
  );
  if (!constructor || typeof constructor !== "object" || !("inputs" in constructor) || !Array.isArray(constructor.inputs)) {
    return [];
  }
  return constructor.inputs
    .map(parseAbiParameter)
    .filter((input): input is AbiParameter => input !== null);
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
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | "error">("saved");
  const [openFiles, setOpenFiles] = useState<string[]>(() => {
    const f = loadFiles();
    return f.length > 0 ? [f[0].name] : [];
  });
  const [activeFile, setActiveFile] = useState<string | null>(() => loadFiles()[0]?.name ?? null);
  const [address, setAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [chainKey, setChainKey] = useState(QMS_TESTNET.key);
  const [compiling, setCompiling] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [pendingDeploy, setPendingDeploy] = useState<{
    contractName: string;
    fileName: string;
    chainKey: string;
    abi: InterfaceAbi;
    bytecode: string;
    constructorInputs: AbiParameter[];
    deployer: string;
    gasEstimate: string | null;
    estimatedCost: string | null;
  } | null>(null);
  const [estimatingDeploy, setEstimatingDeploy] = useState(false);
  const [constructorArgs, setConstructorArgs] = useState<Record<string, string>>({});
  const [compilerDiagnostics, setCompilerDiagnostics] = useState<CompileDiagnostic[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [deployHistory, setDeployHistory] = useState<DeployRecord[]>(() => loadContracts().history);
  const [contractsByFile, setContractsByFile] = useState<Record<string, ActiveContract>>(() => loadContracts().byFile);
  const [panelOpen, setPanelOpen] = useState(() => readBooleanPreference("qms-ide-run-open", true));
  const [activePanel, setActivePanel] = useState<"files" | "run" | "history" | null>("files");
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) return JSON.parse(saved) as HistoryEntry[];
    } catch { /* ignore */ }
    return [];
  });
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);

  const log = useCallback((
    text: string,
    type: LogEntry["type"] = "info",
    category = "info",
    explorerUrl?: string,
    diagnostic?: CompileDiagnostic,
  ) => setLogs((prev) => [
    ...prev,
    { text, type, category, time: new Date().toLocaleTimeString(), explorerUrl, diagnostic },
  ].slice(-500)), []);

  useEffect(() => {
    setSaveStatus("saving");
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
        setSaveStatus("saved");
      } catch (error: unknown) {
        setSaveStatus("error");
        log(`Could not save workspace: ${errorMessage(error)}`, "error", "info");
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [files, log]);

  useEffect(() => {
    localStorage.setItem(CONTRACTS_KEY, JSON.stringify({ byFile: contractsByFile, history: deployHistory }));
  }, [contractsByFile, deployHistory]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyEntries));
  }, [historyEntries]);

  useEffect(() => {
    writePreference("qms-ide-run-open", panelOpen);
  }, [panelOpen]);

  // Refresh the signer whenever the wallet account or network changes.
  const refreshSigner = useCallback(async (): Promise<JsonRpcSigner | null> => {
    const win = window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<unknown> } };
    if (!win.ethereum) {
      setSigner(null);
      setAddress(null);
      return null;
    }
    const provider = new BrowserProvider(win.ethereum);
    const accounts = (await provider.send("eth_accounts", [])) as string[];
    if (accounts.length === 0) {
      setSigner(null);
      setAddress(null);
      return null;
    }
    const newSigner = await provider.getSigner();
    setSigner(newSigner);
    setAddress(accounts[0]);
    return newSigner;
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
      // Keep the app's selected target separate from a manual wallet network change.
      void refreshSigner().catch((error: unknown) => {
        log(`Could not refresh wallet after network change: ${errorMessage(error)}`, "error", "wallet");
      });
    };
    const onAccountsChanged = (accs: unknown) => {
      const accounts = accs as string[];
      if (accounts.length === 0) {
        setAddress(null);
        setSigner(null);
      } else {
        void refreshSigner().catch((error: unknown) => {
          log(`Could not refresh the connected wallet: ${errorMessage(error)}`, "error", "wallet");
        });
      }
    };

    win.ethereum.on("chainChanged", onChainChanged);
    win.ethereum.on("accountsChanged", onAccountsChanged);
    return () => {
      win.ethereum?.removeListener("chainChanged", onChainChanged);
      win.ethereum?.removeListener("accountsChanged", onAccountsChanged);
    };
  }, [refreshSigner, log]);

  const activeContent = files.find((f) => f.name === activeFile)?.content ?? "";

  const updateContent = (value: string) => {
    setFiles((prev) => prev.map((f) => (f.name === activeFile ? { ...f, content: value } : f)));
    setCompilerDiagnostics([]);
    setPendingDeploy(null);
    setConstructorArgs({});
  };

  const openFile = (name: string) => {
    if (!openFiles.includes(name)) setOpenFiles((p) => [...p, name]);
    setActiveFile(name);
    if (pendingDeploy && pendingDeploy.fileName !== name) setPendingDeploy(null);
    setCompilerDiagnostics([]);
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

  const handleDownload = () => {
    if (!activeFile) return;
    const blob = new Blob([activeContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeFile;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    log(`File downloaded: ${activeFile}`);
  };

  const handleImportWorkspace = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      log("Workspace backup exceeds the 10 MB import limit.", "error");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("format" in parsed) ||
        parsed.format !== WORKSPACE_FORMAT ||
        !("version" in parsed) ||
        parsed.version !== 1 ||
        !("files" in parsed) ||
        !Array.isArray(parsed.files) ||
        parsed.files.length > 500
      ) {
        throw new Error("This file is not a supported QMS IDE workspace backup.");
      }
      const imported = parsed.files.filter((entry): entry is FileEntry =>
        !!entry &&
        typeof entry === "object" &&
        "name" in entry &&
        typeof entry.name === "string" &&
        entry.name.length > 0 &&
        entry.name.length <= 255 &&
        !/[\\/]/.test(entry.name) &&
        "content" in entry &&
        typeof entry.content === "string"
      );
      if (imported.length !== parsed.files.length) {
        throw new Error("The backup contains invalid file entries.");
      }
      if (new Set(imported.map((entry) => entry.name)).size !== imported.length) {
        throw new Error("The backup contains duplicate file names.");
      }
      if (!window.confirm(`Replace the current workspace with ${imported.length} imported file(s)?`)) return;
      setFiles(imported);
      setOpenFiles(imported[0] ? [imported[0].name] : []);
      setActiveFile(imported[0]?.name ?? null);
      setCompilerDiagnostics([]);
      log(`Workspace imported (${imported.length} file${imported.length === 1 ? "" : "s"}).`, "success");
    } catch (error: unknown) {
      log(`Workspace import failed: ${errorMessage(error)}`, "error");
    }
  };

  const handleDeleteFile = (name: string) => {
    const remaining = files.filter((f) => f.name !== name);
    setFiles(remaining);
    setOpenFiles((prev) => prev.filter((n) => n !== name));
    if (activeFile === name) setActiveFile(remaining[0]?.name ?? null);
    if (pendingDeploy?.fileName === name) setPendingDeploy(null);
    log(`File deleted: ${name}`, "warn");
  };

  const handleConnect = async () => {
    try {
      const result = await connectWallet();
      setSigner(result.signer);
      setAddress(result.address);
      log(`Wallet connected: ${result.address}`, "success", "wallet");
    } catch (e: unknown) {
      log(errorMessage(e), "error", "wallet");
    }
  };

  const handleDisconnect = () => {
    setSigner(null);
    setAddress(null);
    log("Wallet disconnected.", "info", "wallet");
  };

  /** Load a contract from history into the Run & Debug panel. */
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

  /** Remove an entry from history. */
  const handleDeleteHistory = (network: string, address: string) => {
    setHistoryEntries((prev) => prev.filter((entry) =>
      entry.network !== network || entry.address.toLowerCase() !== address.toLowerCase()
    ));
  };

  const handleChainChange = async (key: string) => {
    await doChainSwitch(key);
  };

  const doChainSwitch = async (key: string) => {
    const chain = CHAINS.find((c) => c.key === key);
    if (!chain) return false;
    if (!hasWallet()) {
      setChainKey(key);
      log(`${chain.chainName} selected. Connect a wallet to send transactions.`, "info", "network");
      return true;
    }
    try {
      await switchToChain(chain);
      setChainKey(key);
      await refreshSigner();
      log(`Switched to: ${chain.chainName}`, "success", "network");
      return true;
    } catch (e: unknown) {
      const message = `Wallet network switch failed: ${errorMessage(e)}`;
      log(message, "error", "network");
      return false;
    }
  };

  /** Phase 1: compile and show the constructor-argument form when needed. */
  const handleDeploy = async () => {
    if (!activeFile) { log("No active file selected.", "error", "deploy"); return; }
    setPendingDeploy(null);
    setCompilerDiagnostics([]);
    const chain = CHAINS.find((c) => c.key === chainKey);
    if (!chain) { log("The selected network is not supported.", "error", "network"); return; }

    let deploymentSigner: JsonRpcSigner | null;
    let deployerAddress: string;
    try {
      deploymentSigner = await refreshSigner();
      if (!deploymentSigner) {
        log("Connect a wallet before deploying a contract.", "error", "wallet");
        return;
      }
      let walletNetwork = await deploymentSigner.provider.getNetwork();
      if (walletNetwork.chainId !== BigInt(chain.chainIdDec)) {
        log(`Switching to ${chain.chainName}...`, "info", "network");
        await switchToChain(chain);
        deploymentSigner = await refreshSigner();
        if (!deploymentSigner) throw new Error("The wallet disconnected while switching networks.");
        walletNetwork = await deploymentSigner.provider.getNetwork();
        if (walletNetwork.chainId !== BigInt(chain.chainIdDec)) {
          throw new Error(`The wallet is not connected to ${chain.chainName}.`);
        }
        log(`Switched to ${chain.chainName}.`, "success", "network");
      }
      deployerAddress = await deploymentSigner.getAddress();
    } catch (e: unknown) {
      log(`Could not prepare the wallet for deployment: ${errorMessage(e)}`, "error", "network");
      return;
    }

    setCompiling(true);
    let compiled: CompileResult;
    try {
      log(`Compiling ${activeFile}...`, "info", "compile");
      compiled = await compileContract(activeFile, activeContent);
      setCompilerDiagnostics(compiled.diagnostics);
      compiled.warnings.forEach((w) => log(w, "warn", "compile"));
      log(`Compiled: ${compiled.contractName}`, "success", "compile");
    } catch (e: unknown) {
      if (e instanceof CompileFailure) {
        setCompilerDiagnostics(e.diagnostics);
        const located = e.diagnostics.filter((diagnostic) => diagnostic.line !== undefined);
        if (located.length > 0) {
          e.diagnostics.forEach((diagnostic) => {
            log(
              diagnostic.line
                ? `Line ${diagnostic.line}, column ${diagnostic.column ?? 1}: ${diagnostic.message}`
                : diagnostic.message,
              "error",
              "compile",
              undefined,
              diagnostic.line ? diagnostic : undefined,
            );
          });
        } else {
          log(`Compile failed: ${e.message}`, "error", "compile");
        }
      } else {
        setCompilerDiagnostics([]);
        log(`Compile failed: ${errorMessage(e)}`, "error", "compile");
      }
      return;
    } finally {
      setCompiling(false);
    }

    const ctorInputs = getConstructorInputs(compiled.abi);

    setPendingDeploy({
      contractName: compiled.contractName,
      fileName: activeFile,
      chainKey: chain.key,
      abi: compiled.abi,
      bytecode: compiled.bytecode,
      constructorInputs: ctorInputs,
      deployer: deployerAddress,
      gasEstimate: null,
      estimatedCost: null,
    });
    setConstructorArgs({});
    setPanelOpen(true);
    log(
      ctorInputs.length > 0
        ? `Contract compiled with ${ctorInputs.length} constructor argument(s). Review the inputs and estimate gas before deploying.`
        : "Contract compiled. Review the deployment and estimate gas before deploying.",
      "info",
      "deploy",
    );
  };

  const navigateToDiagnostic = (diagnostic: CompileDiagnostic) => {
    const targetFile = diagnostic.fileName;
    if (targetFile && files.some((file) => file.name === targetFile)) {
      setActiveFile(targetFile);
      setOpenFiles((current) => current.includes(targetFile) ? current : [...current, targetFile]);
    }
    if (!diagnostic.line) return;
    window.requestAnimationFrame(() => {
      editorRef.current?.revealLineInCenter(diagnostic.line!);
      editorRef.current?.setPosition({
        lineNumber: diagnostic.line!,
        column: diagnostic.column ?? 1,
      });
      editorRef.current?.focus();
    });
  };

  /** Estimate first; a second confirmation sends the deployment transaction. */
  const handleConfirmDeploy = async () => {
    if (!pendingDeploy) return;
    const chain = CHAINS.find((c) => c.key === pendingDeploy.chainKey);
    if (!chain) { log("The selected network is not supported.", "error", "network"); return; }

    let args: unknown[];
    try {
      args = pendingDeploy.constructorInputs.map((input, index) =>
        coerceArg(constructorArgs[String(index)] ?? "", input.type, input.components)
      );
    } catch (error: unknown) {
      log(`Invalid constructor argument: ${errorMessage(error)}`, "error", "deploy");
      return;
    }

    const signerForDeploy = await refreshSigner().catch((error: unknown) => {
      log(`Could not refresh the connected wallet: ${errorMessage(error)}`, "error", "wallet");
      return null;
    });
    if (!signerForDeploy) {
      log("Connect a wallet before deploying a contract.", "error", "wallet");
      return;
    }
    const walletNetwork = await signerForDeploy.provider.getNetwork().catch((error: unknown) => {
      log(`Could not read the wallet network: ${errorMessage(error)}`, "error", "network");
      return null;
    });
    if (!walletNetwork || walletNetwork.chainId !== BigInt(chain.chainIdDec)) {
      log(`Switch your wallet to ${chain.chainName} before confirming deployment.`, "error", "network");
      return;
    }
    let deployerAddress: string;
    try {
      deployerAddress = await signerForDeploy.getAddress();
    } catch (error: unknown) {
      log(`Could not read the deployment wallet address: ${errorMessage(error)}`, "error", "wallet");
      return;
    }

    if (pendingDeploy.gasEstimate && pendingDeploy.deployer.toLowerCase() !== deployerAddress.toLowerCase()) {
      setPendingDeploy((current) => current
        ? { ...current, deployer: deployerAddress, gasEstimate: null, estimatedCost: null }
        : current);
      log("The connected wallet changed. Estimate gas again to review this deployment.", "warn", "deploy");
      return;
    }

    if (!pendingDeploy.gasEstimate) {
      setEstimatingDeploy(true);
      try {
        const estimate = await estimateDeployment({
          abi: pendingDeploy.abi,
          bytecode: pendingDeploy.bytecode,
          signer: signerForDeploy,
          constructorArgs: args,
          decimals: chain.nativeCurrency.decimals,
        });
        setPendingDeploy((current) => current && current.fileName === pendingDeploy.fileName
          ? {
            ...current,
            deployer: deployerAddress,
            gasEstimate: estimate.gas.toString(),
            estimatedCost: estimate.cost,
          }
          : current);
        log(
          `Deployment estimate: ${estimate.gas.toString()} gas${estimate.cost ? `, approximately ${estimate.cost} ${chain.nativeCurrency.symbol}` : ""}. Review the details, then confirm deployment.`,
          "success",
          "deploy",
        );
      } catch (error: unknown) {
        log(`Could not estimate deployment gas: ${errorMessage(error)}`, "error", "deploy");
      } finally {
        setEstimatingDeploy(false);
      }
      return;
    }

    const succeeded = await executeDeploy(
      pendingDeploy.abi,
      pendingDeploy.bytecode,
      pendingDeploy.contractName,
      args,
      chain,
      pendingDeploy.fileName,
      signerForDeploy,
    );
    if (succeeded) {
      setPendingDeploy(null);
      setConstructorArgs({});
    }
  };

  const executeDeploy = async (
    abi: import("ethers").InterfaceAbi,
    bytecode: string,
    contractName: string,
    args: unknown[],
    chain: EvmChain,
    fileName: string,
    deploymentSigner: JsonRpcSigner | null,
  ): Promise<boolean> => {
    if (!deploymentSigner || !fileName) return false;
    setDeploying(true);
    try {
      const walletNetwork = await deploymentSigner.provider.getNetwork();
      if (walletNetwork.chainId !== BigInt(chain.chainIdDec)) {
        throw new Error(`Switch your wallet to ${chain.chainName} before deploying.`);
      }
      log("Sending deployment transaction to wallet...", "info", "deploy");
      const { address: contractAddress, txHash } = await deployContract({
        abi,
        bytecode,
        signer: deploymentSigner,
        constructorArgs: args,
        onTransactionSent: (hash) => {
          log(`Deployment transaction submitted: ${hash}`, "info", "deploy", `${chain.blockExplorerUrls[0]}/tx/${hash}`);
        },
      });
      if (!txHash) throw new Error("Deployment was mined without a transaction hash.");
      const explorerBase = chain.blockExplorerUrls[0];
      const explorerUrl = `${explorerBase}/tx/${txHash}`;
      log(`Deployed: ${contractAddress}`, "success", "deploy", explorerUrl);
      log(`Tx: ${txHash}`, "info", "deploy", explorerUrl);

      setDeployHistory((prev) => [
        {
          contractName,
          address: contractAddress,
          txHash,
          network: chain.chainName,
          explorerBase,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev.filter((entry) =>
          entry.network !== chain.chainName || entry.address.toLowerCase() !== contractAddress.toLowerCase()
        ),
      ]);
      setContractsByFile((prev) => ({
        ...prev,
        [fileName]: { contractName, address: contractAddress, txHash, network: chain.chainName, explorerBase, abi, fileName },
      }));
      // Tambah ke history entries permanen
      setHistoryEntries((prev) => [
        { contractName, fileName, address: contractAddress, txHash, network: chain.chainName, explorerBase, abi, deployedAt: new Date().toISOString() },
        ...prev.filter((entry) =>
          entry.network !== chain.chainName || entry.address.toLowerCase() !== contractAddress.toLowerCase()
        ),
      ]);
      setPanelOpen(true);
      return true;
    } catch (e: unknown) {
      log(`Deploy failed: ${errorMessage(e)}`, "error", "deploy");
      return false;
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div
      className="flex flex-col"
      style={{ height: "100dvh", background: "var(--bg)", color: "var(--ink)" }}
    >
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
        <IdeActivityBar activePanel={activePanel} onSelect={setActivePanel} />

        {activePanel === "history" ? (
          <IdeHistoryPanel
            history={historyEntries}
            onLoad={handleLoadFromHistory}
            onDelete={handleDeleteHistory}
          />
        ) : (
          <>
            {/* File panel */}
            {activePanel === "files" && (
              <IdeFilePanel
                files={files}
                activeFile={activeFile}
                onSelect={openFile}
                onNewFile={handleNewFile}
                onDownload={handleDownload}
                onDelete={handleDeleteFile}
                onImportWorkspace={(file) => { void handleImportWorkspace(file); }}
              />
            )}

            {/* Editor area */}
            <div className="flex flex-col flex-1 min-w-0" style={{ background: "var(--bg)" }}>
          {/* Tabs */}
          <IdeTabBar
            openFiles={openFiles}
            activeFile={activeFile}
            onSelect={(name) => {
              setActiveFile(name);
              if (pendingDeploy && pendingDeploy.fileName !== name) setPendingDeploy(null);
              setCompilerDiagnostics([]);
            }}
            onClose={closeFile}
            panelOpen={panelOpen}
            onTogglePanel={() => setPanelOpen((v) => !v)}
            onDeploy={() => { void handleDeploy(); }}
            deploying={deploying}
            compiling={compiling}
            hasWallet={!!signer}
            saveStatus={saveStatus}
          />

          {/* Editor */}
          <div className="flex-1 min-h-0">
            {activeFile ? (
              <IdeEditor
                value={activeContent}
                onChange={updateContent}
                onPasteError={(message) => log(`Paste failed: ${message}`, "error", "info")}
                diagnostics={compilerDiagnostics}
                onEditorMount={(editor) => { editorRef.current = editor; }}
                fileName={activeFile}
              />
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
          <IdeLogsPanel
            logs={logs}
            onClear={() => setLogs([])}
            onNavigateToDiagnostic={navigateToDiagnostic}
          />
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
                estimatingDeploy={estimatingDeploy}
                compiling={compiling}
                pendingDeploy={pendingDeploy}
                constructorArgs={constructorArgs}
                onConstructorArgChange={(name, val) => {
                  setConstructorArgs((prev) => ({ ...prev, [name]: val }));
                  setPendingDeploy((pending) => pending
                    ? { ...pending, gasEstimate: null, estimatedCost: null }
                    : pending);
                }}
              />
            )}
          </>
        )}
      </div>
      <div
        className="flex items-center justify-between px-2 shrink-0"
        style={{ height: 24, background: "#0d0916", color: "var(--ink-2)", fontSize: 11, borderTop: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-medium">QMS IDE</span>
          <span>{CHAINS.find((chain) => chain.key === chainKey)?.chainName ?? chainKey}</span>
          <span>{address ? "Wallet connected" : "No wallet connected"}</span>
          <span role="status" aria-live="polite" style={{ color: saveStatus === "error" ? "var(--danger)" : "var(--muted)" }}>
            {saveStatus === "saving" ? "Saving..." : saveStatus === "error" ? "Save failed" : "All changes saved"}
          </span>
        </div>
        <span className="mono">{activeFile?.endsWith(".sol") ? "Solidity" : activeFile?.split(".").pop() ?? "Ready"}</span>
      </div>
    </div>
  );
}
