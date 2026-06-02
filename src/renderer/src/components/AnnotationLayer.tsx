import { useEffect, useRef, useState } from 'react';
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

type DragLocal = {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export function AnnotationLayer({
  annotations,
  pageIndex,
  scale,
  onUpdate,
  onDelete,
}: AnnotationLayerProps): React.JSX.Element {
  const [drag, setDrag] = useState<DragState | null>(null);
  // ドラッグ中の位置をローカル state で持つ → 親の再レンダーを抑制
  const [dragLocal, setDragLocal] = useState<DragLocal | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const pendingMouseEvent = useRef<{ clientX: number; clientY: number } | null>(null);

  // 現在ページの注釈だけ
  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);

  // ドラッグ中の位置で表示するためのオーバーレイ取得
  const getDisplayPos = (
    a: Annotation,
  ): { x: number; y: number; width?: number; height?: number } => {
    if (dragLocal?.id === a.id) {
      return {
        x: dragLocal.x,
        y: dragLocal.y,
        width: dragLocal.width,
        height: dragLocal.height,
      };
    }
    return { x: a.x, y: a.y };
  };

  // RAF throttle: mousemove はフレームレートに合わせて間引く
  const applyDrag = (clientX: number, clientY: number): void => {
    if (!drag) return;
    const dxPt = (clientX - drag.startMouseX) / scale;
    const dyPt = (clientY - drag.startMouseY) / scale;

    if (drag.mode === 'move') {
      setDragLocal({ id: drag.id, x: drag.startX + dxPt, y: drag.startY + dyPt });
    } else {
      const target = annotations.find((a) => a.id === drag.id);
      const newW = Math.max(20, drag.startW + dxPt);
      if (target?.kind === 'stamp') {
        const ratio = drag.startW > 0 ? drag.startH / drag.startW : 1;
        setDragLocal({
          id: drag.id,
          x: drag.startX,
          y: drag.startY,
          width: newW,
          height: newW * ratio,
        });
      } else {
        const newH = Math.max(10, drag.startH + dyPt);
        setDragLocal({
          id: drag.id,
          x: drag.startX,
          y: drag.startY,
          width: newW,
          height: newH,
        });
      }
    }
  };

  const onMouseMove = (e: React.MouseEvent): void => {
    if (!drag) return;
    e.preventDefault();
    pendingMouseEvent.current = { clientX: e.clientX, clientY: e.clientY };
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const ev = pendingMouseEvent.current;
        if (ev) applyDrag(ev.clientX, ev.clientY);
      });
    }
  };

  const onMouseUp = (): void => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (drag && dragLocal) {
      // ドロップ時に 1 回だけ親へ通知
      const patch: Partial<Annotation> = { x: dragLocal.x, y: dragLocal.y } as Partial<Annotation>;
      if (dragLocal.width !== undefined) (patch as { width: number }).width = dragLocal.width;
      if (dragLocal.height !== undefined) (patch as { height: number }).height = dragLocal.height;
      onUpdate(drag.id, patch);
    }
    setDrag(null);
    setDragLocal(null);
  };

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

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
        const disp = getDisplayPos(a);
        const left = disp.x * scale;
        const top = disp.y * scale;
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

        if (a.kind === 'shape') {
          // ドラッグ中は dragLocal の (x, y) を採用 (shape は move のみ)
          const ax = disp.x;
          const ay = disp.y;
          const minX = Math.min(ax, ax + a.width);
          const minY = Math.min(ay, ay + a.height);
          const absW = Math.abs(a.width);
          const absH = Math.abs(a.height);
          const colorCss = `rgb(${a.color.r * 255}, ${a.color.g * 255}, ${a.color.b * 255})`;
          const boxLeft = minX * scale;
          const boxTop = minY * scale;
          const boxW = absW * scale;
          const boxH = absH * scale;
          return (
            <div
              key={a.id}
              className={`absolute ${isSelected ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-blue-300'}`}
              style={{
                left: boxLeft,
                top: boxTop,
                width: boxW,
                height: boxH,
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
              {a.shape === 'rect' && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ border: `${a.lineWidth * scale}px solid ${colorCss}` }}
                />
              )}
              {a.shape === 'circle' && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    border: `${a.lineWidth * scale}px solid ${colorCss}`,
                    borderRadius: '50%',
                  }}
                />
              )}
              {a.shape === 'highlight' && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: 'rgba(255, 240, 0, 0.4)' }}
                />
              )}
              {a.shape === 'arrow' && (
                <svg
                  className="absolute pointer-events-none"
                  style={{
                    left: ax * scale - boxLeft,
                    top: ay * scale - boxTop,
                    width: a.width * scale,
                    height: a.height * scale,
                    overflow: 'visible',
                  }}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <marker
                      id={`arrowhead-${a.id}`}
                      markerWidth="10"
                      markerHeight="10"
                      refX="8"
                      refY="5"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 5, 0 10" fill={colorCss} />
                    </marker>
                  </defs>
                  <line
                    x1={0}
                    y1={0}
                    x2={a.width * scale}
                    y2={a.height * scale}
                    stroke={colorCss}
                    strokeWidth={a.lineWidth * scale}
                    markerEnd={`url(#arrowhead-${a.id})`}
                  />
                </svg>
              )}
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
                </>
              )}
            </div>
          );
        }

        if (a.kind === 'white-rect') {
          const w = disp.width ?? a.width;
          const h = disp.height ?? a.height;
          return (
            <div
              key={a.id}
              className={`absolute group ${isSelected ? 'ring-2 ring-blue-500' : 'ring-1 ring-dashed ring-gray-300 hover:ring-blue-300'}`}
              style={{
                left,
                top,
                width: w * scale,
                height: h * scale,
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
        const sw = disp.width ?? a.width;
        const sh = disp.height ?? a.height;
        return (
          <div
            key={a.id}
            className={`absolute group ${isSelected ? 'ring-2 ring-blue-500' : 'ring-1 ring-transparent hover:ring-blue-300'}`}
            style={{
              left,
              top,
              width: sw * scale,
              height: sh * scale,
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
