import fs from "node:fs";
import path from "node:path";
import solc from "solc";

function findImports(importPath) {
  const candidates = [
    path.join(process.cwd(), "node_modules", importPath),
    path.join(process.cwd(), importPath),
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

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method tidak diizinkan" });
  }

  const { fileName = "Contract.sol", source } = req.body ?? {};
  if (typeof source !== "string" || source.length === 0) {
    return res.status(400).json({ error: "source kosong" });
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
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }

  const errors = (output.errors ?? []).filter((error) => error.severity === "error");
  if (errors.length > 0) {
    return res.status(400).json({ errors: errors.map((error) => error.formattedMessage) });
  }

  const contracts = output.contracts?.[fileName];
  let contractName;
  let compiled;

  if (contracts && Object.keys(contracts).length > 0) {
    contractName = Object.keys(contracts)[0];
    compiled = contracts[contractName];
  } else {
    for (const file of Object.values(output.contracts ?? {})) {
      const entry = Object.entries(file).find(([, contract]) => contract.evm?.bytecode?.object);
      if (entry) {
        [contractName, compiled] = entry;
        break;
      }
    }
  }

  if (!contractName || !compiled) {
    return res.status(400).json({ error: "Tidak ada contract yang berhasil di-compile." });
  }

  return res.status(200).json({
    contractName,
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}`,
    warnings: (output.errors ?? []).map((error) => error.formattedMessage),
  });
}