import {
  Type,
  Stamp,
  PenLine,
  Square,
  Eraser,
  Camera,
  Search,
  ScanText,
  FilePlus2,
  Scissors,
  Image as ImageIcon,
  FileArchive,
  MousePointer2,
  type LucideIcon,
} from 'lucide-react';

interface ToolButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
}

function ToolButton({ icon: Icon, label, active, onClick }: ToolButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-left text-sm transition-colors
        ${active
          ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
          : 'text-gray-700 hover:bg-gray-100'
        }`}
    >
      <Icon size={16} strokeWidth={1.75} className="shrink-0" />
      <span>{label}</span>
    </button>
  );
}

interface ToolSidebarProps {
  textMode: boolean;
  stampActive: boolean;
  shapeActive: boolean;
  whiteRectMode: boolean;
  snapshotMode: boolean;
  anyModeActive: boolean;

  onExitAllModes: () => void;
  onOpenStamps: () => void;
  onOpenSignature: () => void;
  onToggleText: () => void;
  onOpenShapeMenu: () => void;
  onToggleWhiteRect: () => void;
  onToggleSnapshot: () => void;
  onOpenSearch: () => void;
  onOpenOcr: () => void;
  onMerge: () => void;
  onOpenSplit: () => void;
  onImagesToPdf: () => void;
  onOpenCompress: () => void;
}

export function ToolSidebar({
  textMode,
  stampActive,
  shapeActive,
  whiteRectMode,
  snapshotMode,
  anyModeActive,
  onExitAllModes,
  onOpenStamps,
  onOpenSignature,
  onToggleText,
  onOpenShapeMenu,
  onToggleWhiteRect,
  onToggleSnapshot,
  onOpenSearch,
  onOpenOcr,
  onMerge,
  onOpenSplit,
  onImagesToPdf,
  onOpenCompress,
}: ToolSidebarProps): React.JSX.Element {
  return (
    <aside className="w-56 border-r border-gray-200 bg-white overflow-y-auto">
      <div className="px-3 py-2.5 border-b border-gray-200">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">ツール</h2>
      </div>

      <div className="p-2">
        <button
          type="button"
          onClick={onExitAllModes}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-left text-sm font-medium mb-1 transition-colors
            ${anyModeActive
              ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300 hover:bg-amber-200'
              : 'bg-gray-100 text-gray-700 ring-1 ring-gray-200 hover:bg-gray-200'
            }`}
          title={anyModeActive ? '編集モードを終了 (Esc)' : '閲覧モード (編集モード解除)'}
        >
          <MousePointer2 size={16} strokeWidth={1.75} className="shrink-0" />
          <span>閲覧モード</span>
          {anyModeActive && <span className="ml-auto text-xs">編集中…</span>}
        </button>

        <div className="text-xs font-medium text-gray-400 px-3 py-1.5">注釈・編集</div>
        <ToolButton icon={Type}     label="テキスト追加"   active={textMode}      onClick={onToggleText} />
        <ToolButton icon={Stamp}    label="印鑑・押印"     active={stampActive}   onClick={onOpenStamps} />
        <ToolButton icon={PenLine}  label="手書き署名"     onClick={onOpenSignature} />
        <ToolButton icon={Square}   label="図形・矢印"     active={shapeActive}   onClick={onOpenShapeMenu} />
        <ToolButton icon={Eraser}   label="白塗り編集"     active={whiteRectMode} onClick={onToggleWhiteRect} />
        <ToolButton icon={Camera}   label="スナップショット" active={snapshotMode}  onClick={onToggleSnapshot} />

        <div className="text-xs font-medium text-gray-400 px-3 py-1.5 mt-3">検索・読取</div>
        <ToolButton icon={Search}    label="PDF 内検索"    onClick={onOpenSearch} />
        <ToolButton icon={ScanText}  label="OCR 文字読取"  onClick={onOpenOcr} />

        <div className="text-xs font-medium text-gray-400 px-3 py-1.5 mt-3">変換・整理</div>
        <ToolButton icon={FilePlus2}    label="PDF を結合"      onClick={onMerge} />
        <ToolButton icon={Scissors}     label="PDF を分割"      onClick={onOpenSplit} />
        <ToolButton icon={ImageIcon}    label="画像から PDF"    onClick={onImagesToPdf} />
        <ToolButton icon={FileArchive}  label="PDF を圧縮"      onClick={onOpenCompress} />
      </div>
    </aside>
  );
}
