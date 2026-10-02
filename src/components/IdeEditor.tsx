import Editor from "@monaco-editor/react";
import type * as monacoEditor from "monaco-editor";

interface Props {
  value: string;
  onChange: (value: string) => void;
  fileName?: string;
}

const registerSolidity = (monaco: typeof monacoEditor) => {
  // Only register once
  if (monaco.languages.getLanguages().some((l: { id: string }) => l.id === "solidity")) return;

  monaco.languages.register({ id: "solidity", extensions: [".sol"], aliases: ["Solidity", "sol"] });

  monaco.languages.setMonarchTokensProvider("solidity", {
    keywords: [
      "pragma","solidity","import","contract","interface","library","is","using","for",
      "struct","enum","event","error","modifier","function","constructor","fallback","receive",
      "returns","return","if","else","for","while","do","break","continue","try","catch","revert",
      "emit","new","delete","assembly","unchecked","override","virtual","abstract","internal",
      "external","public","private","pure","view","payable","nonpayable","immutable","constant",
      "indexed","anonymous","memory","storage","calldata","mapping","tuple",
    ],
    typeKeywords: [
      "address","bool","string","bytes","bytes1","bytes2","bytes4","bytes8","bytes16","bytes32",
      "int","int8","int16","int32","int64","int128","int256",
      "uint","uint8","uint16","uint32","uint64","uint128","uint256",
    ],
    operators: [
      "=","==","!=","<","<=",">",">=","&&","||","!","&","|","^","~","<<",">>",
      "+","-","*","/","%","**","++","--","+=","-=","*=","/=","%=","&=","|=","^=",
      "<<=",">>=","?",":",";",",",".",
    ],
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    tokenizer: {
      root: [
        // Identifiers & keywords
        [/[a-zA-Z_$][\w$]*/, {
          cases: {
            "@typeKeywords": "keyword.type",
            "@keywords": "keyword",
            "@default": "identifier",
          },
        }],
        { include: "@whitespace" },
        // Delimiters and operators
        [/[{}()[\]]/, "@brackets"],
        [/[<>](?!@symbols)/, "@brackets"],
        [/@symbols/, {
          cases: {
            "@operators": "operator",
            "@default": "",
          },
        }],
        // Numbers
        [/0x[0-9a-fA-F]+/, "number.hex"],
        [/\d+(\.\d+)?([eE][-+]?\d+)?/, "number"],
        // Delimiter
        [/[;,.]/, "delimiter"],
        // Strings
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, { token: "string.quote", bracket: "@open", next: "@string_double" }],
        [/'([^'\\]|\\.)*$/, "string.invalid"],
        [/'/, { token: "string.quote", bracket: "@open", next: "@string_single" }],
      ],
      string_double: [
        [/[^\\"]+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
      ],
      string_single: [
        [/[^\\']+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/'/, { token: "string.quote", bracket: "@close", next: "@pop" }],
      ],
      whitespace: [
        [/[ \t\r\n]+/, "white"],
        [/\/\*/, "comment", "@comment"],
        [/\/\/.*$/, "comment"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\/\*/, "comment", "@push"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
    },
  });

  // VS Code Dark+ inspired theme for Solidity
  monaco.editor.defineTheme("solidity-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword",        foreground: "569CD6", fontStyle: "bold" },
      { token: "keyword.type",   foreground: "4EC9B0" },
      { token: "identifier",     foreground: "9CDCFE" },
      { token: "number",         foreground: "B5CEA8" },
      { token: "number.hex",     foreground: "B5CEA8" },
      { token: "string",         foreground: "CE9178" },
      { token: "string.quote",   foreground: "CE9178" },
      { token: "string.escape",  foreground: "D7BA7D" },
      { token: "comment",        foreground: "6A9955", fontStyle: "italic" },
      { token: "operator",       foreground: "D4D4D4" },
      { token: "delimiter",      foreground: "D4D4D4" },
      { token: "@brackets",      foreground: "FFD700" },
    ],
    colors: {
      "editor.background":            "#1E1E1E",
      "editor.foreground":            "#D4D4D4",
      "editorLineNumber.foreground":  "#858585",
      "editorLineNumber.activeForeground": "#C6C6C6",
      "editor.selectionBackground":   "#264F78",
      "editor.lineHighlightBackground": "#2A2D2E",
      "editorCursor.foreground":      "#AEAFAD",
      "editor.inactiveSelectionBackground": "#3A3D41",
    },
  });
};

const beforeMount = (monaco: typeof monacoEditor) => {
  registerSolidity(monaco);
};

export default function IdeEditor({ value, onChange, fileName }: Props) {
  const ext = fileName?.split(".").pop() ?? "sol";
  const isSolidity = ext === "sol";
  const language = isSolidity ? "solidity" : ext === "json" ? "json" : "plaintext";
  const theme = isSolidity ? "solidity-dark" : "vs";

  return (
    <Editor
      height="100%"
      language={language}
      theme={theme}
      value={value}
      beforeMount={beforeMount}
      onChange={(v) => onChange(v ?? "")}
      options={{
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Menlo', monospace",
        minimap: { enabled: true, scale: 1 },
        scrollBeyondLastLine: false,
        lineNumbers: "on",
        renderLineHighlight: "line",
        tabSize: 4,
        wordWrap: "off",
        padding: { top: 12, bottom: 12 },
        smoothScrolling: true,
        cursorBlinking: "smooth",
        bracketPairColorization: { enabled: true },
        fontLigatures: true,
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      }}
    />
  );
}
