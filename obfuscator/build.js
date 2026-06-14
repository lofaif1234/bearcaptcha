/* ------------------------------------------------------------------ *
 * BearCaptcha — Code Virtualizer / Encoder / Compactor
 * ------------------------------------------------------------------ *
 * Reads every file from ../public, transforms it, and writes the
 * result into ./dist. The source (../public) is treated as READ-ONLY
 * and is never modified.
 *
 *   .js   -> javascript-obfuscator   (virtualize + encode strings)
 *   .css  -> clean-css               (compact)
 *   .html -> html-minifier-terser    (compact + minify inline css/js)
 *   *     -> copied verbatim (images, fonts, etc.)
 *
 * Usage:
 *   npm install      (first time only)
 *   npm run build
 * ------------------------------------------------------------------ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import JavaScriptObfuscator from 'javascript-obfuscator';
import CleanCSS from 'clean-css';
import { minify as minifyHtml } from 'html-minifier-terser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* CONFIG                                                              */
/* ------------------------------------------------------------------ */
const SRC_DIR = path.resolve(__dirname, '..', 'public');
const OUT_DIR = path.resolve(__dirname, 'dist');

// Aggressive but browser-safe obfuscation. Tune here.
const OBFUSCATOR_OPTIONS = {
  target: 'browser',
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  numbersToExpressions: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 0.8,
  stringArrayWrappersCount: 3,
  stringArrayWrappersType: 'function',
  transformObjectKeys: true,
  selfDefending: true,
  identifierNamesGenerator: 'hexadecimal',
  // Member/global names referenced across files (e.g. window.BEARCAPTCHA_API_BASE)
  // are property accesses, not renamed identifiers — left intact on purpose.
  renameGlobals: false,
  // debugProtection breaks devtools entirely; opt in only if you want it.
  debugProtection: false
};

// Lighter pass for the bootstrap loader: keep the big base64 payloads as plain
// literals (no stringArray/splitStrings) so they don't bloat or slow startup.
const LOADER_OPTIONS = {
  target: 'browser',
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: false,
  numbersToExpressions: true,
  simplify: true,
  stringArray: false,
  splitStrings: false,
  transformObjectKeys: false,
  selfDefending: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false
};

// Level 1 only: safe minification (whitespace/comments/dupes). Level 2 reorders
// and merges rules, which can change the cascade and subtly break layout.
const CLEANCSS_OPTIONS = { level: 1 };

// Whitespace is NOT collapsed: markup like <div class="terminal-body"> relies
// on CSS white-space to render line breaks, and html-minifier only preserves
// <pre>/<textarea>. Since the HTML is base64-encoded into loader.js anyway, the
// size saving from collapsing is negligible — correctness wins.
const HTML_MINIFY_OPTIONS = {
  collapseWhitespace: false,
  removeComments: true,
  removeRedundantAttributes: false,
  minifyCSS: false,
  minifyJS: false,
  keepClosingSlash: true,
  caseSensitive: true
};

/* ------------------------------------------------------------------ */
/* HELPERS                                                             */
/* ------------------------------------------------------------------ */
function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + ' KB';
}

function obfuscateJs(code, opts) {
  return JavaScriptObfuscator.obfuscate(code, opts).getObfuscatedCode();
}

function b64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

// Runtime bootstrap: rebuilds <style> and the page markup from encoded
// payloads, then loads the (separately obfuscated) page scripts in order.
function buildLoaderSource(cssB64, htmlB64, scripts) {
  return '(function(){"use strict";' +
    'var C="' + cssB64 + '";var H="' + htmlB64 + '";var S=' + JSON.stringify(scripts) + ';' +
    'function d(b){return decodeURIComponent(escape(atob(b)));}' +
    'var st=document.createElement("style");st.textContent=d(C);' +
    '(document.head||document.documentElement).appendChild(st);' +
    'function boot(){document.body.innerHTML=d(H);' +
    'for(var i=0;i<S.length;i++){var s=document.createElement("script");s.src=S[i];s.async=false;document.body.appendChild(s);}}' +
    'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",boot);}else{boot();}' +
    '})();';
}

