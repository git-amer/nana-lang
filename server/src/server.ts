import {
  createConnection,
  DidChangeConfigurationNotification,
  DocumentSymbolParams,
  FoldingRangeParams,
  InitializeParams,
  InitializeResult,
  ProposedFeatures,
  TextDocumentSyncKind
} from 'vscode-languageserver/node';
import { TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument } from './parser';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let supportsConfiguration = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;
  supportsConfiguration = capabilities.workspace?.configuration === true;

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      documentSymbolProvider: true,
      foldingRangeProvider: true
    }
  };
});

connection.onInitialized(() => {
  if (supportsConfiguration) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
});

documents.onDidOpen(async (event) => {
  await validateDocument(event.document);
});

documents.onDidChangeContent(async (change) => {
  await validateDocument(change.document);
});

documents.onDidClose((event) => {
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onDocumentSymbol((params: DocumentSymbolParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  return parseDocument(document.getText()).symbols;
});

connection.onFoldingRanges((params: FoldingRangeParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  return parseDocument(document.getText()).foldingRanges;
});

async function validateDocument(document: TextDocument): Promise<void> {
  const analysis = parseDocument(document.getText());
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: analysis.diagnostics
  });
}

documents.listen(connection);
connection.listen();
