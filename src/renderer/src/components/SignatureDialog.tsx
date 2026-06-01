import { useEffect, useRef } from 'react';
import SignaturePad from 'signature_pad';

interface SignatureDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (dataUrl: string) => void;
}

export function SignatureDialog({
  open,
  onClose,
  onSubmit,
}: SignatureDialogProps): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const canvas = canvasRef.current;
    // DPR 対応で綺麗に描画
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d')?.scale(ratio, ratio);
    const pad = new SignaturePad(canvas, {
      backgroundColor: 'rgba(255,255,255,0)', // 透過
      penColor: '#0a0a0a',
      minWidth: 1.2,
      maxWidth: 3,
    });
    padRef.current = pad;
    return () => {
      pad.off();
      padRef.current = null;
    };
  }, [open]);

  const handleClear = (): void => {
    padRef.current?.clear();
  };

  const handleSubmit = (): void => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      alert('何か描いてから「使う」を押してください');
      return;
    }
    // 透過 PNG
    const dataUrl = pad.toDataURL('image/png');
    onSubmit(dataUrl);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-gray-800 mb-3">✍ 手書き署名</h2>
        <p className="text-xs text-gray-500 mb-3">マウスで署名を書いてください</p>

        <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white relative">
          <canvas
            ref={canvasRef}
            className="block w-full"
            style={{ height: '240px', touchAction: 'none' }}
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="px-4 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded font-medium"
          >
            🗑 クリア
          </button>
          <div className="ml-auto flex gap-2">
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
              この署名を使う → PDF クリックで配置
            </button>
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-400">
          ※ 確定後、PDF 上をクリックすると署名が配置されます。一度きりの利用です。
          常用したい場合は「印鑑管理」に登録してください。
        </div>
      </div>
    </div>
  );
}
