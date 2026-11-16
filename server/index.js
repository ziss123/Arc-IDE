import express from "express";
import cors from "cors";
import solc from "solc";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const NODE_MODULES = path.join(ROOT, "node_modules");

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

/** Resolve Solidity imports from node_modules or the project root. */
function findImports(importPath) {
  // Coba langsung dari node_modules
  const candidates = [
    path.join(NODE_MODULES, importPath),
    path.join(ROOT, importPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        return { contents: fs.readFileSync(candidate, "utf8") };
      } catch {
        return { error: `Unable to read import: ${candidate}` };
      }
    }
  }
  return { error: `Import not found: ${importPath}` };
}

app.post("/compile", (req, res) => {
  const { fileName = "Contract.sol", source } = req.body ?? {};
  if (typeof source !== "string" || !source.trim()) {
    return res.status(400).json({ error: "Solidity source must be a non-empty string." });
  }
  if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 255) {
    return res.status(400).json({ error: "fileName must be a non-empty string no longer than 255 characters." });
  }

  const input = {
    language: "Solidity",
    sources: { [fileName]: { content: source } },
    settings: {
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      optimizer: { enabled: true, runs: 200 },
    },
  };

  let output;
  try {
    output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  } catch (e) {
    console.error("Solidity compiler failed:", e);
    return res.status(500).json({
      error: "The Solidity compiler could not process this request.",
      details: e instanceof Error ? e.message : String(e),
    });
  }

  const errors = (output.errors || []).filter((e) => e.severity === "error");
  if (errors.length) {
    return res.status(400).json({
      errors: errors.map((e) => e.formattedMessage),
      diagnostics: errors.map((e) => ({
        severity: e.severity,
        message: e.message,
        fileName: e.sourceLocation?.file,
        start: e.sourceLocation?.start,
        end: e.sourceLocation?.end,
      })),
    });
  }

  const contracts = output.contracts?.[fileName];
  if (!contracts || Object.keys(contracts).length === 0) {
    // Kadang fileName != contractName untuk multi-file import — ambil dari semua output
    const allContracts = output.contracts ?? {};
    let contractName = null;
    let compiled = null;
    for (const file of Object.values(allContracts)) {
      for (const [name, data] of Object.entries(file)) {
        if (data.evm?.bytecode?.object) {
          contractName = name;
          compiled = data;
          break;
        }
      }
      if (contractName) break;
    }
    if (!contractName || !compiled) {
      return res.status(400).json({ error: "No deployable contract was produced by the compiler." });
    }
    return res.json({
      contractName,
      abi: compiled.abi,
      bytecode: "0x" + compiled.evm.bytecode.object,
      warnings: (output.errors || []).map((e) => e.formattedMessage),
      diagnostics: (output.errors || []).map((e) => ({
        severity: e.severity,
        message: e.message,
        fileName: e.sourceLocation?.file,
        start: e.sourceLocation?.start,
        end: e.sourceLocation?.end,
      })),
    });
  }

  const deployableContract = Object.entries(contracts).find(
    ([, contract]) => contract.evm?.bytecode?.object
  );
  if (!deployableContract) {
    return res.status(400).json({ error: "This file does not contain a deployable contract." });
  }
  const [contractName, compiled] = deployableContract;

  res.json({
    contractName,
    abi: compiled.abi,
    bytecode: "0x" + compiled.evm.bytecode.object,
    warnings: (output.errors || []).map((e) => e.formattedMessage),
    diagnostics: (output.errors || []).map((e) => ({
      severity: e.severity,
      message: e.message,
      fileName: e.sourceLocation?.file,
      start: e.sourceLocation?.start,
      end: e.sourceLocation?.end,
    })),
  });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  console.error("Compile server request failed:", err);
  if (res.headersSent) return;
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  const isBodyParserError = err.type === "entity.parse.failed" || err.type === "entity.too.large";
  const message = isBodyParserError
    ? status === 413
      ? "Request body exceeds the 4 MB compile server limit."
      : "Request body is not valid JSON."
    : status >= 500
      ? "Unexpected compile server error."
      : "Compile request was rejected.";
  res.status(status).json({
    error: message,
    ...(err instanceof Error && !isBodyParserError ? { details: err.message } : {}),
  });
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`Compile server listening on http://localhost:${PORT}`));
