export type XlsxPreviewLimits = {
  maxColumns: number;
  maxRows: number;
  maxSheets: number;
};

export type XlsxCellStyle = Record<string, boolean | number | string | undefined>;

export type XlsxMergeRange = {
  colSpan?: number;
  endColumn?: number;
  endRow?: number;
  ref: string;
  rowSpan?: number;
  startColumn?: number;
  startRow?: number;
};

export type XlsxConditionalRule = {
  formulas?: string[];
  operator?: string;
  range?: string;
  style?: XlsxCellStyle;
  type?: string;
};

export type XlsxPreviewCell = {
  conditionalRules?: XlsxConditionalRule[];
  formatCode?: string;
  formatKind?: string;
  formula?: string;
  hiddenByMerge?: boolean;
  merge?: XlsxMergeRange | null;
  numFmtId?: number;
  rawValue?: string;
  style?: XlsxCellStyle;
  styleIndex?: number;
  value?: string;
};

export type XlsxPreviewImage = {
  alt?: string;
  height: number;
  left: number;
  name?: string;
  src: string;
  target?: string;
  top: number;
  width: number;
};

export type XlsxPreviewRow = {
  cells: XlsxPreviewCell[];
  height?: number;
  number: number;
  values: string[];
};

export type XlsxPreviewSheetMetadata = {
  conditionalMatches: number;
  conditionalRules: number;
  formulaCells: number;
  mergedCells: number;
  styledCells: number;
};

export type XlsxPreviewSheet = {
  canvasHeight?: number;
  canvasWidth?: number;
  columns: string[];
  columnWidths?: number[];
  conditionalFormatting: XlsxConditionalRule[];
  images?: XlsxPreviewImage[];
  metadata: XlsxPreviewSheetMetadata;
  defaultRowHeight?: number;
  name: string;
  rows: XlsxPreviewRow[];
  truncatedColumns: boolean;
  truncatedRows: boolean;
};

export type XlsxPreviewPayload = {
  document?: unknown;
  limits: XlsxPreviewLimits;
  metadata: XlsxPreviewSheetMetadata;
  sheets: XlsxPreviewSheet[];
  supported: true;
};

export const XLSX_PREVIEW_LIMITS: XlsxPreviewLimits;
export function decodeXml(value?: string): string;
export function parseXlsxEntriesToPreview(input: { binaryEntries?: Map<string, Uint8Array>; document?: unknown; entries: Map<string, string> }): XlsxPreviewPayload;
