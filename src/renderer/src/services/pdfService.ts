import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// 日本語フォントは初回ロード時にキャッシュ
let cachedJpFont: ArrayBuffer | null = null;

async function loadJpFont(): Promise<ArrayBuffer | null> {
  if (cachedJpFont) return cachedJpFont;
  try {
    // main プロセス経由で取得 (CSP 制約を回避、キャッシュ済み)
    const bytes = await window.laipdf.fonts.getJp();
    if (!bytes) return null;
    // Uint8Array → ArrayBuffer (slice で detach 防止)
    cachedJpFont = bytes.slice().buffer;
    console.log('[pdfService] JP font loaded', cachedJpFont.byteLength, 'bytes');
    return cachedJpFont;
  } catch (err) {
    console.warn('[pdfService] JP font load failed', err);
    return null;
  }
}

/**
 * PDF にテキストを追加（日本語対応、要 NotoSansJP フェッチ）
 */
export async function addText(
  bytes: Uint8Array,
  pageIndex: number,
  text: string,
  xFromLeft: number,
  yFromTop: number,
  fontSize: number,
  color: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  pdf.registerFontkit(fontkit);

  // 日本語含むなら NotoSansJP、英数字のみなら Helvetica
  const hasJapanese = /[　-鿿぀-ゟ゠-ヿ]/.test(text);
  let font;
  if (hasJapanese) {
    const fontBytes = await loadJpFont();
    if (fontBytes) {
      font = await pdf.embedFont(fontBytes, { subset: true });
    } else {
      // フォール バック (日本語は文字化けするが配置はされる)
      font = await pdf.embedFont(StandardFonts.Helvetica);
    }
  } else {
    font = await pdf.embedFont(StandardFonts.Helvetica);
  }

  const page = pdf.getPage(pageIndex);
  const { height: pageH } = page.getSize();
  // pdf-lib は左下原点なので Y 変換 + フォントサイズ分上にズラす
  const y = pageH - yFromTop - fontSize;
  page.drawText(text, {
    x: xFromLeft,
    y,
    size: fontSize,
    font,
    color: rgb(color.r, color.g, color.b),
  });
  return await pdf.save();
}


/**
 * 画像ファイル群から PDF を作成。
 * 各画像 1 枚 = 1 ページ。A4 (595×842pt) に収まるよう自動スケール。
 */
export async function imagesToPdf(
  images: Array<{ type: 'png' | 'jpg'; bytes: Uint8Array }>,
): Promise<Uint8Array> {
  const A4_W = 595.28;
  const A4_H = 841.89;
  const MARGIN = 20;
  const MAX_W = A4_W - MARGIN * 2;
  const MAX_H = A4_H - MARGIN * 2;

  const pdf = await PDFDocument.create();
  for (const img of images) {
    const bufferCopy = img.bytes.slice();
    const embedded =
      img.type === 'png'
        ? await pdf.embedPng(bufferCopy)
        : await pdf.embedJpg(bufferCopy);
    const scale = Math.min(MAX_W / embedded.width, MAX_H / embedded.height, 1);
    const w = embedded.width * scale;
    const h = embedded.height * scale;
    const page = pdf.addPage([A4_W, A4_H]);
    const x = (A4_W - w) / 2;
    const y = (A4_H - h) / 2;
    page.drawImage(embedded, { x, y, width: w, height: h });
  }
  return await pdf.save();
}

/**
 * 印鑑画像を PDF の指定ページ・指定座標に押す
 * x, y はページ左上を原点とする pt 単位
 * size は印鑑の幅 (高さは縦横比維持)
 */
export async function stampOnPage(
  bytes: Uint8Array,
  pageIndex: number,
  stampPngBytes: Uint8Array,
  xFromLeft: number,
  yFromTop: number,
  size: number,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  const png = await pdf.embedPng(stampPngBytes);
  const page = pdf.getPage(pageIndex);
  const { width: pageW, height: pageH } = page.getSize();
  const aspectRatio = png.height / png.width;
  const w = Math.min(size, pageW);
  const h = w * aspectRatio;
  // pdf-lib は左下原点なので Y 軸変換
  const x = Math.max(0, Math.min(xFromLeft, pageW - w));
  const y = Math.max(0, Math.min(pageH - yFromTop - h, pageH - h));
  page.drawImage(png, { x, y, width: w, height: h });
  return await pdf.save();
}

/**
 * ページ削除 (pageIndex は 0 始まり)
 */
export async function deletePage(bytes: Uint8Array, pageIndex: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  pdf.removePage(pageIndex);
  return await pdf.save();
}

/**
 * ページ回転 (累積、deg: 90 / 180 / 270)
 */
export async function rotatePage(
  bytes: Uint8Array,
  pageIndex: number,
  deg: 90 | 180 | 270,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(pageIndex);
  const current = page.getRotation().angle;
  page.setRotation(degrees((current + deg) % 360));
  return await pdf.save();
}

/**
 * ページ並び替え (newOrder は元 PDF の 0 始まり index 配列。並べたい順序で渡す)
 * 例: 元が [A, B, C] で newOrder=[2, 0, 1] なら [C, A, B] になる
 */
export async function reorderPages(
  bytes: Uint8Array,
  newOrder: number[],
): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  const newDoc = await PDFDocument.create();
  const pages = await newDoc.copyPages(src, newOrder);
  pages.forEach((p) => newDoc.addPage(p));
  return await newDoc.save();
}

/**
 * 複数 PDF を結合
 */
export async function mergePdfs(buffers: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return await merged.save();
}

/**
 * PDF 分割: ranges (0 始まり, 両端含む) ごとに新 PDF を作って返す
 */
export async function splitPdf(
  bytes: Uint8Array,
  ranges: [number, number][],
): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(bytes);
  const results: Uint8Array[] = [];
  for (const [start, end] of ranges) {
    const newDoc = await PDFDocument.create();
    const indices = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const pages = await newDoc.copyPages(src, indices);
    pages.forEach((p) => newDoc.addPage(p));
    results.push(await newDoc.save());
  }
  return results;
}
