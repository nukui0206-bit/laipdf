import { useState } from 'react';
import { PdfViewer } from './components/PdfViewer';
import { DropZone } from './components/DropZone';

function App(): React.JSX.Element {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string>('');

  const handleFile = async (file: File): Promise<void> => {
    const buffer = await file.arrayBuffer();
    setPdfBytes(new Uint8Array(buffer));
    setFileName(file.name);
  };

  const handleClose = (): void => {
    setPdfBytes(null);
    setFileName('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📄</span>
          <h1 className="text-lg font-bold text-gray-800">LaiPDF</h1>
          <span className="text-xs text-gray-400">v0.1.0 (dev)</span>
        </div>
        {pdfBytes && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 truncate max-w-md">{fileName}</span>
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
          <PdfViewer pdfBytes={pdfBytes} />
        ) : (
          <DropZone onFile={handleFile} />
        )}
      </main>

      {/* フッター */}
      <footer className="bg-white border-t border-gray-200 px-4 py-2 text-xs text-gray-500 flex justify-between">
        <span>{pdfBytes ? `${(pdfBytes.byteLength / 1024).toFixed(1)} KB` : 'ファイル未選択'}</span>
        <span>© Laiweb / L&apos;aide</span>
      </footer>
    </div>
  );
}

export default App;
