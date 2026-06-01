/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // L'aide ロゴに合わせたモノクロ系
        brand: {
          50:  '#f3f4f6',   // 極薄グレー (hover/active 背景)
          100: '#e5e7eb',   // 薄グレー
          200: '#d1d5db',   // ロゴグレー相当
          500: '#4b5563',   // 中間グレー
          600: '#1f2937',   // メイン (ボタン背景)
          700: '#111827',   // 濃 (hover)
        },
      },
    },
  },
  plugins: [],
};
