import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const docs = [
  {
    src:   path.join(ROOT, 'docs/legal/laipdf-terms-standalone.md'),
    dest:  path.join(ROOT, 'docs/lp/terms.html'),
    title: 'LaiPDF 利用規約',
  },
  {
    src:   path.join(ROOT, 'docs/legal/privacy.md'),
    dest:  path.join(ROOT, 'docs/lp/privacy.html'),
    title: 'プライバシーポリシー',
  },
  {
    src:   path.join(ROOT, 'docs/legal/commerce-law.md'),
    dest:  path.join(ROOT, 'docs/lp/commerce-law.html'),
    title: '特定商取引法に基づく表示',
  },
];

const wrap = (title, body) => `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | LaiPDF</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: {
    extend: {
      fontFamily: { sans: ['"Noto Sans JP"', 'sans-serif'] },
      colors: {
        brand: {
          50: '#f0f5ff', 100: '#e0eaff', 500: '#3b62d6',
          600: '#2b4dc4', 700: '#1e3a9c', 800: '#162b73', 900: '#0f1f54',
        },
      },
    },
  },
};
</script>
<style>
body { font-family: 'Noto Sans JP', sans-serif; color: #1f2937; }
.legal-body h1 { font-size: 1.75rem; font-weight: 700; margin: 1.5rem 0 1rem; color: #0f1f54; }
.legal-body h2 { font-size: 1.25rem; font-weight: 700; margin: 1.75rem 0 0.75rem; color: #162b73; border-left: 4px solid #1e3a9c; padding-left: 0.75rem; }
.legal-body h3 { font-size: 1.05rem; font-weight: 600; margin: 1.25rem 0 0.5rem; color: #1e3a9c; }
.legal-body p { margin: 0.5rem 0; line-height: 1.85; }
.legal-body table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
.legal-body th, .legal-body td { border: 1px solid #e5e7eb; padding: 0.6rem 0.8rem; text-align: left; vertical-align: top; }
.legal-body th { background: #f3f4f6; font-weight: 600; }
.legal-body ul, .legal-body ol { padding-left: 1.5rem; margin: 0.5rem 0; }
.legal-body li { margin: 0.25rem 0; line-height: 1.75; }
.legal-body strong { color: #0f1f54; }
.legal-body code { background: #f3f4f6; padding: 0.1rem 0.4rem; border-radius: 0.25rem; font-family: ui-monospace, monospace; font-size: 0.85em; }
.legal-body hr { border: none; border-top: 1px solid #e5e7eb; margin: 2rem 0; }
.legal-body blockquote { border-left: 4px solid #d1d5db; padding: 0.5rem 1rem; color: #4b5563; background: #f9fafb; margin: 1rem 0; }
.legal-body a { color: #1e3a9c; text-decoration: underline; }
</style>
</head>
<body class="bg-white">

<header class="sticky top-0 z-50 bg-white border-b border-gray-100">
  <div class="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
    <a href="/laipdf/" class="flex items-center gap-2">
      <div class="w-7 h-7 bg-brand-700 rounded-lg flex items-center justify-center text-white font-bold text-sm">L</div>
      <span class="font-bold text-brand-900">LaiPDF</span>
    </a>
    <a href="/laipdf/" class="text-sm text-gray-600 hover:text-brand-700">← LP に戻る</a>
  </div>
</header>

<main class="max-w-3xl mx-auto px-4 py-10 legal-body">
${body}
</main>

<footer class="bg-brand-900 text-brand-100 py-8 mt-12">
  <div class="max-w-4xl mx-auto px-4 grid md:grid-cols-3 gap-6 text-sm">
    <div>
      <div class="flex items-center gap-2 mb-2">
        <div class="w-7 h-7 bg-white text-brand-900 rounded font-bold flex items-center justify-center text-sm">L</div>
        <span class="font-bold text-white">LaiPDF</span>
      </div>
      <p class="text-xs text-brand-200">© 2026 株式会社 L'aide</p>
    </div>
    <div>
      <h4 class="text-white font-semibold mb-2">運営会社</h4>
      <p class="text-xs">株式会社L'aide<br>〒169-0075 東京都新宿区高田馬場1-6-16 ユニオンビル603<br>info@laide.co.jp</p>
    </div>
    <div>
      <h4 class="text-white font-semibold mb-2">法務</h4>
      <ul class="text-xs space-y-1">
        <li><a href="/laipdf/terms.html" class="hover:text-white">利用規約</a></li>
        <li><a href="/laipdf/privacy.html" class="hover:text-white">プライバシーポリシー</a></li>
        <li><a href="/laipdf/commerce-law.html" class="hover:text-white">特定商取引法に基づく表示</a></li>
      </ul>
    </div>
  </div>
</footer>

</body>
</html>`;

for (const doc of docs) {
  const md = readFileSync(doc.src, 'utf8');
  const html = wrap(doc.title, marked.parse(md));
  writeFileSync(doc.dest, html, 'utf8');
  console.log('✓', path.relative(ROOT, doc.dest), `(${html.length} bytes)`);
}
