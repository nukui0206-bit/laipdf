import { useRef, useState } from 'react';
import type { Annotation } from '../types/annotation';

interface AnnotationLayerProps {
  annotations: Annotation[];
  pageIndex: number;
  scale: number;
  onUpdate: (id: string, patch: Partial<Annotation>) => void;
  onDelete: (id: string) => void;
}

type DragState = {
  id: string;
  mode: 'move' | 'resize';
  startMouseX: number;
  startMouseY: number;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
};

export function AnnotationLayer({
  annotations,
  pageIndex,
  scale,
  onUpdate,
  onDelete,
}: AnnotationLayerProps): React.JSX.Element {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  // 現在ページの注釈だけ
  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);

  const onMouseMove = (e: React.MouseEvent): void => {
    if (!drag) return;
    e.preventDefault();
    const dxPt = (e.clientX - drag.startMouseX) / scale;
    const dyPt = (e.clientY - drag.startMouseY) / scale;

    if (drag.mode === 'move') {
      onUpdate(drag.id, { x: drag.startX + dxPt, y: drag.startY + dyPt });
    } else {
      const target = annotations.find((a) => a.id === drag.id);
      const newW = Math.max(20, drag.startW + dxPt);
      if (target?.kind === 'stamp') {
        // 等比リサイズ
        const ratio = drag.startW > 0 ? drag.startH / drag.startW : 1;
        onUpdate(drag.id, { width: newW, height: newW * ratio } as Partial<Annotation>);
      } else {
        // 独立リサイズ (white-rect)
        const newH = Math.max(10, drag.startH + dyPt);
        onUpdate(drag.id, { width: newW, height: newH } as Partial<Annotation>);
      }
    }
  };

  const onMouseUp = (): void => {
    if (drag) setDrag(null);
  };

  return (
    <div
      ref={layerRef}
      className="absolute inset-0"
      style={{ pointerEvents: 'none' }} // 個々の注釈だけイベント受ける
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {pageAnnotations.map((a) => {
        const left = a.x * scale;
        const top = a.y * scale;
        const isSelected = selectedId === a.id;

        if (a.kind === 'text') {
          return (
            <div
              key={a.id}
              className={`absolute group ${isSelected ? 'ring-2 ring-blue-500' : 'ring-1 ring-transparent hover:ring-blue-300'}`}
              style={{
                left,
                top,
                pointerEvents: 'auto',
                cursor: 'move',
                color: `rgb(${a.color.r * 255}, ${a.color.g * 255}, ${a.color.b * 255})`,
                fontSize: a.fontSize * scale,
                lineHeight: 1,
                fontFamily: 'sans-serif',
                whiteSpace: 'pre',
                padding: '2px 4px',
                background: isSelected ? 'rgba(59,130,246,0.05)' : 'transparent',
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                setSelectedId(a.id);
                setDrag({
                  id: a.id,
                  mode: 'move',
                  startMouseX: e.clientX,
                  startMouseY: e.clientY,
                  startX: a.x,
                  startY: a.y,
                  startW: 0,
                  startH: 0,
                });
              }}
            >
              {a.text}
              {isSelected && (
                <button
                  type="button"
                  className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold leading-none hover:bg-red-600"
                  style={{ pointerEvents: 'auto' }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(a.id);
                  }}
                  title="削除"
                >
                  ×
                </button>
              )}
            </div>
          );
        }

        if (a.kind === 'white-rect') {
          return (
            <div
              key={a.id}
              className={`absolute group ${isSelected ? 'ring-2 ring-blue-500' : 'ring-1 ring-dashed ring-gray-300 hover:ring-blue-300'}`}
              style={{
                left,
                top,
                width: a.width * scale,
                height: a.height * scale,
                pointerEvents: 'auto',
                cursor: 'move',
                background: 'white',
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                setSelectedId(a.id);
                setDrag({
                  id: a.id,
                  mode: 'move',
                  startMouseX: e.clientX,
                  startMouseY: e.clientY,
                  startX: a.x,
                  startY: a.y,
                  startW: a.width,
                  startH: a.height,
                });
              }}
            >
              {isSelected && (
                <>
                  <button
                    type="button"
                    className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold leading-none hover:bg-red-600"
                    style={{ pointerEvents: 'auto' }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(a.id);
                    }}
                  >
                    ×
                  </button>
                  <div
                    className="absolute -bottom-2 -right-2 w-4 h-4 bg-blue-500 rounded cursor-se-resize"
                    style={{ pointerEvents: 'auto' }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      // 白塗りは縦横独立リサイズ (アスペクト維持しない)
                      setDrag({
                        id: a.id,
                        mode: 'resize',
                        startMouseX: e.clientX,
                        startMouseY: e.clientY,
                        startX: a.x,
                        startY: a.y,
                        startW: a.width,
                        startH: a.height,
                      });
                    }}
                  />
                </>
              )}
            </div>
          );
        }

        // stamp
        return (
          <div
            key={a.id}
            className={`absolute group ${isSelected ? 'ring-2 ring-blue-500' : 'ring-1 ring-transparent hover:ring-blue-300'}`}
            style={{
              left,
              top,
              width: a.width * scale,
              height: a.height * scale,
              pointerEvents: 'auto',
              cursor: 'move',
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              setSelectedId(a.id);
              setDrag({
                id: a.id,
                mode: 'move',
                startMouseX: e.clientX,
                startMouseY: e.clientY,
                startX: a.x,
                startY: a.y,
                startW: a.width,
                startH: a.height,
              });
            }}
          >
            <img
              src={a.dataUrl}
              alt={a.name}
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
            {isSelected && (
              <>
                {/* 削除ボタン */}
                <button
                  type="button"
                  className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold leading-none hover:bg-red-600"
                  style={{ pointerEvents: 'auto' }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(a.id);
                  }}
                >
                  ×
                </button>
                {/* リサイズハンドル (右下) */}
                <div
                  className="absolute -bottom-2 -right-2 w-4 h-4 bg-blue-500 rounded cursor-se-resize"
                  style={{ pointerEvents: 'auto' }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setDrag({
                      id: a.id,
                      mode: 'resize',
                      startMouseX: e.clientX,
                      startMouseY: e.clientY,
                      startX: a.x,
                      startY: a.y,
                      startW: a.width,
                      startH: a.height,
                    });
                  }}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
