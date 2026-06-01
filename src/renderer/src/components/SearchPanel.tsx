import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

interface SearchPanelProps {
  open: boolean;
  onClose: () => void;
  pdfBytes: Uint8Array;
  onJump: (pageNum: number) => void;
}

interface SearchHit {
  pageNum: number;
  snippet: string;
}

const SNIPPET_LEN = 50; // ヒット箇所前後の表示文字数

export function SearchPanel({
  open,
  onClose,
  pdfBytes,
  onJump,
}: SearchPanelProps): React.JSX.Element | null {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setHits([]);
    }
  }, [open]);

  // 検索 (debounce 400ms)
  useEffect(() => {
    if (!open || !query.trim()) {
      setHits([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query.trim());
    }, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  const runSearch = async (q: string): Promise<void> => {
    setSearching(true);
    setHits([]);
    try {
      const buffer = pdfBytes.slice().buffer;
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const results: SearchHit[] = [];
      const qLower = q.toLowerCase();
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .map((it) => ('str' in it ? it.str : ''))
          .join(' ');
        const lowerText = text.toLowerCase();
        let pos = lowerText.indexOf(qLower);
        while (pos !== -1) {
          const start = Math.max(0, pos - SNIPPET_LEN);
          const end = Math.min(text.length, pos + q.length + SNIPPET_LEN);
          const snippet =
            (start > 0 ? '...' : '') +
            text.slice(start, end) +
            (end < text.length ? '...' : '');
          results.push({ pageNum: i, snippet });
          pos = lowerText.indexOf(qLower, pos + q.length);
          if (results.length > 100) break;
        }
        if (results.length > 100) break;
      }
      setHits(results);
    } catch (err) {
      console.error('[SearchPanel] search error', err);
    } finally {
      setSearching(false);
    }
  };

  if (!open) return null;

  const highlight = (text: string): React.ReactNode => {
    if (!query.trim()) return text;
    const lower = text.toLowerCase();
    const qLower = query.toLowerCase();
    const parts: React.ReactNode[] = [];
    let last = 0;
    let pos = lower.indexOf(qLower);
    let key = 0;
    while (pos !== -1) {
      if (pos > last) parts.push(text.slice(last, pos));
      parts.push(
        <mark key={key++} className="bg-yellow-300 px-0.5 rounded font-bold">
          {text.slice(pos, pos + query.length)}
        </mark>,
      );
      last = pos + query.length;
      pos = lower.indexOf(qLower, last);
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  return (
    <div className="fixed top-16 right-4 z-40 w-96 max-h-[70vh] bg-white shadow-2xl rounded-lg border border-gray-200 flex flex-col">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2">
        <span className="text-sm">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
          placeholder="PDF 内を検索..."
          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1"
          title="閉じる (Esc)"
        >
          ×
        </button>
      </div>

      <div className="px-3 py-1 text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
        {searching
          ? '検索中...'
          : query.trim()
            ? `${hits.length} 件ヒット${hits.length > 100 ? ' (100 件で打ち切り)' : ''}`
            : 'キーワードを入力'}
      </div>

      <div className="flex-1 overflow-y-auto">
        {hits.map((h, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onJump(h.pageNum)}
            className="w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-brand-50 transition-colors"
          >
            <div className="text-xs font-bold text-brand-700 mb-1">
              ページ {h.pageNum}
            </div>
            <div className="text-xs text-gray-700 leading-relaxed">
              {highlight(h.snippet)}
            </div>
          </button>
        ))}
        {!searching && query.trim() && hits.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-gray-400">
            「{query}」は見つかりませんでした
          </div>
        )}
      </div>
    </div>
  );
}
