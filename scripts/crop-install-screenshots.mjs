import sharp from 'sharp';

const targets = [
  'docs/lp/assets/install-step-1.png',
  'docs/lp/assets/install-step-2.png',
];

// 1536x1024 のスクショから、ブラウザタブ (上) と Windows タスクバー (下) を除外
// ダイアログを中心にトリミング
const TOP = 140;     // ブラウザのタブ・アドレスバー・ブックマークバーすべて除外
const BOTTOM = 80;   // Windows タスクバー除外

for (const src of targets) {
  const meta = await sharp(src).metadata();
  const newHeight = meta.height - TOP - BOTTOM;
  const out = src.replace('.png', '-cropped.png');
  await sharp(src)
    .extract({ left: 0, top: TOP, width: meta.width, height: newHeight })
    .toFile(out);
  console.log(`✓ ${src} → ${out}  (${meta.width}x${meta.height} → ${meta.width}x${newHeight})`);
}
