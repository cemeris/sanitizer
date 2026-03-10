# Sanitizer

Open-source browser app for sanitizing private data in markdown-based content before using cloud AI tools.

## Core direction

- Browser-only (no Node.js runtime required for app usage)
- Fully offline runtime (no CDN dependency)
- Markdown-first editing workflow
- Primary input is paste/import into markdown editor
- Optional `.docx` import via local `mammoth.js`

## Run

Open `index.html` in a browser, or serve this folder with any static file server.

## Current prototype features

- IndexedDB project storage (multiple projects and files)
- Original/sanitized content separation per file
- Modal-based file import from a single button
- Multi-file support: `.md`, `.markdown`, `.txt`, `.html`, `.htm`, `.docx`
- Markdown editor + live preview
- Variable creation from selected text (`{variable_name}`)
- Replace-all exact repetitions
- Restore placeholders one-by-one or all at once
- Project-scoped variables usable across all files
- Auto-detect sensitive data (emails, LV phone numbers, LV company prefixes)
- Auto-detects: IBAN, personal code, address, dates, registration numbers, vehicle plates, postal codes, URLs with query params
- Copy sanitized output
- Export sanitized markdown to `.docx` (basic formatting)
- Autosave-only workflow (no manual Save button)
- Delete support for active project, active file, and variables

## Markdown quick hints

- `# Title` and `## Section` for headings
- `**bold**` and `*italic*`
- `- item` for bullet lists
- `[label](https://example.com)` for links
- `` `inline code` `` and fenced blocks with triple backticks
- `{client_name}` style placeholders for sanitized values
- Tables: `| Col | Col |` followed by `| --- | --- |`
- Alignment blocks:
  - `:::left` ... `:::`
  - `:::center` ... `:::`
  - `:::right` ... `:::`
- Variable shortcut: select text and press `Space` to create a variable (selection is trimmed)

## Testing

Run deterministic sanitizer engine tests:

```bash
node --test tests/sanitizer-core.test.js
```

## Third-party license compliance

- Mammoth is licensed under BSD-2-Clause.
- Docx is licensed under MIT.
- Local runtime file: `vendor/mammoth.browser.min.js`.
- Local runtime file: `vendor/docx.iife.js`.
- License text: `third_party_licenses/MAMMOTH-LICENSE.txt`.
- License text: `third_party_licenses/DOCX-LICENSE.txt`.
- Attribution summary: `THIRD_PARTY_NOTICES.md`.

## Planning docs

- `docs/mvp-spec.md`
- `docs/roadmap.md`

## License

MIT. See [LICENSE](./LICENSE).
