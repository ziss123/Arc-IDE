import Editor from "@monaco-editor/react";
import type * as monacoEditor from "monaco-editor";
import { useEffect, useRef } from "react";
import type { CompileDiagnostic } from "../lib/compileAndDeploy";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onPasteError: (message: string) => void;
  diagnostics: CompileDiagnostic[];
  onEditorMount: (editor: monacoEditor.editor.IStandaloneCodeEditor) => void;
  fileName?: string;
}

const registerSolidity = (monaco: typeof monacoEditor) => {
  if (!monaco.languages.getLanguages().some((language: { id: string }) => language.id === "solidity")) {
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
      constants: ["true", "false"],
      globals: ["msg", "tx", "block", "abi", "this", "super"],
      operators: [
        "=","==","!=","<","<=",">",">=","&&","||","!","&","|","^","~","<<",">>",
        "+","-","*","/","%","**","++","--","+=","-=","*=","/=","%=","&=","|=","^=",
        "<<=",">>=","?",":",";",",",".",
      ],
      symbols: /[=><!~?:&|+\-*/^%]+/,
      escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
      tokenizer: {
        root: [
          [/[a-zA-Z_$][\w$]*(?=[ \t]*\()/, {
            cases: {
              "@typeKeywords": "keyword.type",
              "@keywords": "keyword",
              "@default": "function",
            },
          }],
          [/[a-zA-Z_$][\w$]*/, {
            cases: {
              "@typeKeywords": "keyword.type",
              "@keywords": "keyword",
              "@constants": "constant",
              "@globals": "variable.predefined",
              "@default": "identifier",
            },
          }],
          { include: "@whitespace" },
          [/[{}()[\]]/, "@brackets"],
          [/[<>](?!@symbols)/, "@brackets"],
          [/@symbols/, {
            cases: {
              "@operators": "operator",
              "@default": "",
            },
          }],
          [/0x[0-9a-fA-F]+/, "number.hex"],
          [/\d+(\.\d+)?([eE][-+]?\d+)?/, "number"],
          [/[;,.]/, "delimiter"],
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
  }

  monaco.editor.defineTheme("solidity-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword",        foreground: "B69CFF" },
      { token: "keyword.type",   foreground: "5FE0BE" },
      { token: "type.identifier",foreground: "5FE0BE" },
      { token: "function",       foreground: "F1D58A" },
      { token: "identifier",     foreground: "D4C7FF" },
      { token: "variable.predefined", foreground: "C1AEFF" },
      { token: "constant",       foreground: "B69CFF" },
      { token: "number",         foreground: "A9D99B" },
      { token: "number.hex",     foreground: "A9D99B" },
      { token: "string",         foreground: "F2A88D" },
      { token: "string.quote",   foreground: "F2A88D" },
      { token: "string.escape",  foreground: "F1D58A" },
      { token: "comment",        foreground: "82769E", fontStyle: "italic" },
      { token: "operator",       foreground: "DCD5EE" },
      { token: "delimiter",      foreground: "DCD5EE" },
      { token: "@brackets",      foreground: "9E83FF" },
    ],
    colors: {
      "editor.background":            "#171126",
      "editor.foreground":            "#E5DFF4",
      "editorLineNumber.foreground":  "#71668A",
      "editorLineNumber.activeForeground": "#C1B5DD",
      "editor.selectionBackground":   "#493879",
      "editor.lineHighlightBackground": "#211936",
      "editorCursor.foreground":      "#C9B9FF",
      "editor.inactiveSelectionBackground": "#382B5B",
    },
  });
};

const beforeMount = (monaco: typeof monacoEditor) => {
  registerSolidity(monaco);
};

export default function IdeEditor({ value, onChange, onPasteError, diagnostics, onEditorMount, fileName }: Props) {
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monacoEditor | null>(null);
  const ext = fileName?.split(".").pop() ?? "sol";
  const isSolidity = ext === "sol";
  const language = isSolidity ? "solidity" : ext === "json" ? "json" : "plaintext";
  const theme = isSolidity ? "solidity-dark" : "vs-dark";

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!model || !monaco) return;
    monaco.editor.setModelMarkers(
      model,
      "qms-ide-compiler",
      diagnostics
        .filter((diagnostic) => diagnostic.line !== undefined)
        .map((diagnostic) => ({
          severity: diagnostic.severity === "error"
            ? monaco.MarkerSeverity.Error
            : monaco.MarkerSeverity.Warning,
          message: diagnostic.message,
          startLineNumber: diagnostic.line!,
          startColumn: diagnostic.column ?? 1,
          endLineNumber: diagnostic.line!,
          endColumn: (diagnostic.column ?? 1) + 1,
        })),
    );
  }, [diagnostics, fileName]);

  return (
    <Editor
      height="100%"
      language={language}
      theme={theme}
      value={value}
      beforeMount={beforeMount}
      onMount={(editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        onEditorMount(editor);
        const observedRoots = new Set<ParentNode>();
        const menuObserver = new MutationObserver(() => {
          for (const root of observedRoots) scanRoot(root);
        });
        const observeRoot = (root: ParentNode) => {
          if (observedRoots.has(root)) return;
          observedRoots.add(root);
          menuObserver.observe(root, { childList: true, subtree: true });
          scanRoot(root);
        };
        const scanRoot = (root: ParentNode) => {
          root.querySelectorAll(".monaco-menu").forEach((menu) => {
            menu.querySelectorAll(".action-item").forEach((item) => {
              const label = item.querySelector(".action-label");
              if (label?.textContent?.trim() === "Paste (QMS IDE)") {
                item.setAttribute("data-qms-paste", "true");
                label.textContent = "Paste";
              }
            });
            menu.querySelectorAll(".action-item").forEach((item) => {
              if (
                item.querySelector(".action-label")?.textContent?.trim() === "Paste"
                && item.getAttribute("data-qms-paste") !== "true"
              ) {
                item.remove();
              }
            });
          });

          root.querySelectorAll(".shadow-root-host").forEach((host) => {
            if (host instanceof HTMLElement && host.shadowRoot) observeRoot(host.shadowRoot);
          });
        };
        observeRoot(document.body);
        const editorNode = editor.getDomNode();
        if (editorNode) observeRoot(editorNode);
        editor.onDidDispose(() => menuObserver.disconnect());

        editor.addAction({
          id: "qms-ide.paste",
          label: "Paste (QMS IDE)",
          contextMenuGroupId: "9_cutcopypaste",
          contextMenuOrder: 3.5,
          run: async (activeEditor) => {
            try {
              const model = activeEditor.getModel();
              if (!model) return;

              const range = activeEditor.getSelection() ?? (() => {
                const position = activeEditor.getPosition();
                if (!position) {
                  throw new Error("Editor cursor position is unavailable. Click in the editor and try again.");
                }
                return {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                };
              })();

              if (!navigator.clipboard?.readText) {
                throw new Error("Clipboard access is unavailable. Use a secure HTTPS connection and allow clipboard access.");
              }

              const text = await navigator.clipboard.readText();
              if (!text) return;

              activeEditor.setSelection(range);
              activeEditor.executeEdits("qms-ide.clipboardPaste", [{
                range,
                text,
                forceMoveMarkers: true,
              }]);
              activeEditor.focus();
            } catch (error: unknown) {
              onPasteError(error instanceof Error ? error.message : String(error));
            }
          },
        });
      }}
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
