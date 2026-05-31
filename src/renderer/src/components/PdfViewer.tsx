import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// Vite で worker を URL として import (PDF.js v6 標準)
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfViewerProps {
  pdfBytes: Uint8Array;
}

export function PdfViewer({ pdfBytes }: PdfViewerProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);

  // PDF ロード
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buffer = pdfBytes.slice().buffer;
        const loadingTask = pdfjsLib.getDocument({ data: buffer });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        setPdf(doc);
        setTotalPages(doc.numPages);
        setPageNum(1);
      } catch (err) {
        console.error('[PdfViewer] load error', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBytes]);

  // ページレンダリング
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let renderTask: pdfjsLib.RenderTask | null = null;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
      } catch (err) {
        if ((err as { name?: string })?.name !== 'RenderingCancelledException') {
          console.error('[PdfViewer] render error', err);
        }
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageNum, scale]);

  return (
    <div className="h-full flex flex-col">
      {/* ツールバー */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 shadow-sm">
        <button
          type="button"
          disabled={pageNum <= 1}
          onClick={() => setPageNum((p) => Math.max(1, p - 1))}
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-40 rounded"
        >
          ← 前
        </button>
        <span className="text-sm text-gray-700">
          {pageNum} / {totalPages || '—'}
        </span>
        <button
          type="button"
          disabled={pageNum >= totalPages}
          onClick={() => setPageNum((p) => Math.min(totalPages, p + 1))}
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-40 rounded"
        >
          次 →
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
            className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            −
          </button>
          <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(3, s + 0.2))}
            className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            ＋
          </button>
        </div>
      </div>

      {/* キャンバスエリア */}
      <div className="flex-1 overflow-auto p-6 flex items-start justify-center">
        <canvas ref={canvasRef} className="shadow-xl bg-white" />
      </div>
    </div>
  );
}
