import sharp from 'sharp';
import pti from 'png-to-ico';
import fs from 'fs';

const SIZE = 512;
const BG_HEX = '#1f2937'; // L'aide ロゴと相性の良い濃グレー (Tailwind gray-800)
const CORNER_RADIUS = 80; // 角丸 (px @512)
const LOGO_RATIO = 0.66;  // ロゴが占める割合 (上下左右に余白)
const PADDING_RATIO = 0.06; // 外側に空白 (タスクバーで端まで詰めない)

const src = 'resources/logo.png';

// 1. ロゴをリサイズ (透過維持、元のグレー色のまま)
const logoSize = Math.round(SIZE * LOGO_RATIO);
const logoBuf = await sharp(src)
  .resize({ width: logoSize, height: logoSize, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer();

// 2. 角丸の濃グレー背景 SVG を生成
const r = CORNER_RADIUS;
const innerSize = SIZE - Math.round(SIZE * PADDING_RATIO * 2);
const innerOffset = Math.round(SIZE * PADDING_RATIO);
const bgSvg = Buffer.from(
  `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
     <rect x="${innerOffset}" y="${innerOffset}"
           width="${innerSize}" height="${innerSize}"
           rx="${r}" ry="${r}" fill="${BG_HEX}" />
   </svg>`,
);

// 3. 合成
const final = await sharp(bgSvg)
  .composite([
    {
      input: logoBuf,
      left: Math.round((SIZE - logoSize) / 2),
      top: Math.round((SIZE - logoSize) / 2),
    },
  ])
  .png()
  .toBuffer();

fs.writeFileSync('build/icon.png', final);
fs.writeFileSync('resources/icon.png', final);
console.log('icon.png:', final.length, 'bytes (', SIZE, 'x', SIZE, ')');

// 4. ICO 生成 (256 にダウンサイズ)
const small = await sharp(final).resize(256, 256).png().toBuffer();
const tmpPath = 'build/_tmp_256.png';
fs.writeFileSync(tmpPath, small);

const icoBuf = await pti([tmpPath]);
fs.writeFileSync('build/icon.ico', icoBuf);
fs.unlinkSync(tmpPath);
console.log('icon.ico:', icoBuf.length, 'bytes');
