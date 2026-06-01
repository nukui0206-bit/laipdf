/**
 * 注釈レイヤー: PDF に焼き込む前の中間状態。
 * 「移動・サイズ変更可能」にするため、配置時点では PDF を変更せず annotations 配列に積む。
 * 保存時に pdf-lib でまとめて焼き込む。
 */

export interface TextAnnotation {
  id: string;
  kind: 'text';
  pageIndex: number;
  x: number; // pt (PDF 左上原点、Canvas 互換)
  y: number;
  fontSize: number;
  text: string;
  color: { r: number; g: number; b: number };
}

export interface StampAnnotation {
  id: string;
  kind: 'stamp';
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
  name: string;
}

export interface WhiteRectAnnotation {
  id: string;
  kind: 'white-rect';
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Annotation = TextAnnotation | StampAnnotation | WhiteRectAnnotation;
