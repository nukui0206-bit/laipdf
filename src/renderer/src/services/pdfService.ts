import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Annotation } from '../types/annotation';

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
 * 注釈レイヤーをまとめて PDF に焼き込む（保存時に呼ぶ）
 */
export async function flattenAnnotations(
  bytes: Uint8Array,
  annotations: Annotation[],
): Promise<Uint8Array> {
  if (annotations.length === 0) return bytes;
  const pdf = await PDFDocument.load(bytes);
  pdf.registerFontkit(fontkit);

  // 日本語フォントは必要時のみロード
  let jpFont: Awaited<ReturnType<typeof pdf.embedFont>> | null = null;
  let helveticaFont: Awaited<ReturnType<typeof pdf.embedFont>> | null = null;

  for (const a of annotations) {
    const page = pdf.getPage(a.pageIndex);
    const { height: pageH } = page.getSize();
    if (a.kind === 'text') {
      const hasJp = /[　-鿿぀-ゟ゠-ヿ]/.test(a.text);
      let font;
      if (hasJp) {
        if (!jpFont) {
          const fontBytes = await loadJpFont();
          jpFont = fontBytes
            ? await pdf.embedFont(fontBytes, { subset: true })
            : await pdf.embedFont(StandardFonts.Helvetica);
        }
        font = jpFont;
      } else {
        if (!helveticaFont) helveticaFont = await pdf.embedFont(StandardFonts.Helvetica);
        font = helveticaFont;
      }
      const y = pageH - a.y - a.fontSize;
      page.drawText(a.text, {
        x: a.x,
        y,
        size: a.fontSize,
        font,
        color: rgb(a.color.r, a.color.g, a.color.b),
      });
    } else if (a.kind === 'stamp') {
      const base64 = a.dataUrl.split(',')[1];
      const bin = atob(base64);
      const stampBytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) stampBytes[i] = bin.charCodeAt(i);
      const png = await pdf.embedPng(stampBytes);
      const y = pageH - a.y - a.height;
      page.drawImage(png, { x: a.x, y, width: a.width, height: a.height });
    } else if (a.kind === 'white-rect') {
      const y = pageH - a.y - a.height;
      page.drawRectangle({
        x: a.x,
        y,
        width: a.width,
        height: a.height,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });
    }
  }
  return await pdf.save();
}

export type ShapeKind = 'rect' | 'circle' | 'arrow' | 'highlight';

/**
 * PDF に図形を描画
 * 座標はページ左上を原点とする pt (Canvas 座標と同じ感覚)
 */
export async function drawShape(
  bytes: Uint8Array,
  pageIndex: number,
  shape: ShapeKind,
  x1Top: number,
  y1Top: number,
  x2Top: number,
  y2Top: number,
  color: { r: number; g: number; b: number } = { r: 0.85, g: 0.1, b: 0.1 },
  lineWidth = 2,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(pageIndex);
  const { height: pageH } = page.getSize();
  // Y 軸反転（pdf-lib は左下原点）
  const y1 = pageH - y1Top;
  const y2 = pageH - y2Top;
  const left = Math.min(x1Top, x2Top);
  const right = Math.max(x1Top, x2Top);
  const top = Math.max(y1, y2);
  const bottom = Math.min(y1, y2);
  const width = right - left;
  const height = top - bottom;

  const col = rgb(color.r, color.g, color.b);

  if (shape === 'rect') {
    page.drawRectangle({
      x: left,
      y: bottom,
      width,
      height,
      borderColor: col,
      borderWidth: lineWidth,
    });
  } else if (shape === 'circle') {
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    page.drawEllipse({
      x: cx,
      y: cy,
      xScale: width / 2,
      yScale: height / 2,
      borderColor: col,
      borderWidth: lineWidth,
    });
  } else if (shape === 'arrow') {
    // 線
    page.drawLine({
      start: { x: x1Top, y: y1 },
      end: { x: x2Top, y: y2 },
      thickness: lineWidth,
      color: col,
    });
    // 矢印先端（三角）: 終点に向かう角度から計算
    const dx = x2Top - x1Top;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const angle = Math.atan2(dy, dx);
      const arrowSize = Math.min(20, len / 3);
      const a1 = angle + Math.PI - Math.PI / 6;
      const a2 = angle + Math.PI + Math.PI / 6;
      page.drawLine({
        start: { x: x2Top, y: y2 },
        end: { x: x2Top + Math.cos(a1) * arrowSize, y: y2 + Math.sin(a1) * arrowSize },
        thickness: lineWidth,
        color: col,
      });
      page.drawLine({
        start: { x: x2Top, y: y2 },
        end: { x: x2Top + Math.cos(a2) * arrowSize, y: y2 + Math.sin(a2) * arrowSize },
        thickness: lineWidth,
        color: col,
      });
    }
  } else if (shape === 'highlight') {
    // 半透明黄色 (PDF 標準の Highlight 注釈はないので塗り長方形で代用)
    page.drawRectangle({
      x: left,
      y: bottom,
      width,
      height,
      color: rgb(1, 0.95, 0),
      opacity: 0.4,
    });
  }

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
