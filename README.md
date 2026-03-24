# Banana Language VS Code Extension

This workspace now contains a full starter extension for the Banana Data Interchange and Markup Language described in `Banana Language.txt`.

## What is included

- language registration for `.nana-lang`
- VS Code language configuration and snippets
- a TextMate grammar for the core default-delimiter syntax
- a Node-based language server with:
  - header validation
  - indentation diagnostics
  - strict-mode duplicate sibling detection
  - multiline block matching diagnostics
  - document symbols
  - folding ranges
- an example Nana document in `examples/sample.nana-lang`

## Project layout

- `client/` contains the VS Code extension host client
- `server/` contains the language server and parser
- `syntaxes/` contains the TextMate grammar
- `snippets/` contains editor snippets

## Build

1. Install dependencies with `npm install`
2. Compile with `npm run compile`
3. Open this folder in VS Code and press `F5` to launch the extension development host

## Notes

The Banana spec allows the delimiter to be redefined in the header. The language server honors that when producing diagnostics, but the TextMate grammar is static, so syntax highlighting is currently tuned to the default backtick delimiter.
