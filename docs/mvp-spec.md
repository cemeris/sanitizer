# MVP Specification

## Product goal

Sanitize customer/private data in document content before sending text to cloud AI systems, then restore original values after AI output.

## Core product decisions

- Editor is markdown-first from day one.
- WYSIWYG behavior must preserve markdown structure and compatibility.
- Primary input flow is paste into editor.
- `.docx` import via Mammoth is optional, not the main path.
- App is browser-only and offline-capable.

## MVP user flow

1. User pastes source content into markdown-first editor.
2. User highlights sensitive text and creates a variable (for example `{client_name}`).
3. App auto-detects repetitions of the same value and offers replace-all.
4. User copies sanitized content for AI use.
5. User pastes AI-generated markdown/result back into app.
6. App restores variables:
   - all at once, or
   - one by one.
7. User copies final restored content.

## MVP features

### 1) Markdown-first editor

- Split view or toggle: markdown source and rich preview/edit.
- WYSIWYG actions map to valid markdown output.
- Round-trip stability: source markdown should not be unexpectedly destroyed.

### 2) Variable mapping engine

- Create variable from selection.
- Validate variable names.
- Replace selected text with `{variable_name}`.
- Track mapping:
  - variable name
  - original value
  - occurrence count

### 3) Repetition detection

- Find exact repeated values in current document.
- Suggest replace-all for exact matches.
- Preview before apply.

### 4) Restore engine

- Apply variables back to sanitized content.
- Modes:
  - restore all
  - restore selected variable(s)

### 5) Local persistence

- Store projects in IndexedDB:
  - original content
  - sanitized content
  - variable map
- Provide delete project and delete all data actions.

### 6) Optional `.docx` import

- Upload `.docx`.
- Convert to HTML using local Mammoth bundle.
- Transform to markdown/editor content as best effort.
- Mark import as optional beta in MVP.

## Out of scope for MVP

- Multi-user collaboration
- Cloud sync
- OCR/PDF parsing
- AI API integration
- Complex NLP/PII detection (beyond exact-match repetition)
- Encryption at rest (candidate for post-MVP)

## Acceptance criteria

- User can complete sanitize -> AI copy -> restore workflow without server calls.
- Markdown remains usable and structurally correct after sanitize/restore.
- Replace-all and restore-all are deterministic and test-covered.
- App works in modern desktop browsers.
