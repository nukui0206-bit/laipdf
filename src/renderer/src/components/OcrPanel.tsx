import { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import toast from 'react-hot-toast';

interface OcrPanelProps {
  open: boolean;
  onClose: () => void;
  pdfBytes: Uint8Array;
  currentPage: number;
  totalPages: number;
}

type Mode = 'current' | 'all';

export function OcrPanel({
  open,
  onClose,
  pdfBytes,
  currentPage,
  totalPages,
}: OcrPanelProps): React.JSX.Element | null {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState('');
  const [mode, setMode] = useState<Mode>('current');

  const runOcr = async (): Promise<void> => {
    setRunning(true);
    setResult('');
    setProgress(0);
    setStage('PDF 読込中...');

    try {
      const buffer = pdfBytes.slice().buffer;
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

      setStage('Tesseract 起動中... (初回は言語データ DL で 1-2 分)');
      const worker = await createWorker(['jpn', 'eng'], 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(m.progress);
            setStage(`OCR 実行中 ${Math.round(m.progress * 100)}%`);
          } else if (m.status) {
            setStage(m.status);
          }
        },
      });

      const targets = mode === 'current' ? [currentPage] : Array.from({ length: totalPages }, (_, i) => i + 1);
      const texts: string[] = [];

      for (const pageNum of targets) {
        setStage(`ページ ${pageNum} / ${targets[targets.length - 1]} を処理中...`);
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2 }); // 高解像度 = OCR 精度向上
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        const { data: { text } } = await worker.recognize(canvas);
        texts.push(`========== ページ ${pageNum} ==========\n${text.trim()}\n`);
      }

      await worker.terminate();
      setResult(texts.join('\n'));
      setStage('完了');
      toast.success(`${targets.length} ページの OCR 完了`);
    } catch (err) {
      console.error('[OcrPanel] error', err);
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : String(err) || '不明なエラー';
      toast.error('OCR に失敗しました: ' + msg);
      setStage('エラー: ' + msg);
    } finally {
      setRunning(false);
    }
  };

  const handleSaveTxt = async (): Promise<void> => {
    if (!result) return;
    const bytes = new TextEncoder().encode(result);
    const suggested = `ocr_result_${Date.now()}.txt`;
    // savePdf API を流用（拡張子は txt）
    try {
      const result2 = await window.laipdf.file.savePdf(bytes, suggested);
      if (result2.saved) toast.success('テキストを保存しました');
    } catch (err) {
      console.error(err);
      toast.error('保存に失敗しました');
    }
  };

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(result);
      toast.success('クリップボードにコピーしました');
    } catch {
      toast.error('コピーに失敗しました');
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      onClick={running ? undefined : onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">📖 OCR 文字読み取り</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none disabled:opacity-40"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3 mb-2">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                checked={mode === 'current'}
                onChange={() => setMode('current')}
                disabled={running}
              />
              現在ページのみ (P.{currentPage})
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
                disabled={running}
              />
              全 {totalPages} ページ
            </label>
            <button
              type="button"
              onClick={runOcr}
              disabled={running}
              className="ml-auto px-4 py-1.5 text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white rounded font-medium"
            >
              {running ? '実行中...' : '▶ OCR 実行'}
            </button>
          </div>
          {running && (
            <div>
              <div className="text-xs text-gray-600 mb-1">{stage}</div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-brand-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden flex flex-col p-5">
          <textarea
            value={result}
            onChange={(e) => setResult(e.target.value)}
            placeholder="OCR 結果がここに表示されます (編集可能)"
            className="flex-1 w-full p-3 border border-gray-300 rounded text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
            style={{ minHeight: '300px' }}
            readOnly={running}
          />
          {result && (
            <div className="mt-3 flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleCopy}
                className="px-4 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded font-medium"
              >
                📋 コピー
              </button>
              <button
                type="button"
                onClick={handleSaveTxt}
                className="px-4 py-1.5 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded font-medium"
              >
                💾 txt として保存
              </button>
            </div>
          )}
        </div>

        <div className="px-5 py-2 border-t border-gray-100 text-xs text-gray-400">
          ※ 初回実行時は jpn/eng の言語データ DL に 1-2 分かかります（次回以降キャッシュ）
        </div>
      </div>
    </div>
  );
}
