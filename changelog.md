# Changelog

## 2026-03-23

- Fixed nested `` `!! ... !!` `` block comments so inner close markers no longer terminate the outer comment highlight scope.
- Tightened parser-side block-comment opening so only standalone `` `!! `` lines start multiline comment nesting, keeping diagnostics and folding aligned with the intended block form.
- Added `agents.md` with a protocol to preserve existing work, record each change in this file, and avoid undoing documented changes unless the user explicitly asks for it.
- Verified the change with `npm run compile` and a direct parser smoke test using a nested block-comment sample, which returned no diagnostics and separate folds for the inner and outer comments.
