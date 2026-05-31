import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { StampMeta } from '../../../preload';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfViewerProps {
  pdfBytes: Uint8Array;
  pageNum: number;
  onPageChange: (page: number) => void;
  onTotalPagesChange: (n: number) => void;
  stampMode: StampMeta | null;
  textMode: boolean;
  onStampPlaced: (pageIndex: number, xPt: number, yPt: number, sizePt: number) => void;
  onTextPlaced: (pageIndex: number, xPt: number, yPt: number) => void;
}

export function PdfViewer({
  pdfBytes,
  pageNum,
  onPageChange,
  onTotalPagesChange,
  stampMode,
  textMode,
  onStampPlaced,
  onTextPlaced,
}: PdfViewerProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pagePtSize, setPagePtSize] = useState<{ w: number; h: number } | null>(null);

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
        onTotalPagesChange(doc.numPages);
      } catch (err) {
        console.error('[PdfViewer] load error', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBytes, onTotalPagesChange]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let renderTask: pdfjsLib.RenderTask | null = null;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        const ptViewport = page.getViewport({ scale: 1 });
        setPagePtSize({ w: ptViewport.width, h: ptViewport.height });
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

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!pagePtSize || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const xPt = cssX / scale;
    const yPt = cssY / scale;

    if (stampMode) {
      const sizePt = 70;
      onStampPlaced(pageNum - 1, xPt - sizePt / 2, yPt - sizePt / 2, sizePt);
    } else if (textMode) {
      onTextPlaced(pageNum - 1, xPt, yPt);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 shadow-sm">
        <button
          type="button"
          disabled={pageNum <= 1}
          onClick={() => onPageChange(Math.max(1, pageNum - 1))}
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
          onClick={() => onPageChange(Math.min(totalPages, pageNum + 1))}
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-40 rounded"
        >
          次 →
        </button>

        {stampMode && (
          <div className="ml-4 flex items-center gap-2 px-3 py-1 bg-orange-50 border border-orange-300 rounded">
            <img src={stampMode.dataUrl} alt="" className="w-6 h-6 object-contain" />
            <span className="text-xs text-orange-700">
              押印モード「{stampMode.name}」— PDF クリックで押印
            </span>
          </div>
        )}
        {textMode && (
          <div className="ml-4 px-3 py-1 bg-blue-50 border border-blue-300 rounded">
            <span className="text-xs text-blue-700">
              ✏ テキスト追加モード — PDF クリックで入力
            </span>
          </div>
        )}

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

      <div className="flex-1 overflow-auto p-6 flex items-start justify-center">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className={`shadow-xl bg-white ${stampMode || textMode ? 'cursor-crosshair' : ''}`}
        />
      </div>
    </div>
  );
}
