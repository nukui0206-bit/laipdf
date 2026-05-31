import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

interface PageListProps {
  pdfBytes: Uint8Array;
  currentPage: number;
  onPageSelect: (page: number) => void;
}

interface ThumbnailProps {
  pdf: pdfjsLib.PDFDocumentProxy;
  pageNum: number;
  isActive: boolean;
  onClick: () => void;
}

function Thumbnail({ pdf, pageNum, isActive, onClick }: ThumbnailProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    let renderTask: pdfjsLib.RenderTask | null = null;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled || !canvasRef.current) return;
        const viewport = page.getViewport({ scale: 0.25 });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d')!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
      } catch (err) {
        if ((err as { name?: string })?.name !== 'RenderingCancelledException') {
          console.error('[Thumbnail] render error', err);
        }
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageNum]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        group relative w-full p-2 rounded-md transition-all
        ${isActive
          ? 'bg-brand-50 ring-2 ring-brand-500'
          : 'bg-white hover:bg-gray-100 ring-1 ring-gray-200'}
      `}
    >
      <canvas
        ref={canvasRef}
        className="w-full bg-white shadow-sm"
        style={{ display: 'block' }}
      />
      <div
        className={`
          mt-1 text-xs font-medium text-center
          ${isActive ? 'text-brand-700' : 'text-gray-600'}
        `}
      >
        {pageNum}
      </div>
    </button>
  );
}

export function PageList({ pdfBytes, currentPage, onPageSelect }: PageListProps): React.JSX.Element {
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buffer = pdfBytes.slice().buffer;
        const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
        if (cancelled) return;
        setPdf(doc);
        setPages(Array.from({ length: doc.numPages }, (_, i) => i + 1));
      } catch (err) {
        console.error('[PageList] load error', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBytes]);

  if (!pdf) {
    return (
      <aside className="w-48 border-r border-gray-200 bg-gray-50 p-3 text-xs text-gray-400">
        読み込み中...
      </aside>
    );
  }

  return (
    <aside className="w-48 border-r border-gray-200 bg-gray-50 overflow-y-auto">
      <div className="p-2 border-b border-gray-200 text-xs font-bold text-gray-600 sticky top-0 bg-gray-50 z-10">
        ページ ({pages.length})
      </div>
      <div className="p-2 space-y-2">
        {pages.map((pageNum) => (
          <Thumbnail
            key={pageNum}
            pdf={pdf}
            pageNum={pageNum}
            isActive={pageNum === currentPage}
            onClick={() => onPageSelect(pageNum)}
          />
        ))}
      </div>
    </aside>
  );
}
