import { useCallback, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { PdfViewer } from './components/PdfViewer';
import { PageList } from './components/PageList';
import { DropZone } from './components/DropZone';
import { deletePage, rotatePage, reorderPages } from './services/pdfService';

function App(): React.JSX.Element {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isDirty, setIsDirty] = useState(false);

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
      // 削除後に currentPage が範囲外になる可能性
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

      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📄</span>
          <h1 className="text-lg font-bold text-gray-800">LaiPDF</h1>
          <span className="text-xs text-gray-400">v0.1.0 (dev)</span>
        </div>
        {pdfBytes && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 truncate max-w-md">
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
          </div>
        )}
      </header>

      {/* メインエリア */}
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
              />
            </div>
          </div>
        ) : (
          <DropZone onFile={handleFile} />
        )}
      </main>

      {/* フッター */}
      <footer className="bg-white border-t border-gray-200 px-4 py-2 text-xs text-gray-500 flex justify-between">
        <span>
          {pdfBytes
            ? `${(pdfBytes.byteLength / 1024).toFixed(1)} KB ・ ${totalPages} ページ${isDirty ? ' ・ 未保存' : ''}`
            : 'ファイル未選択'}
        </span>
        <span>© Laiweb / L&apos;aide</span>
      </footer>
    </div>
    </DndProvider>
  );
}

export default App;
