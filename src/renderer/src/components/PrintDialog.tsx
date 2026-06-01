import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { flattenAnnotations } from '../services/pdfService';
import type { Annotation } from '../types/annotation';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PrintDialogProps {
  open: boolean;
  onClose: () => void;
  pdfBytes: Uint8Array;
  annotations: Annotation[];
  totalPages: number;
  currentPage: number;
}

type PageMode = 'all' | 'current' | 'range';
type ColorMode = 'color' | 'gray';
type Landscape = 'auto' | 'portrait' | 'landscape';
type Duplex = 'simplex' | 'shortEdge' | 'longEdge';
type FitMode = 'fit' | 'actual' | 'shrink' | 'custom';
type PerSheet = 1 | 2 | 4 | 6 | 9 | 16;

interface Printer {
  name: string;
  displayName: string;
  isDefault: boolean;
}

export function PrintDialog({
  open,
  onClose,
  pdfBytes,
  annotations,
  totalPages,
  currentPage,
}: PrintDialogProps): React.JSX.Element | null {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [device, setDevice] = useState<string>('');
  const [copies, setCopies] = useState(1);
  const [pageMode, setPageMode] = useState<PageMode>('all');
  const [rangeText, setRangeText] = useState('');
  const [color, setColor] = useState<ColorMode>('color');
  const [landscape, setLandscape] = useState<Landscape>('auto');
  // scaleFactor は customScale/fitMode で代替 (旧 state は維持しない)
  const scaleFactor = 100;
  const [duplex, setDuplex] = useState<Duplex>('simplex');
  const [fitMode, setFitMode] = useState<FitMode>('fit');
  const [customScale, setCustomScale] = useState(100);
  const [perSheet, setPerSheet] = useState<PerSheet>(1);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreviewPage(currentPage);
    (async () => {
      try {
        const list = await window.laipdf.file.listPrinters();
        setPrinters(list);
        const def = list.find((p) => p.isDefault) ?? list[0];
        if (def) setDevice(def.name);
      } catch (err) {
        console.error('[PrintDialog] listPrinters', err);
      }
    })();
  }, [open, currentPage]);

  // プレビュー画像 (現在ページを設定反映で描画)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreviewLoading(true);
    (async () => {
      try {
        const finalBytes =
          annotations.length > 0
            ? await flattenAnnotations(pdfBytes, annotations)
            : pdfBytes;
        const buffer = finalBytes.slice().buffer;
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        if (cancelled) return;
        const idx = Math.max(1, Math.min(previewPage, pdf.numPages));
        const page = await pdf.getPage(idx);
        // プレビュー用倍率 (適度に縮小)
        const previewScale = 0.7;
        const userScale = fitMode === 'custom' ? customScale / 100 : 1;
        const viewport = page.getViewport({
          scale: previewScale * userScale,
          rotation: landscape === 'landscape' ? 90 : 0,
        });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = color === 'gray' ? '#f0f0f0' : 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;
        // グレースケール時は CSS フィルター適用するのでスキップ
        setPreviewUrl(canvas.toDataURL('image/jpeg', 0.85));
      } catch (err) {
        console.error('[PrintDialog] preview', err);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, previewPage, fitMode, customScale, landscape, color, annotations, pdfBytes]);

  const parseRange = (text: string): Array<{ from: number; to: number }> | string => {
    const parts = text.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return 'ページを指定してください';
    const ranges: Array<{ from: number; to: number }> = [];
    for (const p of parts) {
      const m = p.match(/^(\d+)(?:\s*[-〜~]\s*(\d+))?$/);
      if (!m) return `「${p}」の形式が不正です (例: 1-3, 5)`;
      const from = Number(m[1]);
      const to = m[2] ? Number(m[2]) : from;
      if (from < 1 || to < 1 || from > totalPages || to > totalPages || from > to) {
        return `「${p}」が範囲外 (1-${totalPages})`;
      }
      ranges.push({ from: from - 1, to: to - 1 });
    }
    return ranges;
  };

  const handlePrint = async (silent: boolean): Promise<void> => {
    if (!device) {
      toast.error('プリンタを選択してください');
      return;
    }
    let pageRanges: Array<{ from: number; to: number }> | undefined;
    if (pageMode === 'current') {
      pageRanges = [{ from: currentPage - 1, to: currentPage - 1 }];
    } else if (pageMode === 'range') {
      const r = parseRange(rangeText);
      if (typeof r === 'string') {
        toast.error(r);
        return;
      }
      pageRanges = r;
    }

    setRunning(true);
    try {
      const finalBytes =
        annotations.length > 0
          ? await flattenAnnotations(pdfBytes, annotations)
          : pdfBytes;

      // fitMode → scaleFactor 変換
      let effectiveScale = scaleFactor;
      if (fitMode === 'custom') effectiveScale = customScale;

      // 印刷対象ページを決定
      const allIndices = pageRanges
        ? pageRanges.flatMap((r) => {
            const arr: number[] = [];
            for (let i = r.from; i <= r.to; i++) arr.push(i);
            return arr;
          })
        : Array.from({ length: totalPages }, (_, i) => i);

      // PDF を pdf.js で画像化 → HTML 化
      const buffer = finalBytes.slice().buffer;
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const imgTags: string[] = [];
      const dpr = 150 / 72; // 印刷品質 150dpi
      for (const idx of allIndices) {
        const page = await pdf.getPage(idx + 1);
        const viewport = page.getViewport({ scale: dpr });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        // JPEG 70% で軽量化
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        // ページごとに改ページ
        imgTags.push(
          `<div class="page"><img src="${dataUrl}" alt="page ${idx + 1}"/></div>`,
        );
      }

      const isLandscape = landscape === 'landscape';
      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
@page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; background: white; }
.page {
  width: 100%;
  height: 100vh;
  page-break-after: always;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
}
.page:last-child { page-break-after: auto; }
.page img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style></head>
<body>${imgTags.join('')}</body></html>`;

      const result = await window.laipdf.file.printHtml(html, {
        deviceName: device,
        copies,
        // 全ページ画像化済みなので pageRanges は渡さない (1 ファイル 1 ジョブ)
        color: color === 'color',
        landscape: landscape === 'auto' ? 'auto' : isLandscape,
        scaleFactor: effectiveScale,
        duplex,
        pagesPerSheet: perSheet,
        silent,
      });
      if (result.ok) {
        toast.success(silent ? '印刷を送信しました' : '印刷ジョブを受け付けました');
        onClose();
      } else if (result.message && result.message !== 'cancelled') {
        toast.error('印刷失敗: ' + result.message);
      }
    } catch (err) {
      console.error(err);
      toast.error('印刷に失敗しました');
    } finally {
      setRunning(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={running ? undefined : onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">🖨 印刷</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none disabled:opacity-40"
          >
            ×
          </button>
        </div>

        <div className="flex-1 grid grid-cols-[1fr_320px] gap-0 overflow-hidden">

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* プリンター + 部数 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">プリンター</label>
              <select
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
                disabled={running}
              >
                {printers.length === 0 && <option value="">プリンタが見つかりません</option>}
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName} {p.isDefault ? '(既定)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">部数</label>
              <input
                type="number"
                min={1}
                max={999}
                value={copies}
                onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
                disabled={running}
              />
            </div>
          </div>

          {/* 印刷するページ */}
          <div className="border rounded p-3">
            <div className="text-xs font-bold text-gray-700 mb-2">印刷するページ</div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={pageMode === 'all'} onChange={() => setPageMode('all')} />
                <span>すべて（{totalPages} ページ）</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={pageMode === 'current'} onChange={() => setPageMode('current')} />
                <span>現在のページ（{currentPage}）</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={pageMode === 'range'} onChange={() => setPageMode('range')} />
                <span>ページ指定</span>
                <input
                  type="text"
                  value={rangeText}
                  onChange={(e) => setRangeText(e.target.value)}
                  onFocus={() => setPageMode('range')}
                  placeholder="例: 1-3, 5, 7-10"
                  className="flex-1 px-2 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </label>
            </div>
          </div>

          {/* カラー + 向き */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">カラー</label>
              <select
                value={color}
                onChange={(e) => setColor(e.target.value as ColorMode)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded"
                disabled={running}
              >
                <option value="color">カラー</option>
                <option value="gray">グレースケール</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">向き</label>
              <select
                value={landscape}
                onChange={(e) => setLandscape(e.target.value as Landscape)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded"
                disabled={running}
              >
                <option value="auto">自動</option>
                <option value="portrait">縦</option>
                <option value="landscape">横</option>
              </select>
            </div>
          </div>

          {/* ページサイズ処理 */}
          <div className="border rounded p-3">
            <div className="text-xs font-bold text-gray-700 mb-2">ページサイズ処理</div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {([
                { v: 'fit',    label: '合わせる',         hint: '用紙に収まるように自動調整' },
                { v: 'actual', label: '実際のサイズ',     hint: '100% で印刷' },
                { v: 'shrink', label: '特大ページを縮小', hint: '大きすぎる時だけ縮小' },
                { v: 'custom', label: 'カスタム倍率',     hint: '%を指定' },
              ] as const).map((m) => (
                <label
                  key={m.v}
                  className={`flex items-start gap-2 p-2 border rounded cursor-pointer text-sm ${
                    fitMode === m.v ? 'bg-brand-50 border-brand-500' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    className="mt-0.5"
                    checked={fitMode === m.v}
                    onChange={() => setFitMode(m.v)}
                    disabled={running}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{m.label}</div>
                    <div className="text-xs text-gray-500">{m.hint}</div>
                  </div>
                </label>
              ))}
            </div>
            {fitMode === 'custom' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">倍率:</span>
                <input
                  type="number"
                  min={10}
                  max={400}
                  step={1}
                  value={customScale}
                  onChange={(e) => setCustomScale(Math.max(10, Math.min(400, Number(e.target.value) || 100)))}
                  className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                  disabled={running}
                />
                <span className="text-xs text-gray-600">%</span>
                <input
                  type="range"
                  min={10}
                  max={400}
                  step={5}
                  value={customScale}
                  onChange={(e) => setCustomScale(Number(e.target.value))}
                  className="flex-1"
                  disabled={running}
                />
              </div>
            )}
          </div>

          {/* N-up: 1 枚に複数ページ */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              1 枚に複数 PDF ページを印刷 (N-up)
            </label>
            <div className="flex gap-1.5">
              {([1, 2, 4, 6, 9, 16] as PerSheet[]).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPerSheet(n)}
                  className={`flex-1 px-2 py-1.5 text-sm rounded border ${
                    perSheet === n
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white border-gray-300 hover:bg-gray-50'
                  }`}
                  disabled={running}
                >
                  {n === 1 ? '1 (通常)' : `${n} ページ`}
                </button>
              ))}
            </div>
            {perSheet > 1 && (
              <div className="text-xs text-gray-500 mt-1.5">
                ※ PDF の {perSheet} ページを 1 枚の用紙にまとめて印刷します
              </div>
            )}
          </div>

          {/* 両面印刷 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">両面印刷</label>
            <div className="flex gap-3">
              {([
                { v: 'simplex', label: '片面' },
                { v: 'longEdge', label: '両面 (長辺で綴じ)' },
                { v: 'shortEdge', label: '両面 (短辺で綴じ)' },
              ] as const).map((d) => (
                <label key={d.v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={duplex === d.v}
                    onChange={() => setDuplex(d.v)}
                    disabled={running}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </div>

          {running && (
            <div className="text-xs text-brand-600 text-center py-2">印刷準備中...</div>
          )}
        </div>

        {/* 右: プレビュー */}
        <div className="border-l border-gray-200 bg-gray-50 flex flex-col p-4">
          <div className="text-xs font-bold text-gray-600 mb-2">プレビュー</div>
          <div className="flex-1 flex items-center justify-center bg-gray-200 rounded overflow-hidden relative min-h-0">
            {previewLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10 text-xs text-gray-500">
                生成中...
              </div>
            )}
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="preview"
                className={`max-w-full max-h-full object-contain shadow-md bg-white ${color === 'gray' ? 'grayscale' : ''}`}
              />
            ) : (
              <div className="text-xs text-gray-400">プレビュー無し</div>
            )}
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-1">
              <button
                type="button"
                onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                disabled={previewPage <= 1}
                className="px-2 py-0.5 text-xs bg-white border border-gray-300 rounded disabled:opacity-30 hover:bg-gray-100"
              >
                ‹
              </button>
              <input
                type="range"
                min={1}
                max={totalPages}
                value={previewPage}
                onChange={(e) => setPreviewPage(Number(e.target.value))}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => setPreviewPage((p) => Math.min(totalPages, p + 1))}
                disabled={previewPage >= totalPages}
                className="px-2 py-0.5 text-xs bg-white border border-gray-300 rounded disabled:opacity-30 hover:bg-gray-100"
              >
                ›
              </button>
            </div>
            <div className="text-sm text-gray-700 text-center font-medium mt-1">
              ページ {previewPage} / {totalPages}
            </div>
          </div>
        </div>

        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="px-4 py-1.5 text-sm bg-white hover:bg-gray-100 border border-gray-300 rounded font-medium disabled:opacity-40"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => handlePrint(false)}
            disabled={running}
            className="px-4 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded font-medium disabled:opacity-40"
            title="OS の印刷ダイアログも表示"
          >
            詳細設定…
          </button>
          <button
            type="button"
            onClick={() => handlePrint(true)}
            disabled={running}
            className="px-4 py-1.5 text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white rounded font-medium"
          >
            🖨 印刷
          </button>
        </div>
      </div>
    </div>
  );
}
