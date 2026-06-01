import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { StampMeta } from '../../../preload';
import type { ShapeKind } from '../services/pdfService';
import type { Annotation } from '../types/annotation';
import { AnnotationLayer } from './AnnotationLayer';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfViewerProps {
  pdfBytes: Uint8Array;
  pageNum: number;
  onPageChange: (page: number) => void;
  onTotalPagesChange: (n: number) => void;
  stampMode: StampMeta | null;
  textMode: boolean;
  shapeMode: ShapeKind | null;
  whiteRectMode: boolean;
  snapshotMode: boolean;
  onStampPlaced: (pageIndex: number, xPt: number, yPt: number, sizePt: number) => void;
  onTextPlaced: (pageIndex: number, xPt: number, yPt: number) => void;
  onShapeDrawn: (
    pageIndex: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ) => void;
  onWhiteRectDrawn: (
    pageIndex: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ) => void;
  onSnapshot: (croppedCanvas: HTMLCanvasElement) => void;
  annotations: Annotation[];
  onUpdateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  onDeleteAnnotation: (id: string) => void;
}

export function PdfViewer({
  pdfBytes,
  pageNum,
  onPageChange,
  onTotalPagesChange,
  stampMode,
  textMode,
  shapeMode,
  whiteRectMode,
  snapshotMode,
  onStampPlaced,
  onTextPlaced,
  onShapeDrawn,
  onWhiteRectDrawn,
  onSnapshot,
  annotations,
  onUpdateAnnotation,
  onDeleteAnnotation,
}: PdfViewerProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pagePtSize, setPagePtSize] = useState<{ w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

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

  const getPt = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!shapeMode && !whiteRectMode && !snapshotMode) return;
    const p = getPt(e);
    if (!p) return;
    setDrag({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!drag) return;
    const p = getPt(e);
    if (!p) return;
    setDrag({ ...drag, x2: p.x, y2: p.y });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!drag) {
      setDrag(null);
      return;
    }
    const p = getPt(e);
    if (p && Math.hypot(p.x - drag.x1, p.y - drag.y1) > 4) {
      if (shapeMode) {
        onShapeDrawn(pageNum - 1, drag.x1, drag.y1, p.x, p.y);
      } else if (whiteRectMode) {
        onWhiteRectDrawn(pageNum - 1, drag.x1, drag.y1, p.x, p.y);
      } else if (snapshotMode && canvasRef.current) {
        // Canvas を切り取って渡す (pt → canvas px = pt * scale)
        const sx = Math.min(drag.x1, p.x) * scale;
        const sy = Math.min(drag.y1, p.y) * scale;
        const sw = Math.abs(p.x - drag.x1) * scale;
        const sh = Math.abs(p.y - drag.y1) * scale;
        const crop = document.createElement('canvas');
        crop.width = Math.max(1, Math.round(sw));
        crop.height = Math.max(1, Math.round(sh));
        const ctx = crop.getContext('2d')!;
        ctx.drawImage(canvasRef.current, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
        onSnapshot(crop);
      }
    }
    setDrag(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (shapeMode || whiteRectMode || snapshotMode) return; // ドラッグモード中は click 無視
    if (!pagePtSize) return;
    const p = getPt(e);
    if (!p) return;
    if (stampMode) {
      const sizePt = 70;
      onStampPlaced(pageNum - 1, p.x - sizePt / 2, p.y - sizePt / 2, sizePt);
    } else if (textMode) {
      onTextPlaced(pageNum - 1, p.x, p.y);
    }
  };

  const shapeLabel: Record<ShapeKind, string> = {
    rect: '⬜ 矩形',
    circle: '⭕ 円',
    arrow: '➡ 矢印',
    highlight: '🖍 マーカー',
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
            <span className="text-xs text-orange-700">押印モード「{stampMode.name}」</span>
          </div>
        )}
        {textMode && (
          <div className="ml-4 px-3 py-1 bg-blue-50 border border-blue-300 rounded">
            <span className="text-xs text-blue-700">✏ テキスト追加モード</span>
          </div>
        )}
        {shapeMode && (
          <div className="ml-4 px-3 py-1 bg-red-50 border border-red-300 rounded">
            <span className="text-xs text-red-700">
              {shapeLabel[shapeMode]} モード — ドラッグして範囲指定
            </span>
          </div>
        )}
        {whiteRectMode && (
          <div className="ml-4 px-3 py-1 bg-gray-50 border border-gray-400 rounded">
            <span className="text-xs text-gray-700">
              ⌫ 白塗りモード — ドラッグした範囲を白く隠す（後でドラッグで移動・サイズ調整可）
            </span>
          </div>
        )}
        {snapshotMode && (
          <div className="ml-4 px-3 py-1 bg-cyan-50 border border-cyan-400 rounded">
            <span className="text-xs text-cyan-700">
              📸 スナップショット — ドラッグした範囲を画像化（クリップボード + 保存可）
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
        <div className="relative">
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setDrag(null)}
            onClick={handleClick}
            className={`shadow-xl bg-white ${stampMode || textMode || shapeMode || whiteRectMode || snapshotMode ? 'cursor-crosshair' : ''}`}
          />
          {/* 注釈レイヤー (テキスト・印鑑をドラッグで移動) */}
          <AnnotationLayer
            annotations={annotations}
            pageIndex={pageNum - 1}
            scale={scale}
            onUpdate={onUpdateAnnotation}
            onDelete={onDeleteAnnotation}
          />
          {/* ドラッグプレビュー */}
          {drag && (shapeMode || whiteRectMode || snapshotMode) && (
            <div
              className={`absolute pointer-events-none border-2 border-dashed ${
                whiteRectMode
                  ? 'border-gray-600 bg-white/60'
                  : snapshotMode
                    ? 'border-cyan-600 bg-cyan-100/20'
                    : 'border-red-500 bg-red-100/20'
              }`}
              style={{
                left: Math.min(drag.x1, drag.x2) * scale,
                top: Math.min(drag.y1, drag.y2) * scale,
                width: Math.abs(drag.x2 - drag.x1) * scale,
                height: Math.abs(drag.y2 - drag.y1) * scale,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
