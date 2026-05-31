import { useState } from 'react';
import type { LicenseInfo } from '../../../preload';

interface LicenseScreenProps {
  onActivated: (license: LicenseInfo) => void;
}

export function LicenseScreen({ onActivated }: LicenseScreenProps): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleActivate = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const result = await window.laipdf.license.verify(email, key);
      if (result.ok && result.license) {
        onActivated(result.license);
      } else {
        setError(result.message);
      }
    } catch (err) {
      console.error(err);
      setError('認証エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleTrial = async (): Promise<void> => {
    if (!confirm('30 日間の体験版を開始しますか？\n（期間終了後はライセンスキーが必要です）')) return;
    setLoading(true);
    try {
      const result = await window.laipdf.license.startTrial();
      onActivated(result.license);
    } catch (err) {
      console.error(err);
      setError('体験版の開始に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-gradient-to-br from-brand-50 to-white p-8">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">📄</div>
          <h1 className="text-2xl font-bold text-gray-800">LaiPDF</h1>
          <p className="text-sm text-gray-500 mt-1">Laiweb 契約者向け PDF 編集ツール</p>
        </div>

        <h2 className="text-sm font-bold text-gray-700 mb-4 border-b pb-2">ライセンス認証</h2>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@laiweb.jp"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ライセンスキー</label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="LAIPDF-XXXX-XXXX-XXXX"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleActivate();
              }}
            />
          </div>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleActivate}
          disabled={loading || !email || !key}
          className="w-full px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white rounded font-medium text-sm mb-3"
        >
          {loading ? '認証中...' : '認証する'}
        </button>

        <div className="text-center">
          <button
            type="button"
            onClick={handleTrial}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            30 日間 体験版を開始
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400 text-center">
          ライセンスキーは Laiweb 契約者ポータルから取得できます。<br />
          ご不明な点は support@laiweb.jp までお問い合わせください。
        </div>
      </div>
    </div>
  );
}
