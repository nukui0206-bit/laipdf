import { PDFDocument, degrees } from 'pdf-lib';

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
