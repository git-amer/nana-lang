# Changelog

## 2026-03-26

- Audited every command token listed in the `## Standard Commands` section of `Banana Language.nana` by spawning one subagent per command and collecting per-command implementation findings across `server/src/parser.ts` and `syntaxes/nana.tmLanguage.json`.
- Tightened parser behavior for command correctness:
  - Treated a standalone `.nana-lang` line as a data terminator instead of trying to parse it as a malformed header redefinition.
  - Enforced standalone openers for multiline raw/code/quote blocks (`\`((`, `` `{{` ``, `` `''` ``).
  - Fixed inline raw missing-close detection to catch cases that include `\`((` elsewhere on the line and to scan beyond the first inline raw opener.
  - Corrected the inline raw diagnostic message wording (`missing a closing \`)``).
  - Corrected escaped-delimiter leading text parsing so lines starting with `` `` `` parse as text items instead of generic commands.
  - Tightened horizontal-rule suppression to only treat exact line-only forms `\`-`, `` `--` ``, and `` `---` `` as rule lines.
  - Tightened join validation so `\`&`, `` `&&` ``, and `` `&&&` `` now error when the next line is blank, a comment, a block opener, or a header instead of silently clearing pending join state.
  - Updated join end-of-line detection to ignore escaped-delimiter literals (for example `` ``&& `` no longer acts as a join command).
- Tightened and expanded TextMate grammar coverage:
  - Anchored block comment begin/end to standalone lines and allowed inline visual tokens inside block comments.
  - Converted line comments to begin/end form with command-start anchoring and allowed inline visual tokens inside comment lines.
  - Anchored multiline raw/code/quote begin tokens to standalone lines; allowed optional trailing delimiter on multiline code/quote close to match parser tolerance.
  - Prevented inline raw from matching multiline-raw opener tokens and added inline code block tokenization for `` `{ ... }` ``.
  - Anchored continuation command highlighting to EOL.
  - Added explicit `\`=` operator highlighting rule and delimiter-only line (`\``) highlighting rule.
  - Allowed empty bracket special commands (`\`[]`) in special-command highlighting.
- Remaining overall issues identified by the per-command audit but not fully implemented in this patch include semantic parser support for defaults propagation (`\`%`), table row/column validation (`\`|`), inline children/horizontal list semantics (`\`:` and `\`,`), and richer visual-command semantics beyond syntax highlighting.
- Verification performed:
  - `npm run compile`
  - Targeted parser smoke tests via `node` against `server/out/parser.js` for:
    - `.nana-lang` data termination behavior
    - leading escaped-delimiter text parsing
    - inline raw missing-close detection edge case
    - join command diagnostics when followed by blank/comment lines

## 2026-03-23

- Fixed nested `` `!! ... !!` `` block comments so inner close markers no longer terminate the outer comment highlight scope.
- Tightened parser-side block-comment opening so only standalone `` `!! `` lines start multiline comment nesting, keeping diagnostics and folding aligned with the intended block form.
- Added `agents.md` with a protocol to preserve existing work, record each change in this file, and avoid undoing documented changes unless the user explicitly asks for it.
- Verified the change with `npm run compile` and a direct parser smoke test using a nested block-comment sample, which returned no diagnostics and separate folds for the inner and outer comments.
