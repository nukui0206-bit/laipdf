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
import type { StampMeta, LicenseInfo } from '../../preload';
import {
  deletePage,
  rotatePage,
  reorderPages,
  mergePdfs,
  splitPdf,
  imagesToPdf,
  drawShape,
  flattenAnnotations,
  type ShapeKind,
} from './services/pdfService';
import type { Annotation } from './types/annotation';

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
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

  const handleShapeDrawn = async (
    pageIndex: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): Promise<void> => {
    if (!pdfBytes || !shapeMode) return;
    try {
      pushHistory(pdfBytes);
      const updated = await drawShape(
        pdfBytes,
        pageIndex,
        shapeMode,
        x1,
        y1,
        x2,
        y2,
        shapeMode === 'highlight'
          ? { r: 1, g: 0.95, b: 0 }
          : { r: shapeColor.r, g: shapeColor.g, b: shapeColor.b },
        lineWidth,
      );
      setPdfBytes(updated);
      setIsDirty(true);
      toast.success(`図形を追加しました`);
    } catch (err) {
      console.error(err);
      toast.error('図形の追加に失敗しました');
    }
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

        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📄</span>
            <h1 className="text-lg font-bold text-gray-800">LaiPDF</h1>
            <span className="text-xs text-gray-400">v0.1.0 (dev)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStampModalOpen(true)}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded font-medium"
              title="印鑑を登録・管理"
            >
              🖼 印鑑管理
            </button>
            {pdfBytes && (
              <>
                {/* Undo */}
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-40 rounded font-medium"
                  title="Ctrl+Z で元に戻す"
                >
                  ↶ 元に戻す ({undoStack.length})
                </button>

                {/* 色選択 (図形 / マーカー以外) */}
                {(shapeMode && shapeMode !== 'highlight') || textMode ? (
                  <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded">
                    <span className="text-xs text-gray-500">色:</span>
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
                        className={`w-5 h-5 rounded border-2 ${shapeColor.label === c.label ? 'border-gray-800 scale-110' : 'border-gray-300'}`}
                        style={{ backgroundColor: `rgb(${c.r * 255},${c.g * 255},${c.b * 255})` }}
                        title={c.label}
                      />
                    ))}
                    <span className="ml-2 text-xs text-gray-500">線:</span>
                    {[1, 2, 4, 6].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setLineWidth(w)}
                        className={`px-2 py-0.5 text-xs rounded ${lineWidth === w ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border border-gray-300'}`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                ) : null}

                {textMode ? (
                  <button
                    type="button"
                    onClick={() => setTextMode(false)}
                    className="px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded font-medium"
                  >
                    ✕ テキスト解除
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setStampMode(null);
                      setShapeMode(null);
                      setWhiteRectMode(false);
                      setTextMode(true);
                    }}
                    className="px-3 py-1.5 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded font-medium"
                  >
                    ✏ テキスト追加
                  </button>
                )}
                {whiteRectMode ? (
                  <button
                    type="button"
                    onClick={() => setWhiteRectMode(false)}
                    className="px-3 py-1.5 text-sm bg-gray-300 hover:bg-gray-400 text-gray-800 rounded font-medium"
                  >
                    ✕ 白塗り解除
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setStampMode(null);
                      setTextMode(false);
                      setShapeMode(null);
                      setWhiteRectMode(true);
                    }}
                    className="px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-medium"
                    title="既存文字を白く隠す（上からテキストで書き換え）"
                  >
                    ⌫ 白塗り編集
                  </button>
                )}
                {shapeMode ? (
                  <button
                    type="button"
                    onClick={() => setShapeMode(null)}
                    className="px-3 py-1.5 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded font-medium"
                  >
                    ✕ 図形解除
                  </button>
                ) : (
                  <div className="relative group">
                    <button
                      type="button"
                      className="px-3 py-1.5 text-sm bg-red-50 hover:bg-red-100 text-red-700 rounded font-medium"
                    >
                      🔷 図形 ▾
                    </button>
                    <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded shadow-lg hidden group-hover:block z-20">
                      {(['rect', 'circle', 'arrow', 'highlight'] as ShapeKind[]).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => {
                            setStampMode(null);
                            setTextMode(false);
                            setShapeMode(k);
                          }}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100"
                        >
                          {k === 'rect' && '⬜ 矩形 (赤枠)'}
                          {k === 'circle' && '⭕ 円 (赤枠)'}
                          {k === 'arrow' && '➡ 矢印 (赤)'}
                          {k === 'highlight' && '🖍 マーカー (黄)'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {stampMode ? (
                  <button
                    type="button"
                    onClick={() => setStampMode(null)}
                    className="px-3 py-1.5 text-sm bg-orange-100 hover:bg-orange-200 text-orange-700 rounded font-medium"
                  >
                    ✕ 押印モード解除
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setTextMode(false);
                      setShapeMode(null);
                      setWhiteRectMode(false);
                      setStampModalOpen(true);
                    }}
                    className="px-3 py-1.5 text-sm bg-orange-50 hover:bg-orange-100 text-orange-700 rounded font-medium"
                  >
                    🖌 押印する
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setTextMode(false);
                    setShapeMode(null);
                    setSignatureOpen(true);
                  }}
                  className="px-3 py-1.5 text-sm bg-purple-50 hover:bg-purple-100 text-purple-700 rounded font-medium"
                >
                  ✍ 手書き署名
                </button>
                <button
                  type="button"
                  onClick={() => setSearchOpen((v) => !v)}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-medium"
                  title="Ctrl+F でも開く"
                >
                  🔍 検索
                </button>
                <button
                  type="button"
                  onClick={() => setOcrOpen(true)}
                  className="px-3 py-1.5 text-sm bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded font-medium"
                  title="スキャン PDF などから文字を読み取り"
                >
                  📖 OCR
                </button>
                <button
                  type="button"
                  onClick={handleMerge}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-medium"
                  title="他の PDF を末尾に結合"
                >
                  🔗 結合
                </button>
                <button
                  type="button"
                  onClick={() => setSplitDialogOpen(true)}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-medium"
                  title="ページ範囲で分割"
                >
                  📤 分割
                </button>
                <span className="text-sm text-gray-600 truncate max-w-xs ml-2">
                  {fileName}
                  {isDirty && <span className="ml-1 text-orange-500">●</span>}
                </span>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-4 py-1.5 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded font-medium"
                >
                  💾 保存
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                >
                  閉じる
                </button>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-hidden bg-gray-100">
          {pdfBytes ? (
            <div className="flex h-full">
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
                  onStampPlaced={handleStampPlaced}
                  onTextPlaced={handleTextPlaced}
                  onShapeDrawn={handleShapeDrawn}
                  onWhiteRectDrawn={handleWhiteRectDrawn}
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
