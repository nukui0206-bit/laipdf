import { useCallback, useEffect, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { PdfViewer } from './components/PdfViewer';
import { PageList } from './components/PageList';
import { DropZone } from './components/DropZone';
import { StampManager } from './components/StampManager';
import { TextInputDialog } from './components/TextInputDialog';
import { SplitDialog } from './components/SplitDialog';
import { LicenseScreen } from './components/LicenseScreen';
import { SearchPanel } from './components/SearchPanel';
import { SignatureDialog } from './components/SignatureDialog';
import { OcrPanel } from './components/OcrPanel';
import { CompressDialog } from './components/CompressDialog';
import { ToolSidebar } from './components/ToolSidebar';
import { PrintDialog } from './components/PrintDialog';
import { Undo2, Save, X as XIcon, FileText, Settings, Printer } from 'lucide-react';
// resources/logo.png を src/renderer/src/assets/ にコピー済みのものを参照
import logoUrl from './assets/logo.png';
import type { StampMeta, LicenseInfo } from '../../preload';
import {
  deletePage,
  rotatePage,
  reorderPages,
  mergePdfs,
  splitPdf,
  imagesToPdf,
  flattenAnnotations,
} from './services/pdfService';
import type { Annotation, ShapeKind } from './types/annotation';

function App(): React.JSX.Element {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [stampModalOpen, setStampModalOpen] = useState(false);
  const [stampMode, setStampMode] = useState<StampMeta | null>(null);
  const [textMode, setTextMode] = useState(false);
  const [shapeMode, setShapeMode] = useState<ShapeKind | null>(null);
  const [whiteRectMode, setWhiteRectMode] = useState(false);
  const [snapshotMode, setSnapshotMode] = useState(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [compressOpen, setCompressOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [shapeColor, setShapeColor] = useState<{ r: number; g: number; b: number; label: string }>({
    r: 0.85, g: 0.1, b: 0.1, label: '赤',
  });
  const [lineWidth, setLineWidth] = useState(2);
  const [undoStack, setUndoStack] = useState<Uint8Array[]>([]);
  const MAX_UNDO = 10;

  // pdfBytes を更新する前に履歴に push (ファイル開いた時/閉じた時は履歴クリア)
  const pushHistory = useCallback((current: Uint8Array) => {
    setUndoStack((prev) => {
      const next = [...prev, current];
      if (next.length > MAX_UNDO) next.shift();
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) {
      toast('取り消す操作がありません', { icon: 'ℹ' });
      return;
    }
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setPdfBytes(prev);
    toast.success('1 操作を取り消しました');
  }, [undoStack]);

  // Ctrl+Z + Ctrl+F キーバインド
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (isInput) return;
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        if (!pdfBytes) return;
        e.preventDefault();
        setSearchOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !e.shiftKey) {
        if (!pdfBytes) return;
        if (isInput) return;
        e.preventDefault();
        void handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        if (!pdfBytes) return;
        e.preventDefault();
        void handlePrint();
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, pdfBytes, searchOpen]);
  const [pendingTextSpot, setPendingTextSpot] = useState<{
    pageIndex: number;
    xPt: number;
    yPt: number;
  } | null>(null);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [licenseChecked, setLicenseChecked] = useState(false);

  // 起動時にライセンス状態を取得
  useEffect(() => {
    (async () => {
      try {
        const status = await window.laipdf.license.status();
        if (status.activated && status.license) {
          setLicense(status.license);
        }
      } catch (err) {
        console.error('license check failed', err);
      } finally {
        setLicenseChecked(true);
      }
    })();
  }, []);

  const handleFile = async (file: File): Promise<void> => {
    const buffer = await file.arrayBuffer();
    setPdfBytes(new Uint8Array(buffer));
    setFileName(file.name);
    setCurrentPage(1);
    setIsDirty(false);
    setUndoStack([]);
    setAnnotations([]);
  };

  const handleClose = (): void => {
    if (isDirty && !confirm('変更が保存されていません。閉じてもよろしいですか？')) return;
    setPdfBytes(null);
    setFileName('');
    setCurrentPage(1);
    setTotalPages(0);
    setIsDirty(false);
    setStampMode(null);
    setUndoStack([]);
    setAnnotations([]);
  };

  const handleTotalPagesChange = useCallback((n: number) => setTotalPages(n), []);

  const handleDeletePage = async (pageIndex: number): Promise<void> => {
    if (!pdfBytes) return;
    if (totalPages <= 1) {
      toast.error('最後のページは削除できません');
      return;
    }
    try {
      pushHistory(pdfBytes);
      const updated = await deletePage(pdfBytes, pageIndex);
      setPdfBytes(updated);
      setIsDirty(true);
      if (currentPage > totalPages - 1) {
        setCurrentPage(Math.max(1, totalPages - 1));
      }
      toast.success(`ページ ${pageIndex + 1} を削除しました`);
    } catch (err) {
      console.error(err);
      toast.error('削除に失敗しました');
    }
  };

  const handleReorderPages = async (newOrder: number[]): Promise<void> => {
    if (!pdfBytes) return;
    try {
      pushHistory(pdfBytes);
      const updated = await reorderPages(pdfBytes, newOrder);
      setPdfBytes(updated);
      setIsDirty(true);
      toast.success('ページを並び替えました');
    } catch (err) {
      console.error(err);
      toast.error('並び替えに失敗しました');
    }
  };

  const handleRotatePage = async (
    pageIndex: number,
    deg: 90 | 180 | 270,
  ): Promise<void> => {
    if (!pdfBytes) return;
    try {
      pushHistory(pdfBytes);
      const updated = await rotatePage(pdfBytes, pageIndex, deg);
      setPdfBytes(updated);
      setIsDirty(true);
      toast.success(`ページ ${pageIndex + 1} を ${deg}° 回転しました`);
    } catch (err) {
      console.error(err);
      toast.error('回転に失敗しました');
    }
  };

  const handleTextPlaced = (pageIndex: number, xPt: number, yPt: number): void => {
    setPendingTextSpot({ pageIndex, xPt, yPt });
  };

  const handleTextSubmit = (
    text: string,
    fontSize: number,
    color: { r: number; g: number; b: number },
  ): void => {
    if (!pdfBytes || !pendingTextSpot) return;
    setAnnotations((prev) => [
      ...prev,
      {
        id: `text-${Date.now()}-${Math.random()}`,
        kind: 'text',
        pageIndex: pendingTextSpot.pageIndex,
        x: pendingTextSpot.xPt,
        y: pendingTextSpot.yPt,
        fontSize,
        text,
        color,
      },
    ]);
    setIsDirty(true);
    toast.success('テキストを配置 (ドラッグで移動可)');
    setPendingTextSpot(null);
  };

  const handleStampPlaced = (
    pageIndex: number,
    xPt: number,
    yPt: number,
    sizePt: number,
  ): void => {
    if (!pdfBytes || !stampMode) return;
    const img = new Image();
    img.onload = () => {
      const aspect = img.height / img.width;
      const w = sizePt;
      const h = sizePt * aspect;
      setAnnotations((prev) => [
        ...prev,
        {
          id: `stamp-${Date.now()}-${Math.random()}`,
          kind: 'stamp',
          pageIndex,
          x: xPt,
          y: yPt,
          width: w,
          height: h,
          dataUrl: stampMode.dataUrl,
          name: stampMode.name,
        },
      ]);
      setIsDirty(true);
      toast.success(`「${stampMode.name}」を配置 (ドラッグで移動可)`);
    };
    img.src = stampMode.dataUrl;
  };

  const handleUpdateAnnotation = (id: string, patch: Partial<Annotation>): void => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)),
    );
    setIsDirty(true);
  };

  const handleDeleteAnnotation = (id: string): void => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    setIsDirty(true);
    toast.success('削除しました');
  };

  const handleSnapshot = (croppedCanvas: HTMLCanvasElement): void => {
    croppedCanvas.toBlob(async (blob) => {
      if (!blob) {
        toast.error('スナップショットに失敗しました');
        return;
      }
      // クリップボードにコピー
      let copied = false;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        copied = true;
      } catch (e) {
        console.warn('clipboard copy failed', e);
      }
      // ファイル保存
      try {
        const buffer = new Uint8Array(await blob.arrayBuffer());
        const suggested = `snapshot_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.png`;
        const result = await window.laipdf.file.savePdf(buffer, suggested);
        if (result.saved) {
          toast.success(copied ? 'クリップボードコピー + PNG 保存' : 'PNG として保存しました');
        } else if (copied) {
          toast.success('クリップボードにコピーしました');
        }
      } catch (err) {
        console.error(err);
      }
      setSnapshotMode(false);
    }, 'image/png');
  };

  const handleWhiteRectDrawn = (
    pageIndex: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): void => {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    setAnnotations((prev) => [
      ...prev,
      {
        id: `wr-${Date.now()}-${Math.random()}`,
        kind: 'white-rect',
        pageIndex,
        x,
        y,
        width: w,
        height: h,
      },
    ]);
    setIsDirty(true);
    toast.success('白塗りを配置 (上からテキスト追加できます)');
  };

  const handleShapeDrawn = (
    pageIndex: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): void => {
    if (!pdfBytes || !shapeMode) return;
    setAnnotations((prev) => [
      ...prev,
      {
        id: `shape-${Date.now()}-${Math.random()}`,
        kind: 'shape',
        pageIndex,
        shape: shapeMode,
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y2 - y1,
        color:
          shapeMode === 'highlight'
            ? { r: 1, g: 0.95, b: 0 }
            : { r: shapeColor.r, g: shapeColor.g, b: shapeColor.b },
        lineWidth,
      },
    ]);
    setIsDirty(true);
    toast.success('図形を配置 (ドラッグで移動可)');
  };

  const handleImagesToPdf = async (): Promise<void> => {
    try {
      const picked = await window.laipdf.file.pickImages();
      if (picked.canceled || !picked.files || picked.files.length === 0) return;
      const pdfData = await imagesToPdf(picked.files);
      setPdfBytes(pdfData);
      setFileName(`画像から作成_${picked.files.length}枚.pdf`);
      setCurrentPage(1);
      setIsDirty(true);
      toast.success(`${picked.files.length} 枚の画像から PDF を作成しました`);
    } catch (err) {
      console.error(err);
      toast.error('PDF 作成に失敗しました');
    }
  };

  const handleMerge = async (): Promise<void> => {
    if (!pdfBytes) return;
    try {
      const picked = await window.laipdf.file.openPdfs();
      if (picked.canceled || !picked.files || picked.files.length === 0) return;
      pushHistory(pdfBytes);
      const buffers = [pdfBytes, ...picked.files.map((f) => f.bytes)];
      const merged = await mergePdfs(buffers);
      setPdfBytes(merged);
      setIsDirty(true);
      const names = picked.files.map((f) => f.name).join(', ');
      toast.success(`${picked.files.length} ファイルを末尾に結合: ${names}`);
    } catch (err) {
      console.error(err);
      toast.error('結合に失敗しました');
    }
  };

  const handleSplit = async (ranges: [number, number][]): Promise<void> => {
    if (!pdfBytes) return;
    try {
      const parts = await splitPdf(pdfBytes, ranges);
      const baseName = fileName.replace(/\.pdf$/i, '');
      let saved = 0;
      for (let i = 0; i < parts.length; i++) {
        const [s, e] = ranges[i];
        const suffix = s === e ? `${s + 1}` : `${s + 1}-${e + 1}`;
        const suggested = `${baseName}_${suffix}.pdf`;
        const res = await window.laipdf.file.savePdf(parts[i], suggested);
        if (res.saved) saved++;
      }
      toast.success(`${saved} / ${parts.length} ファイルを保存しました`);
    } catch (err) {
      console.error(err);
      toast.error('分割に失敗しました');
    }
  };

  const handlePrint = (): void => {
    if (!pdfBytes) return;
    setPrintOpen(true);
  };

  const handleSave = async (): Promise<void> => {
    if (!pdfBytes) return;
    try {
      // 注釈レイヤーを焼き込み
      const finalBytes =
        annotations.length > 0
          ? await flattenAnnotations(pdfBytes, annotations)
          : pdfBytes;
      const suggested = fileName.replace(/\.pdf$/i, '_編集済み.pdf');
      const result = await window.laipdf.file.savePdf(finalBytes, suggested);
      if (result.saved) {
        setIsDirty(false);
        setAnnotations([]);
        setPdfBytes(finalBytes);
        toast.success('保存しました');
      }
    } catch (err) {
      console.error(err);
      toast.error('保存に失敗しました');
    }
  };

  // ライセンス未認証 → ライセンス画面のみ
  if (!licenseChecked) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        起動中...
      </div>
    );
  }
  if (!license) {
    return <LicenseScreen onActivated={setLicense} />;
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex flex-col h-full">
        <Toaster
          position="top-right"
          containerStyle={{ zIndex: 9999, top: 60 }}
          toastOptions={{
            duration: 2000,
            style: { fontSize: '13px', padding: '8px 14px' },
          }}
        />

        <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src={logoUrl} alt="L'aide" className="w-7 h-7 object-contain" />
            <h1 className="text-base font-bold text-gray-800">LaiPDF</h1>
            <span className="text-xs text-gray-400 ml-1">v0.1.0</span>
          </div>

          <div className="flex-1 flex items-center justify-center">
            {pdfBytes && (
              <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded text-xs text-gray-600 max-w-md truncate">
                <FileText size={12} strokeWidth={1.5} className="shrink-0" />
                <span className="truncate">{fileName}</span>
                {isDirty && <span className="text-orange-500 ml-1">●</span>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {pdfBytes && (
              <>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-700"
                  title="元に戻す (Ctrl+Z)"
                >
                  <Undo2 size={18} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-700"
                  title="印刷 (Ctrl+P)"
                >
                  <Printer size={18} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-sm font-medium"
                >
                  <Save size={14} strokeWidth={2} />
                  保存
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                  title="閉じる"
                >
                  <XIcon size={18} strokeWidth={1.75} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setStampModalOpen(true)}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              title="設定・印鑑管理"
            >
              <Settings size={18} strokeWidth={1.75} />
            </button>
          </div>
        </header>

        {/* モード時の色・線幅サブツールバー */}
        {pdfBytes && ((shapeMode && shapeMode !== 'highlight') || textMode) && (
          <div className="bg-white border-b border-gray-200 px-4 py-1.5 flex items-center gap-3 text-xs">
            <span className="text-gray-500">色:</span>
            {[
              { r: 0.85, g: 0.10, b: 0.10, label: '赤' },
              { r: 0.10, g: 0.30, b: 0.85, label: '青' },
              { r: 0.10, g: 0.55, b: 0.20, label: '緑' },
              { r: 0,    g: 0,    b: 0,    label: '黒' },
            ].map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => setShapeColor(c)}
                className={`w-5 h-5 rounded-full border-2 ${shapeColor.label === c.label ? 'border-gray-800 scale-110' : 'border-gray-300'}`}
                style={{ backgroundColor: `rgb(${c.r * 255},${c.g * 255},${c.b * 255})` }}
                title={c.label}
              />
            ))}
            <span className="ml-2 text-gray-500">線幅:</span>
            {[1, 2, 4, 6].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setLineWidth(w)}
                className={`px-2 py-0.5 rounded ${lineWidth === w ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {w}pt
              </button>
            ))}
          </div>
        )}

        <main className="flex-1 overflow-hidden bg-gray-100">
          {pdfBytes ? (
            <div className="flex h-full">
              <ToolSidebar
                textMode={textMode}
                stampActive={stampMode !== null}
                shapeActive={shapeMode !== null}
                whiteRectMode={whiteRectMode}
                snapshotMode={snapshotMode}
                onOpenStamps={() => {
                  setTextMode(false); setShapeMode(null); setWhiteRectMode(false); setSnapshotMode(false);
                  setStampModalOpen(true);
                }}
                onOpenSignature={() => {
                  setTextMode(false); setShapeMode(null); setWhiteRectMode(false); setSnapshotMode(false);
                  setSignatureOpen(true);
                }}
                onToggleText={() => {
                  if (textMode) setTextMode(false);
                  else { setStampMode(null); setShapeMode(null); setWhiteRectMode(false); setSnapshotMode(false); setTextMode(true); }
                }}
                onOpenShapeMenu={() => setShapeMenuOpen(true)}
                onToggleWhiteRect={() => {
                  if (whiteRectMode) setWhiteRectMode(false);
                  else { setStampMode(null); setTextMode(false); setShapeMode(null); setSnapshotMode(false); setWhiteRectMode(true); }
                }}
                onToggleSnapshot={() => {
                  if (snapshotMode) setSnapshotMode(false);
                  else { setStampMode(null); setTextMode(false); setShapeMode(null); setWhiteRectMode(false); setSnapshotMode(true); }
                }}
                onOpenSearch={() => setSearchOpen(true)}
                onOpenOcr={() => setOcrOpen(true)}
                onMerge={handleMerge}
                onOpenSplit={() => setSplitDialogOpen(true)}
                onImagesToPdf={handleImagesToPdf}
                onOpenCompress={() => setCompressOpen(true)}
              />
              <PageList
                pdfBytes={pdfBytes}
                currentPage={currentPage}
                onPageSelect={setCurrentPage}
                onDeletePage={handleDeletePage}
                onRotatePage={handleRotatePage}
                onReorderPages={handleReorderPages}
              />
              <div className="flex-1 overflow-hidden">
                <PdfViewer
                  pdfBytes={pdfBytes}
                  pageNum={currentPage}
                  onPageChange={setCurrentPage}
                  onTotalPagesChange={handleTotalPagesChange}
                  stampMode={stampMode}
                  textMode={textMode}
                  shapeMode={shapeMode}
                  whiteRectMode={whiteRectMode}
                  snapshotMode={snapshotMode}
                  onStampPlaced={handleStampPlaced}
                  onTextPlaced={handleTextPlaced}
                  onShapeDrawn={handleShapeDrawn}
                  onWhiteRectDrawn={handleWhiteRectDrawn}
                  onSnapshot={handleSnapshot}
                  annotations={annotations}
                  onUpdateAnnotation={handleUpdateAnnotation}
                  onDeleteAnnotation={handleDeleteAnnotation}
                />
              </div>
            </div>
          ) : (
            <DropZone onFile={handleFile} onImagesToPdf={handleImagesToPdf} />
          )}
        </main>

        <footer className="bg-white border-t border-gray-200 px-4 py-2 text-xs text-gray-500 flex justify-between">
          <span>
            {pdfBytes
              ? `${(pdfBytes.byteLength / 1024).toFixed(1)} KB ・ ${totalPages} ページ${isDirty ? ' ・ 未保存' : ''}`
              : 'ファイル未選択'}
          </span>
          <span>
            {license.isTrialMode
              ? `🆓 体験版 (${Math.max(0, Math.ceil(((license.expiresAt ?? 0) - Date.now()) / (24 * 60 * 60 * 1000)))} 日残り)`
              : `✅ ${license.email || 'ライセンス済み'}`}
            ・ © Laiweb / L&apos;aide
          </span>
        </footer>

        <StampManager
          open={stampModalOpen}
          onClose={() => setStampModalOpen(false)}
          onSelect={(s) => setStampMode(s)}
          selectedId={stampMode?.id ?? null}
        />
        <TextInputDialog
          open={pendingTextSpot !== null}
          onClose={() => setPendingTextSpot(null)}
          onSubmit={handleTextSubmit}
        />
        {/* 図形選択モーダル */}
        {shapeMenuOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center"
            onClick={() => setShapeMenuOpen(false)}
          >
            <div
              className="bg-white rounded-lg shadow-2xl p-4 w-72"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-bold text-gray-700 mb-3">図形を選択</h3>
              <div className="grid grid-cols-2 gap-2">
                {(['rect', 'circle', 'arrow', 'highlight'] as ShapeKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setStampMode(null);
                      setTextMode(false);
                      setWhiteRectMode(false);
                      setSnapshotMode(false);
                      setShapeMode(k);
                      setShapeMenuOpen(false);
                    }}
                    className="flex flex-col items-center gap-1 p-3 border border-gray-200 hover:border-brand-500 hover:bg-brand-50 rounded text-sm"
                  >
                    <span className="text-2xl">
                      {k === 'rect' && '⬜'}
                      {k === 'circle' && '⭕'}
                      {k === 'arrow' && '➡'}
                      {k === 'highlight' && '🖍'}
                    </span>
                    <span className="text-xs">
                      {k === 'rect' && '矩形'}
                      {k === 'circle' && '円'}
                      {k === 'arrow' && '矢印'}
                      {k === 'highlight' && 'マーカー'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <SplitDialog
          open={splitDialogOpen}
          onClose={() => setSplitDialogOpen(false)}
          totalPages={totalPages}
          onSubmit={handleSplit}
        />
        {pdfBytes && (
          <SearchPanel
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            pdfBytes={pdfBytes}
            onJump={(p) => setCurrentPage(p)}
          />
        )}
        {pdfBytes && (
          <OcrPanel
            open={ocrOpen}
            onClose={() => setOcrOpen(false)}
            pdfBytes={pdfBytes}
            currentPage={currentPage}
            totalPages={totalPages}
          />
        )}
        {pdfBytes && (
          <PrintDialog
            open={printOpen}
            onClose={() => setPrintOpen(false)}
            pdfBytes={pdfBytes}
            annotations={annotations}
            totalPages={totalPages}
            currentPage={currentPage}
          />
        )}
        {pdfBytes && (
          <CompressDialog
            open={compressOpen}
            onClose={() => setCompressOpen(false)}
            pdfBytes={pdfBytes}
            fileName={fileName}
            onResult={(bytes, name) => {
              pushHistory(pdfBytes);
              setPdfBytes(bytes);
              setFileName(name);
              setIsDirty(true);
              setAnnotations([]);
            }}
          />
        )}
        <SignatureDialog
          open={signatureOpen}
          onClose={() => setSignatureOpen(false)}
          onSubmit={(dataUrl) => {
            // 仮想スタンプとして押印モードに移行
            setStampMode({
              id: `sig-${Date.now()}`,
              name: '手書き署名',
              fileName: 'signature.png',
              createdAt: Date.now(),
              dataUrl,
            });
            toast.success('PDF をクリックして署名を配置してください');
          }}
        />
      </div>
    </DndProvider>
  );
}

export default App;
