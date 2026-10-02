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

/** Resolve import paths untuk solc — support @openzeppelin dan path relatif */
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
        return { error: `Tidak bisa baca: ${candidate}` };
      }
    }
  }
  return { error: `Import tidak ditemukan: ${importPath}` };
}

app.post("/compile", (req, res) => {
  const { fileName = "Contract.sol", source } = req.body;
  if (!source) return res.status(400).json({ error: "source kosong" });

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
    return res.status(500).json({ error: String(e) });
  }

  const errors = (output.errors || []).filter((e) => e.severity === "error");
  if (errors.length) {
    return res.status(400).json({ errors: errors.map((e) => e.formattedMessage) });
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
      return res.status(400).json({ error: "Tidak ada contract yang berhasil di-compile." });
    }
    return res.json({
      contractName,
      abi: compiled.abi,
      bytecode: "0x" + compiled.evm.bytecode.object,
      warnings: (output.errors || []).map((e) => e.formattedMessage),
    });
  }

  const contractName = Object.keys(contracts)[0];
  const compiled = contracts[contractName];

  res.json({
    contractName,
    abi: compiled.abi,
    bytecode: "0x" + compiled.evm.bytecode.object,
    warnings: (output.errors || []).map((e) => e.formattedMessage),
  });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = 3001;
app.listen(PORT, () => console.log(`Compile server berjalan di http://localhost:${PORT}`));
