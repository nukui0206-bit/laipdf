import { useEffect, useRef, useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import * as pdfjsLib from 'pdfjs-dist';

const DRAG_TYPE = 'pdf-thumbnail';

interface PageListProps {
  pdfBytes: Uint8Array;
  currentPage: number;
  onPageSelect: (page: number) => void;
  onDeletePage: (pageIndex: number) => void;
  onRotatePage: (pageIndex: number, deg: 90 | 180 | 270) => void;
  onReorderPages: (newOrder: number[]) => void;
}

interface DragItem {
  pageIndex: number;
}

interface ThumbnailProps {
  pdf: pdfjsLib.PDFDocumentProxy;
  pageNum: number;
  pageIndex: number;
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDropOnto: (fromIndex: number, toIndex: number) => void;
}

function Thumbnail({
  pdf,
  pageNum,
  pageIndex,
  isActive,
  onClick,
  onContextMenu,
  onDropOnto,
}: ThumbnailProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [{ isDragging }, dragRef] = useDrag<DragItem, void, { isDragging: boolean }>({
    type: DRAG_TYPE,
    item: { pageIndex },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [{ isOver, canDrop }, dropRef] = useDrop<
    DragItem,
    void,
    { isOver: boolean; canDrop: boolean }
  >({
    accept: DRAG_TYPE,
    canDrop: (item) => item.pageIndex !== pageIndex,
    drop: (item) => onDropOnto(item.pageIndex, pageIndex),
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  // ref 合成
  dragRef(dropRef(wrapperRef));

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

  const showDropIndicator = isOver && canDrop;

  return (
    <div
      ref={wrapperRef}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`
        group relative w-full p-2 rounded-md transition-all cursor-grab active:cursor-grabbing
        ${isActive
          ? 'bg-brand-50 ring-2 ring-brand-500'
          : 'bg-white hover:bg-gray-100 ring-1 ring-gray-200'}
        ${isDragging ? 'opacity-30' : ''}
        ${showDropIndicator ? 'ring-2 ring-orange-500 bg-orange-50' : ''}
      `}
    >
      <canvas
        ref={canvasRef}
        className="w-full bg-white shadow-sm pointer-events-none"
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
    </div>
  );
}

interface ContextMenuState {
  x: number;
  y: number;
  pageIndex: number;
}

export function PageList({
  pdfBytes,
  currentPage,
  onPageSelect,
  onDeletePage,
  onRotatePage,
  onReorderPages,
}: PageListProps): React.JSX.Element {
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buffer = pdfBytes.slice().buffer;
        const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
        if (cancelled) return;
        setPdf(doc);
        setPageCount(doc.numPages);
      } catch (err) {
        console.error('[PageList] load error', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBytes]);

  useEffect(() => {
    if (!menu) return;
    const close = (): void => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  const handleDropOnto = (fromIndex: number, toIndex: number): void => {
    if (fromIndex === toIndex) return;
    const order = Array.from({ length: pageCount }, (_, i) => i);
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);
    onReorderPages(order);
  };

  if (!pdf) {
    return (
      <aside className="w-48 border-r border-gray-200 bg-gray-50 p-3 text-xs text-gray-400">
        読み込み中...
      </aside>
    );
  }

  return (
    <>
      <aside className="w-48 border-r border-gray-200 bg-gray-50 overflow-y-auto">
        <div className="p-2 border-b border-gray-200 text-xs font-bold text-gray-600 sticky top-0 bg-gray-50 z-10">
          ページ ({pageCount})
          <div className="text-gray-400 font-normal mt-0.5">ドラッグで並び替え / 右クリックで操作</div>
        </div>
        <div className="p-2 space-y-2">
          {Array.from({ length: pageCount }, (_, i) => i).map((pageIndex) => {
            const pageNum = pageIndex + 1;
            return (
              <Thumbnail
                key={pageIndex}
                pdf={pdf}
                pageNum={pageNum}
                pageIndex={pageIndex}
                isActive={pageNum === currentPage}
                onClick={() => onPageSelect(pageNum)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, pageIndex });
                }}
                onDropOnto={handleDropOnto}
              />
            );
          })}
        </div>
      </aside>

      {menu && (
        <div
          className="fixed z-50 bg-white shadow-xl rounded-md border border-gray-200 py-1 min-w-[160px] text-sm"
          style={{ left: menu.x, top: menu.y }}
        >
          <div className="px-3 py-1 text-xs text-gray-400 border-b border-gray-100">
            ページ {menu.pageIndex + 1}
          </div>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2"
            onClick={() => onRotatePage(menu.pageIndex, 90)}
          >
            ↻ 右に 90° 回転
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2"
            onClick={() => onRotatePage(menu.pageIndex, 270)}
          >
            ↺ 左に 90° 回転
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2"
            onClick={() => onRotatePage(menu.pageIndex, 180)}
          >
            ⟲ 180° 回転
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 flex items-center gap-2"
            onClick={() => onDeletePage(menu.pageIndex)}
          >
            🗑 このページを削除
          </button>
        </div>
      )}
    </>
  );
}
