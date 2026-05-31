import { useCallback, useState } from 'react';

interface DropZoneProps {
  onFile: (file: File) => void;
  onImagesToPdf: () => void;
}

export function DropZone({ onFile, onImagesToPdf }: DropZoneProps): React.JSX.Element {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type === 'application/pdf') {
        onFile(file);
      } else {
        alert('PDF ファイルを選択してください');
      }
    },
    [onFile],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`
          w-full max-w-2xl h-96
          border-4 border-dashed rounded-2xl
          flex flex-col items-center justify-center
          transition-all duration-200
          ${isDragging
            ? 'border-brand-500 bg-brand-50 scale-105'
            : 'border-gray-300 bg-white hover:border-brand-500 hover:bg-brand-50'}
        `}
      >
        <div className="text-6xl mb-4">📄</div>
        <p className="text-xl font-semibold text-gray-700 mb-2">
          PDF をここにドラッグ&ドロップ
        </p>
        <p className="text-sm text-gray-500 mb-6">または</p>
        <label className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg cursor-pointer font-medium">
          ファイルを選択
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileSelect}
          />
        </label>
        <p className="mt-6 text-xs text-gray-400">
          ローカル処理のみ。ファイルはネットに送信されません。
        </p>

        <div className="mt-6 pt-6 border-t border-gray-200 w-full max-w-xs">
          <p className="text-xs text-center text-gray-400 mb-2">または</p>
          <button
            type="button"
            onClick={onImagesToPdf}
            className="w-full px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded font-medium text-sm flex items-center justify-center gap-2"
          >
            📷 画像 (JPG/PNG) から PDF 作成
          </button>
        </div>
      </div>
    </div>
  );
}
