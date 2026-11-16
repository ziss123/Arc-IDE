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
        return { error: `Unable to read import: ${candidate}` };
      }
    }
  }

  return { error: `Import not found: ${importPath}` };
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { fileName = "Contract.sol", source } = req.body ?? {};
  if (typeof source !== "string" || !source.trim()) {
    return res.status(400).json({ error: "Solidity source must be a non-empty string." });
  }
  if (Buffer.byteLength(source, "utf8") > 4 * 1024 * 1024) {
    return res.status(413).json({ error: "Solidity source exceeds the 4 MB compile server limit." });
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
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }

  const errors = (output.errors ?? []).filter((error) => error.severity === "error");
  if (errors.length > 0) {
    return res.status(400).json({
      errors: errors.map((error) => error.formattedMessage),
      diagnostics: errors.map((error) => ({
        severity: error.severity,
        message: error.message,
        fileName: error.sourceLocation?.file,
        start: error.sourceLocation?.start,
        end: error.sourceLocation?.end,
      })),
    });
  }

  const contracts = output.contracts?.[fileName];
  const allContracts = contracts && Object.keys(contracts).length > 0
    ? [contracts]
    : Object.values(output.contracts ?? {});
  const deployableContract = allContracts
    .flatMap((file) => Object.entries(file))
    .find(([, contract]) => contract.evm?.bytecode?.object);
  const [contractName, compiled] = deployableContract ?? [];

  if (!contractName || !compiled) {
    return res.status(400).json({ error: "No deployable contract was produced by the compiler." });
  }

  return res.status(200).json({
    contractName,
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}`,
    warnings: (output.errors ?? []).map((error) => error.formattedMessage),
    diagnostics: (output.errors ?? []).map((error) => ({
      severity: error.severity,
      message: error.message,
      fileName: error.sourceLocation?.file,
      start: error.sourceLocation?.start,
      end: error.sourceLocation?.end,
    })),
  });
}