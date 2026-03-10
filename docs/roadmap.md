# Roadmap

## Phase 0: Foundation

- Keep browser-only, offline-first setup.
- Maintain third-party license compliance for vendored dependencies.
- Establish app structure for markdown-first editor + sanitization engine.

## Phase 1: MVP (paste-first)

1. Editor shell
   - Markdown source pane
   - Rich markdown-aware editing pane/preview
2. Variable creation
   - Create `{variable_name}` from text selection
   - Variable manager sidebar/table
3. Repetition handling
   - Detect exact repeated matches
   - Replace one / replace all
4. Sanitized output workflow
   - Copy sanitized text for AI
   - Paste AI result back
5. Restore workflow
   - Restore all variables
   - Restore one-by-one
6. Persistence
   - IndexedDB project save/load/delete

## Phase 2: Optional import improvements

- `.docx` import using Mammoth (optional path).
- Improve markdown conversion quality after Word import.
- Add import diagnostics for unsupported formatting.

## Phase 3: Security hardening

- Optional local encryption for variable values.
- Session lock and timed clear options.
- More detailed audit trail of replacements/restores.

## Phase 4: OSS maturity

- Contributing guide and issue templates.
- Test matrix and CI checks.
- Example datasets with non-sensitive demo data.
