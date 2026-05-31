import { useEffect, useRef, useState } from 'react';

interface TextInputDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string, fontSize: number, color: { r: number; g: number; b: number }) => void;
}

const COLORS = [
  { label: '黒',   r: 0,    g: 0,    b: 0    },
  { label: '赤',   r: 0.85, g: 0.10, b: 0.10 },
  { label: '青',   r: 0.10, g: 0.30, b: 0.85 },
  { label: '緑',   r: 0.10, g: 0.55, b: 0.20 },
  { label: 'グレー', r: 0.40, g: 0.40, b: 0.40 },
];

export function TextInputDialog({
  open,
  onClose,
  onSubmit,
}: TextInputDialogProps): React.JSX.Element | null {
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(14);
  const [colorIdx, setColorIdx] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setText('');
      setFontSize(14);
      setColorIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSubmit = (): void => {
    if (!text.trim()) return;
    onSubmit(text.trim(), fontSize, COLORS[colorIdx]);
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
        <h2 className="text-lg font-bold text-gray-800 mb-4">✏ テキストを追加</h2>

        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">テキスト</label>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
              if (e.key === 'Escape') onClose();
            }}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
            placeholder="日付・氏名・備考など (Ctrl+Enter で確定)"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              フォントサイズ: {fontSize}pt
            </label>
            <input
              type="range"
              min={8}
              max={48}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">色</label>
            <div className="flex gap-1">
              {COLORS.map((c, i) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setColorIdx(i)}
                  className={`w-7 h-7 rounded border-2 transition-all ${
                    colorIdx === i ? 'border-brand-600 scale-110' : 'border-gray-200'
                  }`}
                  style={{ backgroundColor: `rgb(${c.r * 255}, ${c.g * 255}, ${c.b * 255})` }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
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
            disabled={!text.trim()}
            className="px-4 py-1.5 text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white rounded font-medium"
          >
            配置（Ctrl+Enter）
          </button>
        </div>
      </div>
    </div>
  );
}
