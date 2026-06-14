# BearCaptcha Obfuscator

A self-contained **code virtualizer / encoder / compactor**. It reads the
frontend from `../public`, transforms each file, and writes the obfuscated
result into `./dist`.

> **`../public` is never modified.** It is read-only input. All output goes to
> `obfuscator/dist/`.

## What it does

| Input  | Tool                   | Effect                                                        |
|--------|------------------------|---------------------------------------------------------------|
| `.js`  | `javascript-obfuscator`| Control-flow flattening, RC4 string encoding, dead-code injection, self-defending, hex identifiers |
| `.css` | `clean-css`            | Full minification (level 2)                                   |
| `.html`| `html-minifier-terser` | Whitespace/comment removal + inline CSS/JS minification       |
| other  | —                      | Copied verbatim (images, fonts, etc.)                         |

Directory structure under `public/` is preserved in `dist/`.

## Usage

```bash
# from the obfuscator/ folder
npm install      # first time only
npm run build    # produces obfuscator/dist/
```

To wipe the output without rebuilding:

```bash
npm run clean
```

## Notes

- **Set `public/config.js` (the backend URL) BEFORE building** — the output is
  obfuscated and not meant to be hand-edited afterward.
- `window.BEARCAPTCHA_API_BASE` is a property on `window`, so it survives
  obfuscation and the cross-file reference from `app.js` keeps working.
- Tune strength in `build.js` (`OBFUSCATOR_OPTIONS`). Set `debugProtection: true`
  to actively fight devtools, or lower the thresholds for faster runtime.
- Deploy `dist/` (not `public/`) when you want the obfuscated build live.
