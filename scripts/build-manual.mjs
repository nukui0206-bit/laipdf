import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'manual.md');
const TMP = path.join(ROOT, 'docs', '_manual.html');
const OUT = path.join(ROOT, 'docs', 'LaiPDF-manual.pdf');

const md = readFileSync(SRC, 'utf8');
const body = marked.parse(md);

const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>LaiPDF 取扱説明書</title>
  <style>
    @page { margin: 18mm 16mm; }
    html, body {
      font-family: "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif;
      color: #1f2937;
      line-height: 1.7;
      font-size: 11pt;
      margin: 0;
    }
    main { padding: 0; }
    .cover {
      page-break-after: always;
      text-align: center;
      padding-top: 28%;
    }
    .cover .title {
      font-size: 42pt;
      font-weight: 700;
      letter-spacing: 4pt;
      color: #1f2937;
    }
    .cover .subtitle {
      font-size: 14pt;
      color: #6b7280;
      margin-top: 16pt;
      letter-spacing: 2pt;
    }
    .cover .meta {
      margin-top: 80pt;
      font-size: 11pt;
      color: #4b5563;
      line-height: 2;
    }
    h1 {
      page-break-before: always;
      font-size: 22pt;
      border-bottom: 3px solid #1f2937;
      padding-bottom: 6pt;
      margin-top: 0;
      margin-bottom: 16pt;
    }
    h1:first-child { page-break-before: avoid; }
    h2 {
      font-size: 15pt;
      border-left: 4px solid #1f2937;
      padding-left: 8pt;
      margin-top: 20pt;
      margin-bottom: 10pt;
      color: #1f2937;
    }
    h3 {
      font-size: 12pt;
      color: #4b5563;
      margin-top: 14pt;
      margin-bottom: 6pt;
    }
    p { margin: 6pt 0; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 8pt 0;
      font-size: 10pt;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 5pt 8pt;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f3f4f6;
      font-weight: 600;
    }
    pre {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      padding: 8pt 10pt;
      border-radius: 4pt;
      font-size: 8.5pt;
      line-height: 1.45;
      overflow: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: Consolas, "Yu Gothic UI", monospace;
    }
    code {
      background: #f3f4f6;
      padding: 1pt 4pt;
      border-radius: 3pt;
      font-size: 9pt;
      font-family: Consolas, "Yu Gothic UI", monospace;
    }
    pre code {
      background: transparent;
      padding: 0;
      font-size: inherit;
    }
    blockquote {
      border-left: 4px solid #6b7280;
      margin: 8pt 0;
      padding: 4pt 12pt;
      color: #4b5563;
      background: #f9fafb;
    }
    ul, ol { margin: 6pt 0; padding-left: 20pt; }
    li { margin: 3pt 0; }
    hr {
      border: none;
      border-top: 1px solid #d1d5db;
      margin: 20pt 0;
    }
    strong { color: #111827; font-weight: 700; }
    a { color: #1f2937; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="cover">
    <div class="title">LaiPDF</div>
    <div class="subtitle">取扱説明書 / User Manual</div>
    <div class="meta">
      Version 1.0.3<br>
      株式会社 L'aide<br>
      Laiweb 契約者向け配布版
    </div>
  </div>
  <main>${body}</main>
</body>
</html>`;

writeFileSync(TMP, html, 'utf8');
console.log('[1/3] HTML written:', TMP);

app.whenReady().then(async () => {
  console.log('[2/3] Electron ready, creating BrowserWindow...');
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 1600,
  });

  win.webContents.on('did-finish-load', async () => {
    try {
      console.log('[3/3] HTML loaded, printing to PDF...');
      await new Promise((r) => setTimeout(r, 800));
      const pdf = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        preferCSSPageSize: true,
      });
      writeFileSync(OUT, pdf);
      console.log('✓ Manual PDF generated:', OUT, '(', pdf.length, 'bytes )');
    } catch (err) {
      console.error('✗ printToPDF failed:', err);
    } finally {
      app.quit();
    }
  });

  win.loadURL(pathToFileURL(TMP).toString());
});

app.on('window-all-closed', () => app.quit());
