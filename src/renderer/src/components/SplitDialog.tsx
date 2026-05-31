import { useState } from 'react';

interface SplitDialogProps {
  open: boolean;
  onClose: () => void;
  totalPages: number;
  onSubmit: (ranges: [number, number][]) => void;
}

type Mode = 'ranges' | 'each';

export function SplitDialog({
  open,
  onClose,
  totalPages,
  onSubmit,
}: SplitDialogProps): React.JSX.Element | null {
  const [mode, setMode] = useState<Mode>('ranges');
  const [rangeText, setRangeText] = useState<string>(`1-${totalPages}`);
  const [error, setError] = useState<string>('');

  const parseRanges = (text: string): [number, number][] | string => {
    const parts = text
      .split(/[,、]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return '範囲を指定してください';
    const ranges: [number, number][] = [];
    for (const p of parts) {
      const m = p.match(/^(\d+)(?:\s*[-〜~]\s*(\d+))?$/);
      if (!m) return `「${p}」の形式が不正です（例: 1-3, 5, 7-10）`;
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : start;
      if (start < 1 || end < 1 || start > totalPages || end > totalPages) {
        return `「${p}」がページ範囲外 (1-${totalPages})`;
      }
      if (start > end) return `「${p}」の順序が逆です`;
      ranges.push([start - 1, end - 1]); // 0 始まりへ
    }
    return ranges;
  };

  const handleSubmit = (): void => {
    setError('');
    let ranges: [number, number][];
    if (mode === 'each') {
      ranges = Array.from({ length: totalPages }, (_, i): [number, number] => [i, i]);
    } else {
      const parsed = parseRanges(rangeText);
      if (typeof parsed === 'string') {
        setError(parsed);
        return;
      }
      ranges = parsed;
    }
    onSubmit(ranges);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-gray-800 mb-4">📤 PDF を分割</h2>

        <div className="space-y-3 mb-4">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              checked={mode === 'ranges'}
              onChange={() => setMode('ranges')}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="text-sm font-medium">範囲を指定</div>
              <div className="text-xs text-gray-500 mb-2">
                カンマ区切り。例: <code>1-3, 5, 7-10</code> (3 つの PDF に分割)
              </div>
              <input
                type="text"
                value={rangeText}
                onChange={(e) => setRangeText(e.target.value)}
                onFocus={() => setMode('ranges')}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="1-3, 5, 7-10"
              />
            </div>
          </label>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              checked={mode === 'each'}
              onChange={() => setMode('each')}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="text-sm font-medium">全ページを 1 ファイルずつ</div>
              <div className="text-xs text-gray-500">
                {totalPages} 個の PDF ファイルが作成されます
              </div>
            </div>
          </label>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="text-xs text-gray-500 mb-3">
          ※ 分割した各 PDF は、それぞれ保存先を選んで保存します
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded font-medium"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-1.5 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded font-medium"
          >
            分割
          </button>
        </div>
      </div>
    </div>
  );
}
