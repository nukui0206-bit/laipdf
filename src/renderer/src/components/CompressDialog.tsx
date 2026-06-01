import { useState } from 'react';
import toast from 'react-hot-toast';
import { compressPdf } from '../services/pdfService';

interface CompressDialogProps {
  open: boolean;
  onClose: () => void;
  pdfBytes: Uint8Array;
  fileName: string;
  onResult: (compressed: Uint8Array, name: string) => void;
}

type Preset = {
  label: string;
  dpi: number;
  quality: number;
  hint: string;
};

const PRESETS: Preset[] = [
  { label: '🚀 最小 (低画質)',   dpi: 72,  quality: 0.5, hint: 'メール添付・Web 共有用 (画質低下大)' },
  { label: '⚖ 標準 (推奨)',      dpi: 96,  quality: 0.7, hint: '画面表示・印刷ある程度きれい' },
  { label: '✨ 高画質',           dpi: 150, quality: 0.85, hint: '印刷用 (圧縮率は控えめ)' },
];

export function CompressDialog({
  open,
  onClose,
  pdfBytes,
  fileName,
  onResult,
}: CompressDialogProps): React.JSX.Element | null {
  const [presetIdx, setPresetIdx] = useState(1);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);

  const handleRun = async (): Promise<void> => {
    setRunning(true);
    setProgress(0);
    setResultBytes(null);
    try {
      const preset = PRESETS[presetIdx];
      const compressed = await compressPdf(
        pdfBytes,
        preset.dpi,
        preset.quality,
        (p) => setProgress(p),
      );
      setResultBytes(compressed);
      toast.success('圧縮完了');
    } catch (err) {
      console.error(err);
      toast.error('圧縮に失敗しました');
    } finally {
      setRunning(false);
    }
  };

  const handleApply = (): void => {
    if (!resultBytes) return;
    const newName = fileName.replace(/\.pdf$/i, '_圧縮版.pdf');
    onResult(resultBytes, newName);
    onClose();
  };

  if (!open) return null;

  const originalKB = (pdfBytes.byteLength / 1024).toFixed(1);
  const compressedKB = resultBytes ? (resultBytes.byteLength / 1024).toFixed(1) : null;
  const ratio = resultBytes
    ? Math.round((1 - resultBytes.byteLength / pdfBytes.byteLength) * 100)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      onClick={running ? undefined : onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-gray-800 mb-3">🗜 PDF 圧縮</h2>
        <p className="text-xs text-gray-500 mb-4">
          各ページを JPEG 画像に変換してサイズ削減。
          <br />
          <span className="text-amber-600">※ テキスト検索・コピーはできなくなります</span>
        </p>

        <div className="space-y-2 mb-4">
          {PRESETS.map((p, i) => (
            <label
              key={p.label}
              className={`block px-3 py-2 border rounded cursor-pointer ${
                presetIdx === i ? 'bg-brand-50 border-brand-500' : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="preset"
                className="mr-2"
                checked={presetIdx === i}
                onChange={() => setPresetIdx(i)}
                disabled={running}
              />
              <span className="font-medium text-sm">{p.label}</span>
              <div className="text-xs text-gray-500 ml-5">
                {p.dpi}dpi / JPEG {Math.round(p.quality * 100)}% — {p.hint}
              </div>
            </label>
          ))}
        </div>

        {running && (
          <div className="mb-3">
            <div className="text-xs text-gray-600 mb-1">圧縮中 {Math.round(progress * 100)}%</div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-brand-600 h-2 rounded-full transition-all"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {resultBytes && (
          <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded">
            <div className="text-sm font-medium text-emerald-700 mb-1">圧縮結果</div>
            <div className="text-xs text-gray-700">
              元: <strong>{originalKB} KB</strong> → 圧縮後: <strong>{compressedKB} KB</strong>
              <span className="ml-2 px-1.5 py-0.5 bg-emerald-600 text-white rounded text-xs font-bold">
                -{ratio}%
              </span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="px-4 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded font-medium disabled:opacity-40"
          >
            {resultBytes ? '閉じる' : 'キャンセル'}
          </button>
          {!resultBytes ? (
            <button
              type="button"
              onClick={handleRun}
              disabled={running}
              className="px-4 py-1.5 text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white rounded font-medium"
            >
              {running ? '圧縮中...' : '▶ 圧縮実行'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium"
            >
              ✓ この圧縮版を採用
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