// Split a minified HTML doc into: an encoded shell (loads loader.js), the body
// markup (scripts removed), and the ordered list of external scripts it used.
function encodeHtmlDocument(minHtml) {
  const bodyRe = /<body[^>]*>([\s\S]*?)<\/body>/i;
  const m = minHtml.match(bodyRe);
  let bodyInner = m ? m[1] : '';

  const scriptRe = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*><\/script>/gi;
  const scripts = [];
  let sm;
  while ((sm = scriptRe.exec(bodyInner)) !== null) scripts.push(sm[1]);
  bodyInner = bodyInner.replace(scriptRe, '');

  const shell = minHtml
    .replace(/<link\b[^>]*href=["']style\.css["'][^>]*>/i, '')
    .replace(bodyRe, '<body></body>')
    .replace(/<\/head>/i, '<script src="loader.js"></script></head>');

  return { shell, bodyInner, scripts };
}

/* ------------------------------------------------------------------ */
/* BUILD                                                               */
/* ------------------------------------------------------------------ */
async function build() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`[obfuscator] FATAL: source folder not found: ${SRC_DIR}`);
    process.exit(1);
  }

  console.log(`[obfuscator] source: ${SRC_DIR}`);
  console.log(`[obfuscator] output: ${OUT_DIR}`);
  rmrf(OUT_DIR);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (process.argv.includes('--clean-only')) {
    console.log('[obfuscator] cleaned output directory; nothing to build.');
    return;
  }

  const files = walk(SRC_DIR);

  // Minify all stylesheets up front. They are embedded (encoded) into loader.js
  // and intentionally NOT emitted as readable .css files.
  let cssCombined = '';
  for (const f of files) {
    if (path.extname(f).toLowerCase() === '.css') {
      cssCombined += new CleanCSS(CLEANCSS_OPTIONS).minify(fs.readFileSync(f, 'utf8')).styles;
    }
  }

  let totalIn = 0;
  let totalOut = 0;
  const write = (rel, content) => {
    const dest = path.join(OUT_DIR, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
    totalOut += Buffer.byteLength(content);
  };

  for (const srcPath of files) {
    const rel = path.relative(SRC_DIR, srcPath).replace(/\\/g, '/');
    const ext = path.extname(srcPath).toLowerCase();
    const inputBuf = fs.readFileSync(srcPath);
    totalIn += inputBuf.length;

    try {
      if (ext === '.css') {
        console.log(`  embed     ${rel}  (encoded into loader.js)`);
        continue;
      }
      if (ext === '.js') {
        const out = obfuscateJs(inputBuf.toString('utf8'), OBFUSCATOR_OPTIONS);
        write(rel, out);
        console.log(`  obfusc.   ${rel}  (${kb(inputBuf.length)} -> ${kb(Buffer.byteLength(out))})`);
        continue;
      }
      if (ext === '.html' || ext === '.htm') {
        const minHtml = await minifyHtml(inputBuf.toString('utf8'), HTML_MINIFY_OPTIONS);
        const { shell, bodyInner, scripts } = encodeHtmlDocument(minHtml);
        const loaderSrc = buildLoaderSource(b64(cssCombined), b64(bodyInner), scripts);
        const loaderOut = obfuscateJs(loaderSrc, LOADER_OPTIONS);
        write(rel, shell);
        const loaderRel = path.posix.join(path.posix.dirname(rel), 'loader.js');
        write(loaderRel, loaderOut);
        console.log(`  encode    ${rel}  -> shell ${kb(Buffer.byteLength(shell))} + loader.js ${kb(Buffer.byteLength(loaderOut))}`);
        continue;
      }
      write(rel, inputBuf); // copy verbatim (images, fonts, etc.)
      console.log(`  copy      ${rel}  (${kb(inputBuf.length)})`);
    } catch (err) {
      console.error(`[obfuscator] ERROR processing ${rel}: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('[obfuscator] ------------------------------------------');
  console.log(`[obfuscator] in ${kb(totalIn)} -> out ${kb(totalOut)}`);
  console.log('[obfuscator] HTML markup + CSS encoded into loader.js; JS obfuscated. public/ untouched.');
}

build().catch(err => {
  console.error('[obfuscator] FATAL:', err);
  process.exit(1);
});
