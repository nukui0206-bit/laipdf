import { PDFDocument, degrees } from 'pdf-lib';

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
