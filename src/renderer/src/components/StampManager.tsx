import { useEffect, useState } from 'react';
import type { StampMeta } from '../../../preload';

interface StampManagerProps {
  open: boolean;
  onClose: () => void;
  onSelect?: (stamp: StampMeta) => void;
  selectedId?: string | null;
}

export function StampManager({
  open,
  onClose,
  onSelect,
  selectedId,
}: StampManagerProps): React.JSX.Element | null {
  const [stamps, setStamps] = useState<StampMeta[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async (): Promise<void> => {
    setLoading(true);
    try {
      const list = await window.laipdf.stamps.list();
      setStamps(list);
    } catch (err) {
      console.error('[StampManager] list error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const handleAdd = async (): Promise<void> => {
    try {
      const picked = await window.laipdf.stamps.pickImage();
      if (picked.canceled || !picked.bytes) return;
      await window.laipdf.stamps.add(picked.bytes, picked.name ?? '印鑑');
      await refresh();
    } catch (err) {
      console.error('[StampManager] add error', err);
      alert('画像の追加に失敗しました');
    }
  };

  const handleDelete = async (id: string, name: string): Promise<void> => {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    await window.laipdf.stamps.delete(id);
    await refresh();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">
            🖼 印鑑管理
            <span className="ml-2 text-xs text-gray-400 font-normal">{stamps.length} 件</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded font-medium text-sm"
          >
            ＋ 画像を追加（PNG / JPG）
          </button>
          <span className="ml-3 text-xs text-gray-500">透過 PNG 推奨 (256×256px 程度)</span>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center text-gray-400 py-10">読込中...</div>
          ) : stamps.length === 0 ? (
            <div className="text-center text-gray-400 py-10">
              まだ印鑑が登録されていません。<br />
              上の「画像を追加」から PNG / JPG をアップロードしてください。
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {stamps.map((s) => (
                <div
                  key={s.id}
                  className={`
                    relative border-2 rounded-lg p-3 transition-all bg-white
                    ${selectedId === s.id
                      ? 'border-brand-500 ring-2 ring-brand-200'
                      : 'border-gray-200 hover:border-brand-300'}
                  `}
                >
                  <div className="aspect-square flex items-center justify-center bg-gray-50 rounded mb-2">
                    <img
                      src={s.dataUrl}
                      alt={s.name}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <div className="text-xs font-medium text-gray-700 truncate">{s.name}</div>
                  <div className="mt-2 flex gap-1">
                    {onSelect && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(s);
                          onClose();
                        }}
                        className="flex-1 px-2 py-1 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded"
                      >
                        使う
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(s.id, s.name)}
                      className="px-2 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded"
                      title="削除"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
