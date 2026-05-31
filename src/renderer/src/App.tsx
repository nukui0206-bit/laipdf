import { useCallback, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { PdfViewer } from './components/PdfViewer';
import { PageList } from './components/PageList';
import { DropZone } from './components/DropZone';
import { StampManager } from './components/StampManager';
import { TextInputDialog } from './components/TextInputDialog';
import type { StampMeta } from '../../preload';
import { deletePage, rotatePage, reorderPages, stampOnPage, addText } from './services/pdfService';

function App(): React.JSX.Element {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [stampModalOpen, setStampModalOpen] = useState(false);
  const [stampMode, setStampMode] = useState<StampMeta | null>(null);
  const [textMode, setTextMode] = useState(false);
  const [pendingTextSpot, setPendingTextSpot] = useState<{
    pageIndex: number;
    xPt: number;
    yPt: number;
  } | null>(null);

  const handleFile = async (file: File): Promise<void> => {
    const buffer = await file.arrayBuffer();
    setPdfBytes(new Uint8Array(buffer));
    setFileName(file.name);
    setCurrentPage(1);
    setIsDirty(false);
  };

  const handleClose = (): void => {
    if (isDirty && !confirm('変更が保存されていません。閉じてもよろしいですか？')) return;
    setPdfBytes(null);
    setFileName('');
    setCurrentPage(1);
    setTotalPages(0);
    setIsDirty(false);
    setStampMode(null);
  };

  const handleTotalPagesChange = useCallback((n: number) => setTotalPages(n), []);

  const handleDeletePage = async (pageIndex: number): Promise<void> => {
    if (!pdfBytes) return;
    if (totalPages <= 1) {
      toast.error('最後のページは削除できません');
      return;
    }
    try {
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

  const handleTextSubmit = async (
    text: string,
    fontSize: number,
    color: { r: number; g: number; b: number },
  ): Promise<void> => {
    if (!pdfBytes || !pendingTextSpot) return;
    try {
      const updated = await addText(
        pdfBytes,
        pendingTextSpot.pageIndex,
        text,
        pendingTextSpot.xPt,
        pendingTextSpot.yPt,
        fontSize,
        color,
      );
      setPdfBytes(updated);
      setIsDirty(true);
      toast.success('テキストを追加しました');
    } catch (err) {
      console.error(err);
      toast.error('テキスト追加に失敗しました');
    } finally {
      setPendingTextSpot(null);
    }
  };

  const handleStampPlaced = async (
    pageIndex: number,
    xPt: number,
    yPt: number,
    sizePt: number,
  ): Promise<void> => {
    if (!pdfBytes || !stampMode) return;
    try {
      // dataURL → bytes
      const base64 = stampMode.dataUrl.split(',')[1];
      const bin = atob(base64);
      const stampBytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) stampBytes[i] = bin.charCodeAt(i);

      const updated = await stampOnPage(pdfBytes, pageIndex, stampBytes, xPt, yPt, sizePt);
      setPdfBytes(updated);
      setIsDirty(true);
      toast.success(`「${stampMode.name}」を押印しました`);
    } catch (err) {
      console.error(err);
      toast.error('押印に失敗しました');
    }
  };

  const handleSave = async (): Promise<void> => {
    if (!pdfBytes) return;
    try {
      const suggested = fileName.replace(/\.pdf$/i, '_編集済み.pdf');
      const result = await window.laipdf.file.savePdf(pdfBytes, suggested);
      if (result.saved) {
        setIsDirty(false);
        toast.success('保存しました');
      }
    } catch (err) {
      console.error(err);
      toast.error('保存に失敗しました');
    }
  };

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
                      setTextMode(true);
                    }}
                    className="px-3 py-1.5 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded font-medium"
                  >
                    ✏ テキスト追加
                  </button>
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
                      setStampModalOpen(true);
                    }}
                    className="px-3 py-1.5 text-sm bg-orange-50 hover:bg-orange-100 text-orange-700 rounded font-medium"
                  >
                    🖌 押印する
                  </button>
                )}
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
                  onStampPlaced={handleStampPlaced}
                  onTextPlaced={handleTextPlaced}
                />
              </div>
            </div>
          ) : (
            <DropZone onFile={handleFile} />
          )}
        </main>

        <footer className="bg-white border-t border-gray-200 px-4 py-2 text-xs text-gray-500 flex justify-between">
          <span>
            {pdfBytes
              ? `${(pdfBytes.byteLength / 1024).toFixed(1)} KB ・ ${totalPages} ページ${isDirty ? ' ・ 未保存' : ''}`
              : 'ファイル未選択'}
          </span>
          <span>© Laiweb / L&apos;aide</span>
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
      </div>
    </DndProvider>
  );
}

export default App;
