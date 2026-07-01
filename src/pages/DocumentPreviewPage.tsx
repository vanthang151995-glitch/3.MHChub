import { AlertCircle, ArrowLeft, Download, FileSpreadsheet, FileText, Maximize2, RotateCcw, Search, Table2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { HubDepartment, HubModel } from "../core/hubCore";
import { categories } from "../data";
import { getText } from "../i18n";
import type { HubLanguage, HubTranslate } from "../i18n-context";
import { api } from "../services/api";
import type { DocumentRecord } from "../services/api";
import { Button } from "../components/ui";
import { createClientDocxPreview } from "../utils/docxPreviewClient";
import { getDocumentDisplayTitle } from "../utils/documentDisplay";
import "./DocumentPreviewPage.css";

const FORMULA_BADGE_LABEL = "fx";
const EXCEL_PREVIEW_ZOOM_DEFAULT = 1;
const EXCEL_PREVIEW_ZOOM_MIN = 0.85;
const EXCEL_PREVIEW_ZOOM_MAX = 1.5;
const EXCEL_PREVIEW_ZOOM_STEP = 0.1;

type PreviewDocument = DocumentRecord & {
  previewError?: string;
  storagePath?: string;
};
type PreviewKind = "docx" | "excel-html" | "image" | "pdf" | "text" | "unsupported" | "xlsx";
type CellValue = boolean | number | string | null | undefined;
type XlsxMerge = {
  colSpan?: number;
  ref?: string;
  rowSpan?: number;
};
type XlsxConditionalRule = {
  formulas?: string[];
  operator?: string;
  range?: string;
  style?: CSSProperties;
  type?: string;
};
type XlsxCell = {
  address?: string;
  column?: string;
  conditionalRules?: XlsxConditionalRule[];
  formula?: string;
  hiddenByMerge?: boolean;
  id?: string;
  merge?: XlsxMerge | null;
  rawValue?: CellValue;
  rowNumber?: number;
  style?: CSSProperties;
  styleIndex?: number;
  formatCode?: string;
  formatKind?: string;
  numFmtId?: number;
  value?: CellValue;
};
type XlsxRow = {
  cells?: XlsxCell[];
  height?: number;
  number: number;
  values: CellValue[];
};
type XlsxImage = {
  alt?: string;
  grouped?: boolean;
  height: number;
  left: number;
  name?: string;
  src: string;
  target?: string;
  top: number;
  width: number;
};
type XlsxSheet = {
  canvasHeight?: number;
  canvasWidth?: number;
  columns?: string[];
  columnWidths?: number[];
  defaultRowHeight?: number;
  images?: XlsxImage[];
  name: string;
  rows?: XlsxRow[];
  truncatedColumns?: boolean;
  truncatedRows?: boolean;
};
type DocxRunStyle = {
  bold?: boolean;
  color?: string;
  italic?: boolean;
  underline?: boolean;
};
type DocxRunValue = {
  style?: DocxRunStyle;
  text: string;
};
type DocxParagraphBlock = {
  headingLevel?: string;
  runs: DocxRunValue[];
  styleId?: string;
  text?: string;
  type: "paragraph";
};
type DocxTableCell = {
  colSpan?: number;
  paragraphs: DocxParagraphBlock[];
};
type DocxTableBlock = {
  rows: DocxTableCell[][];
  type: "table";
};
type DocxBlock = DocxParagraphBlock | DocxTableBlock;
type PreviewPayload = {
  blocks?: DocxBlock[];
  document?: PreviewDocument | null;
  fallbackUrl?: string;
  kind?: PreviewKind;
  reason?: string;
  reasonKey?: string;
  sheets?: XlsxSheet[];
  source?: string;
  supported?: boolean;
  text?: string;
  url?: string;
  [key: string]: unknown;
};
type PreviewInputPayload = Omit<PreviewPayload, "document"> & {
  document?: DocumentRecord | null;
};
type PreviewFallbackError = Error & {
  payload?: unknown;
};
type DocumentPreviewPageProps = {
  lang: HubLanguage;
  model?: Pick<HubModel, "departments"> | null;
  t: HubTranslate;
};
type PreviewStatProps = {
  label: ReactNode;
  value?: ReactNode;
};
type CellInspectorProps = {
  cell: XlsxCell | null;
  t: HubTranslate;
};
type SheetTableProps = {
  onCellSelect: (cell: XlsxCell | null) => void;
  query: string;
  selectedCellId?: string;
  sheet?: XlsxSheet;
  t: HubTranslate;
};
type NativePreviewProps = {
  lang: HubLanguage;
  preview: PreviewPayload;
  t: HubTranslate;
};
type TextPreviewProps = {
  preview: PreviewPayload;
  t: HubTranslate;
};
type DocxRunProps = {
  run: DocxRunValue;
};
type DocxParagraphProps = {
  paragraph: DocxParagraphBlock;
};
type DocxTableProps = {
  table: DocxTableBlock;
};
type DocxPreviewProps = {
  preview: PreviewPayload;
  t: HubTranslate;
};
type XlsxPreviewProps = {
  preview: PreviewPayload;
  t: HubTranslate;
};
type ExcelSheetLink = {
  id: string;
  label: string;
};

const hasText = (value: unknown): boolean => String(value ?? "").trim() !== "";

const normalizeSearchText = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const cellText = (value: unknown): string => {
  const text = String(value ?? "");
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
};

const textValue = (value: ReturnType<typeof getText>): string => (Array.isArray(value) ? value.join(", ") : value);
const asPreviewDocument = (document?: DocumentRecord | null): PreviewDocument | null =>
  document ? (document as PreviewDocument) : null;
const getErrorMessage = (error: unknown, fallback: string): string => (error instanceof Error && error.message ? error.message : fallback);
const hasPreviewPayload = (error: unknown): error is PreviewFallbackError =>
  typeof error === "object" && error !== null && "payload" in error;
const isPreviewPayload = (value: unknown): value is PreviewPayload => typeof value === "object" && value !== null;
const clampExcelPreviewZoom = (value: number): number =>
  Math.min(EXCEL_PREVIEW_ZOOM_MAX, Math.max(EXCEL_PREVIEW_ZOOM_MIN, Number(value.toFixed(2))));
const formatZoomLabel = (value: number): string => `${Math.round(value * 100)}%`;
const EXCEL_PREVIEW_ZOOM_STORAGE_PREFIX = "mhc-document-preview-excel-zoom-v2:";
const getExcelPreviewZoomStorageKey = (preview: PreviewPayload): string => {
  const documentId = preview.document?.id;
  if (documentId) return `${EXCEL_PREVIEW_ZOOM_STORAGE_PREFIX}${documentId}`;
  const url = preview.url || preview.fallbackUrl || "";
  return `${EXCEL_PREVIEW_ZOOM_STORAGE_PREFIX}${url || "default"}`;
};
const readExcelPreviewZoom = (preview: PreviewPayload): number => {
  if (typeof window === "undefined") return EXCEL_PREVIEW_ZOOM_DEFAULT;
  try {
    const raw = window.localStorage.getItem(getExcelPreviewZoomStorageKey(preview));
    const value = raw ? Number(raw) : Number.NaN;
    return clampExcelPreviewZoom(Number.isFinite(value) ? value : EXCEL_PREVIEW_ZOOM_DEFAULT);
  } catch {
    return EXCEL_PREVIEW_ZOOM_DEFAULT;
  }
};
const saveExcelPreviewZoom = (preview: PreviewPayload, zoom: number): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getExcelPreviewZoomStorageKey(preview), String(clampExcelPreviewZoom(zoom)));
  } catch {
    // Ignore storage failures in private mode / disabled storage.
  }
};
const requireDocumentId = (document: PreviewDocument): string => {
  if (!document.id) throw new Error("Document id is missing");
  return document.id;
};

const getDepartmentLabel = (
  document: PreviewDocument | null | undefined,
  departments: HubDepartment[] = [],
  lang: HubLanguage,
  t: HubTranslate
): string => {
  if (document?.departmentId === "company") return t("companyLevel");
  const department = departments.find((item) => item.id === document?.departmentId);
  if (department) return textValue(getText(department.name, lang));
  if (document?.departmentName) return typeof document.departmentName === "string" ? document.departmentName : textValue(getText(document.departmentName, lang));
  return document?.departmentId || t("companyLevel");
};

const getCategoryLabel = (document: PreviewDocument | null | undefined, lang: HubLanguage, t: HubTranslate): string => {
  const category = categories.find((item) => item.id === document?.category);
  return category ? textValue(getText(category.label, lang)) : document?.category || t("all");
};

const getExtension = (document: PreviewDocument | null | undefined): string =>
  String(document?.fileName || document?.originalName || "")
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/)?.[1] || "";

const getDocumentKind = (document: PreviewDocument | null | undefined): PreviewKind => {
  const ext = getExtension(document);
  if (["xlsx"].includes(ext)) return "xlsx";
  if (["pdf"].includes(ext)) return "pdf";
  if (["docx"].includes(ext)) return "docx";
  if (["png", "jpg", "jpeg"].includes(ext)) return "image";
  if (["txt", "csv"].includes(ext)) return "text";
  return "unsupported";
};

const CONVERTIBLE_EXTENSIONS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf"]);
const SPREADSHEET_HTML_EXTENSIONS = new Set(["xls", "xlsx", "ods", "csv"]);
const needsServerConverter = (document: PreviewDocument | null | undefined): boolean => CONVERTIBLE_EXTENSIONS.has(getExtension(document));
const supportsExcelHtmlPreview = (document: PreviewDocument | null | undefined): boolean => SPREADSHEET_HTML_EXTENSIONS.has(getExtension(document));
const documentInlineUrl = (document: PreviewDocument | null | undefined): string =>
  document?.id ? api.documentFileUrl(document.id, "inline") : document?.url || "";
const documentDownloadUrl = (document: PreviewDocument | null | undefined): string =>
  document?.id ? api.documentFileUrl(document.id, "attachment") : document?.url || "";

const withKind = (payload?: PreviewInputPayload | null): PreviewPayload => {
  const document = asPreviewDocument(payload?.document);
  const payloadKind = typeof payload?.kind === "string" ? (payload.kind as PreviewKind) : undefined;
  return {
    ...(payload || {}),
    document,
    kind: payloadKind || getDocumentKind(document)
  };
};

const fetchDocumentMetadata = async (id: string): Promise<PreviewDocument | null> => {
  const payload = await api.fetchDocuments({ page: 1, pageSize: 500 });
  return asPreviewDocument((payload.items || []).find((item) => item.id === id) || null);
};

const resolveInlineFileUrl = async (document: PreviewDocument): Promise<string> => {
  const fallbackUrl = document?.url || "";
  const inlineUrl = document?.id ? api.documentFileUrl(document.id, "inline") : "";
  if (!inlineUrl) return fallbackUrl;

  try {
    const response = await fetch(inlineUrl, { method: "HEAD" });
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && !contentType.includes("text/html")) return inlineUrl;
  } catch {
    // Fall back to the uploaded static file if the newer inline route is not active yet.
  }

  return fallbackUrl;
};

let pdfInlineWorkerPromise: Promise<boolean> | null = null;

const waitForServiceWorkerController = (): Promise<boolean> => {
  if (!("serviceWorker" in navigator)) return Promise.resolve(false);
  if (navigator.serviceWorker.controller) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      resolve(Boolean(navigator.serviceWorker.controller));
    }, 1800);
    function onControllerChange() {
      window.clearTimeout(timer);
      resolve(true);
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange, { once: true });
  });
};

const ensurePdfInlineWorker = async (): Promise<boolean> => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;
  if (!pdfInlineWorkerPromise) {
    pdfInlineWorkerPromise = navigator.serviceWorker
      .register("/mhchub-pdf-inline-sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then(waitForServiceWorkerController)
      .catch(() => false);
  }
  return pdfInlineWorkerPromise;
};

const withPreviewQuery = (url: string): string => {
  if (!url || typeof window === "undefined") return url;
  const parsed = new URL(url, window.location.origin);
  parsed.searchParams.set("preview", "inline");
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};

const resolvePdfPreviewUrl = async (document: PreviewDocument): Promise<string> => {
  if (await ensurePdfInlineWorker()) return withPreviewQuery(document.url || "");
  const inlineUrl = await resolveInlineFileUrl(document);
  if (inlineUrl && inlineUrl !== document.url) return inlineUrl;
  return document.url || "";
};

const createNativePdfPreview = async (document: PreviewDocument, sourceUrl: string, source = "pdf"): Promise<PreviewPayload> => {
  if (!sourceUrl) throw new Error("PDF preview URL is missing");
  const response = await fetch(sourceUrl, { method: "HEAD" });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("application/pdf")) {
    throw new Error(`PDF preview request failed: ${response.status}`);
  }
  return {
    document,
    kind: "pdf",
    supported: true,
    url: sourceUrl,
    fallbackUrl: documentDownloadUrl(document),
    source
  };
};

const createUploadedPdfPreview = async (document: PreviewDocument): Promise<PreviewPayload> => {
  const inlineUrl = await resolvePdfPreviewUrl(document);
  return createNativePdfPreview(document, inlineUrl || documentInlineUrl(document), "original-pdf");
};

const createServerPdfPreview = async (document: PreviewDocument): Promise<PreviewPayload> =>
  createNativePdfPreview(document, api.documentPreviewFileUrl(requireDocumentId(document)), "converted-office-pdf");

const createExcelHtmlPreview = async (document: PreviewDocument): Promise<PreviewPayload> => {
  const documentId = requireDocumentId(document);
  const url = api.documentExcelHtmlPreviewUrl(documentId);
  const response = await fetch(url, { method: "HEAD" });
  if (!response.ok) throw new Error(`Excel preview request failed: ${response.status}`);
  return {
    document,
    kind: "excel-html",
    supported: true,
    url,
    fallbackUrl: api.documentPreviewFileUrl(documentId)
  };
};

const fetchBrowserPreview = async (id: string): Promise<PreviewPayload> => {
  const document = await fetchDocumentMetadata(id);
  if (!document) throw new Error("Document metadata not found");
  if (!document.url) {
    return {
      document,
      supported: false,
      reason: "This document has no uploaded file"
    };
  }

  const kind = getDocumentKind(document);
  if (kind === "pdf") {
    return createUploadedPdfPreview(document);
  }
  if (kind === "xlsx") {
    try {
      return await createServerPdfPreview(document);
    } catch (pdfError) {
      try {
        return await createExcelHtmlPreview(document);
      } catch (excelHtmlError) {
        const message = getErrorMessage(excelHtmlError, getErrorMessage(pdfError, "This file type cannot be previewed in the browser yet"));
        return {
          document,
          kind,
          supported: false,
          reasonKey: document.previewStatus === "missing_converter" ? "converterMissingPreview" : "previewUnavailable",
          reason: document.previewError || message
        };
      }
    }
  }
  if (supportsExcelHtmlPreview(document)) {
    try {
      return await createServerPdfPreview(document);
    } catch (pdfError) {
      const pdfMessage = getErrorMessage(pdfError, "This file type cannot be previewed in the browser yet");
      try {
        return await createExcelHtmlPreview(document);
      } catch (htmlError) {
        const message = getErrorMessage(htmlError, pdfMessage);
        return {
          document,
          kind,
          supported: false,
          reasonKey: document.previewStatus === "missing_converter" ? "converterMissingPreview" : "previewUnavailable",
          reason: document.previewError || message
        };
      }
    }
  }
  if (needsServerConverter(document)) {
    try {
      return await createServerPdfPreview(document);
    } catch (error) {
      const message = getErrorMessage(error, "This file type cannot be previewed in the browser yet");
      if (!["xlsx", "docx"].includes(kind)) {
        return {
          document,
          kind,
          supported: false,
          reasonKey: document.previewStatus === "missing_converter" ? "converterMissingPreview" : "previewUnavailable",
          reason: document.previewError || message
        };
      }
    }
  }
  if (kind === "image") {
    return { document, kind, supported: true, url: document.url };
  }
  if (!["xlsx", "docx", "text"].includes(kind)) {
    return {
      document,
      kind,
      supported: false,
      reasonKey: needsServerConverter(document) && document.previewStatus === "missing_converter"
        ? "converterMissingPreview"
        : ["doc", "xls"].includes(getExtension(document)) ? "legacyOfficePreviewUnavailable" : "previewUnavailable",
      reason: document.previewError || "This file type cannot be previewed in the browser yet"
    };
  }

  const response = await fetch(documentInlineUrl(document));
  if (!response.ok) throw new Error(`Document file request failed: ${response.status}`);
  if (kind === "docx") {
    return withKind(await createClientDocxPreview({
      arrayBuffer: await response.arrayBuffer(),
      document
    }) as PreviewInputPayload);
  }
  if (kind === "text") {
    return {
      document,
      kind,
      supported: true,
      text: await response.text()
    };
  }
  return {
    document,
    kind,
    supported: false,
    reasonKey: needsServerConverter(document) && document.previewStatus === "missing_converter"
      ? "converterMissingPreview"
      : "previewUnavailable",
    reason: document.previewError || ""
  };
};

function PreviewStat({ label, value }: PreviewStatProps) {
  return (
    <span className="preview-stat">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </span>
  );
}

function CellInspector({ cell, t }: CellInspectorProps) {
  if (!cell) return null;
  const styleEntries = Object.entries(cell?.style || {}).filter(([, value]) => value);
  const rules = cell?.conditionalRules || [];

  return (
    <div className="preview-cell-inspector active">
      <div>
        <strong>{cell.address}</strong>
        <span>{t("selectedCell")}</span>
      </div>
      <dl>
        <div>
          <dt>{t("cellValue")}</dt>
          <dd>{hasText(cell.value) ? String(cell.value) : "-"}</dd>
        </div>
        <div>
          <dt>{t("mergeRange")}</dt>
          <dd>{cell.merge?.ref || "-"}</dd>
        </div>
        <div>
          <dt>{t("formula")}</dt>
          <dd>{cell.formula ? <code>{cell.formula}</code> : "-"}</dd>
        </div>
      </dl>
      {styleEntries.length ? (
        <div className="preview-style-chips" aria-label={t("styleInfo")}>
          {styleEntries.slice(0, 6).map(([key, value]) => {
            const displayValue = String(value);
            return (
              <span key={key}>
                {key}
                {key.toLowerCase().includes("color") ? <strong style={{ backgroundColor: displayValue }} /> : <em>{displayValue}</em>}
              </span>
            );
          })}
        </div>
      ) : null}
      {rules.length ? (
        <div className="preview-applied-rules">
          <strong>{t("appliedRules")}</strong>
          {rules.map((rule, index) => (
            <span key={`${rule.range}-${rule.type}-${index}`}>
              {rule.range} / {rule.type}
              {rule.operator ? ` / ${rule.operator}` : ""}
              {rule.formulas?.length ? ` / ${rule.formulas.join(", ")}` : ""}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SheetTable({ onCellSelect, query, selectedCellId, sheet, t }: SheetTableProps) {
  const normalizedQuery = normalizeSearchText(query.trim());
  const columns = sheet?.columns || [];
  const columnWidths = sheet?.columnWidths || [];
  const images = sheet?.images || [];
  const sourceRows = sheet?.rows || [];
  const showSummary = Boolean(normalizedQuery || sheet?.truncatedRows || sheet?.truncatedColumns);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [sheetLayout, setSheetLayout] = useState({ headerHeight: 34, rowHeaderWidth: 56 });
  const rows = useMemo<XlsxRow[]>(() => {
    if (!sheet) return [];
    if (!normalizedQuery) return sheet.rows || [];
    return (sheet.rows || []).filter((row) =>
      row.values.some((value) => normalizeSearchText(value).includes(normalizedQuery))
    );
  }, [normalizedQuery, sheet]);

  useLayoutEffect(() => {
    if (!sheet) return;
    const shell = shellRef.current;
    if (!shell) return;

    const measure = (): void => {
      const headerRow = shell.querySelector("thead tr");
      const rowHeaderCell = shell.querySelector("thead .row-number-cell");
      const nextHeaderHeight = Math.max(0, Math.round(headerRow?.getBoundingClientRect().height || 0));
      const nextRowHeaderWidth = Math.max(0, Math.round(rowHeaderCell?.getBoundingClientRect().width || 0));
      setSheetLayout((current) => (
        current.headerHeight === nextHeaderHeight && current.rowHeaderWidth === nextRowHeaderWidth
          ? current
          : {
              headerHeight: nextHeaderHeight || 34,
              rowHeaderWidth: nextRowHeaderWidth || 56
            }
      ));
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(() => measure());
    observer.observe(shell);
    return () => observer.disconnect();
  }, [columns.length, normalizedQuery, sheet, rows.length, sheet?.canvasHeight, sheet?.canvasWidth]);

  if (!sheet) {
    return <p className="empty-text">{t("previewUnavailable")}</p>;
  }

  if (!columns.length || !sourceRows.length) {
    return (
      <div className="document-preview-empty compact">
        <Table2 size={26} />
        <h2>{t("noPreviewRows")}</h2>
        <p>{t("previewEmptyHint")}</p>
      </div>
    );
  }

  return (
    <>
      {showSummary ? <div className="preview-sheet-summary">
        <span>
          {t("showingRows")}: <strong>{rows.length}</strong> / {sourceRows.length}
        </span>
        {sheet.truncatedRows || sheet.truncatedColumns ? <span>{t("previewLimitNote")}</span> : null}
      </div> : null}
      <div className="preview-table-shell" ref={shellRef}>
        <div
          className="preview-sheet-canvas"
          style={{
            minHeight: `${Math.max(0, Math.round((sheet.canvasHeight || 0) + sheetLayout.headerHeight))}px`,
            minWidth: `${Math.max(0, Math.round((sheet.canvasWidth || 0) + sheetLayout.rowHeaderWidth))}px`
          }}
        >
          <table className="document-preview-table">
          <caption className="sr-only">{sheet.name}</caption>
          <colgroup>
            <col style={{ width: "56px" }} />
            {columns.map((column, index) => (
              <col
                key={column}
                style={columnWidths[index] != null ? { width: `${columnWidths[index]}px` } : undefined}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="row-number-cell" scope="col">
                #
              </th>
              {columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.number}
                style={(() => {
                  const rowHeight = row.height ?? sheet.defaultRowHeight;
                  if (rowHeight == null) return undefined;
                  if (rowHeight <= 0) return { height: "0px" };
                  return { height: `${Math.max(28, rowHeight * 1.34)}px` };
                })()}
              >
                <th className="row-number-cell" scope="row">
                  {row.number}
                </th>
                {columns.map((column, index) => {
                  const cell: XlsxCell = row.cells?.[index] || { value: row.values[index] ?? "" };
                  if (cell.hiddenByMerge) return null;
                  const value = cell.value ?? "";
                  const merge = cell.merge || {};
                  const id = `${row.number}:${index}`;
                  return (
                    <td
                      className={[
                        hasText(value) ? "" : "empty-cell",
                        merge.rowSpan || merge.colSpan ? "merged-cell" : "",
                        cell.formula ? "formula-cell" : "",
                        cell.conditionalRules?.length ? "conditional-cell" : "",
                        selectedCellId === id ? "selected-cell" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      colSpan={merge.colSpan || undefined}
                      key={`${row.number}-${column}`}
                      onClick={() =>
                        onCellSelect({
                          ...cell,
                          address: `${column}${row.number}`,
                          column,
                          id,
                          merge,
                          rowNumber: row.number,
                          value
                        })
                      }
                      onKeyDown={(event: KeyboardEvent<HTMLTableCellElement>) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onCellSelect({
                            ...cell,
                            address: `${column}${row.number}`,
                            column,
                            id,
                            merge,
                            rowNumber: row.number,
                            value
                          });
                        }
                      }}
                      rowSpan={merge.rowSpan || undefined}
                      style={cell.style || undefined}
                      tabIndex={0}
                      title={cell.formula ? `${t("formulaCells")}: ${cell.formula}` : String(value)}
                    >
                      {hasText(value) ? cellText(value) : "\u00a0"}
                      {cell.formula ? <span className="formula-badge">{FORMULA_BADGE_LABEL}</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          </table>
          {images.map((image) => (
            <img
              alt={image.alt || ""}
              className="xlsx-sheet-image"
              draggable={false}
              key={`${image.target || image.name || image.left}-${image.top}-${image.width}-${image.height}`}
              src={image.src}
              style={{
                height: `${image.height}px`,
                left: `${Math.max(0, sheetLayout.rowHeaderWidth + image.left)}px`,
                top: `${Math.max(0, sheetLayout.headerHeight + image.top)}px`,
                width: `${image.width}px`
              }}
            />
          ))}
        </div>
        {!rows.length ? <p className="empty-text compact">{t("noPreviewRows")}</p> : null}
      </div>
    </>
  );
}

function PdfPreview({ lang, preview, t }: NativePreviewProps) {
  const sourceUrl = preview.url || preview.fallbackUrl || "";
  const displayTitle = getDocumentDisplayTitle(preview.document, t("pdfPreview"), lang);

  return (
    <section className="document-preview-workbook document-native-preview">
      <div className="native-preview-toolbar">
        <div>
          <h2>{t("pdfPreview")}</h2>
          <p>{t("automaticPreview")}</p>
        </div>
        <div className="native-preview-actions">
          <Button as="a" className="secondary-button small" href={sourceUrl} rel="noreferrer" size="sm" target="_blank" variant="secondary">
            {t("openInNewTab")}
          </Button>
        </div>
      </div>
      <div className="pdf-native-preview-shell">
        <iframe
          className="pdf-native-frame"
          src={sourceUrl}
          title={displayTitle}
        />
      </div>
    </section>
  );
}

function ExcelHtmlPreview({ lang, preview, t }: NativePreviewProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const initialZoom = readExcelPreviewZoom(preview);
  const zoomStorageKey = getExcelPreviewZoomStorageKey(preview);
  const lastAppliedZoomRef = useRef(initialZoom);
  const [sheetLinks, setSheetLinks] = useState<ExcelSheetLink[]>([]);
  const [zoom, setZoom] = useState(initialZoom);
  const displayTitle = getDocumentDisplayTitle(preview.document, t("excelPreview"), lang);
  const zoomLabel = formatZoomLabel(zoom);

  const applyFrameChrome = (): void => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    const win = frame?.contentWindow;
    if (!doc?.body || !win) return;

    const currentZoom = clampExcelPreviewZoom(zoom);
    const previousZoom = lastAppliedZoomRef.current || currentZoom;
    const scrollX = win.scrollX;
    const scrollY = win.scrollY;

    try {
      doc.documentElement.style.background = "#eef5fb";
      doc.documentElement.style.overflow = "auto";
      doc.documentElement.style.overflowX = "auto";
      doc.documentElement.style.overflowY = "auto";
      doc.documentElement.style.scrollBehavior = "smooth";
      doc.body.style.background = "#ffffff";
      doc.body.style.color = "#111827";
      doc.body.style.fontFamily = '"Times New Roman", Cambria, Georgia, serif';
      doc.body.style.overflow = "auto";
      doc.body.style.overflowX = "auto";
      doc.body.style.overflowY = "auto";
      doc.querySelectorAll<HTMLElement>("body > hr").forEach((element) => {
        element.style.display = "none";
      });
      doc.querySelectorAll<HTMLElement>("body > center, body > p > center").forEach((element) => {
        const text = element.textContent?.trim().toLowerCase() || "";
        if (text.startsWith("overview")) {
          const wrapper = element.closest("p") || element;
          if (wrapper instanceof HTMLElement) {
            wrapper.setAttribute("aria-hidden", "true");
            wrapper.style.display = "none";
          }
        }
      });
      doc.body.style.zoom = `${Math.round(currentZoom * 100)}%`;
      lastAppliedZoomRef.current = currentZoom;
      const ratio = previousZoom > 0 ? currentZoom / previousZoom : 1;
      win.requestAnimationFrame(() => {
        win.scrollTo({
          behavior: "auto",
          left: Math.max(0, Math.round(scrollX * ratio)),
          top: Math.max(0, Math.round(scrollY * ratio))
        });
      });

      doc.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
        img.style.maxWidth = "none";
      });

      const links = [...doc.querySelectorAll<HTMLAnchorElement>('a[name^="table"]')]
        .flatMap((anchor, index): ExcelSheetLink[] => {
          const heading = anchor.querySelector("h1");
          const emphasized = heading?.querySelector("em")?.textContent?.trim();
          const label = emphasized || heading?.textContent?.replace(/^Sheet\s+\d+\s*:\s*/i, "").trim() || `Sheet ${index + 1}`;
          const id = anchor.getAttribute("name");
          return id && label ? [{ id, label }] : [];
        });
      setSheetLinks(links);
    } catch {
      setSheetLinks([]);
    }
  };

  useEffect(() => {
    applyFrameChrome();
  }, [zoom, preview.url]);

  useEffect(() => {
    const nextZoom = readExcelPreviewZoom(preview);
    lastAppliedZoomRef.current = nextZoom;
    setZoom(nextZoom);
  }, [zoomStorageKey]);

  useEffect(() => {
    saveExcelPreviewZoom(preview, zoom);
  }, [preview, zoom, zoomStorageKey]);

  const jumpToSheet = (sheetId: string): void => {
    const doc = frameRef.current?.contentDocument;
    const target = doc ? [...doc.querySelectorAll<HTMLAnchorElement>("a[name]")].find((item) => item.getAttribute("name") === sheetId) : null;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const zoomOut = (): void => {
    setZoom((current) => clampExcelPreviewZoom(current - EXCEL_PREVIEW_ZOOM_STEP));
  };

  const zoomIn = (): void => {
    setZoom((current) => clampExcelPreviewZoom(current + EXCEL_PREVIEW_ZOOM_STEP));
  };

  const resetZoom = (): void => {
    setZoom(EXCEL_PREVIEW_ZOOM_DEFAULT);
  };

  const fitWidth = (): void => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!doc?.body || !frame) return;

    const currentZoom = clampExcelPreviewZoom(zoom);
    const availableWidth = Math.max(1, Math.floor(frame.getBoundingClientRect().width) - 48);
    const contentWidth = Math.max(
      doc.body.scrollWidth || 0,
      doc.documentElement.scrollWidth || 0
    );

    if (contentWidth <= 0 || availableWidth <= 0) return;
    const nextZoom = clampExcelPreviewZoom(currentZoom * (availableWidth / contentWidth));
    setZoom(nextZoom);
  };

  return (
    <section className="document-preview-workbook document-native-preview">
      <div className="native-preview-toolbar">
        <div>
          <h2>{t("excelPreview")}</h2>
          <p>{t("excelPreviewHint")}</p>
        </div>
        <div className="native-preview-actions">
          <div className="excel-preview-zoom">
            <button aria-label={t("zoomOut")} onClick={zoomOut} title={t("zoomOut")} type="button">
              <ZoomOut size={16} />
            </button>
            <span className="excel-preview-zoom-value" aria-live="polite">
              {zoomLabel}
            </span>
            <button aria-label={t("zoomIn")} onClick={zoomIn} title={t("zoomIn")} type="button">
              <ZoomIn size={16} />
            </button>
            <button aria-label={t("zoomReset")} onClick={resetZoom} title={t("zoomReset")} type="button">
              <RotateCcw size={15} />
            </button>
            <button aria-label={t("fitWidth")} onClick={fitWidth} title={t("fitWidth")} type="button">
              <Maximize2 size={15} />
            </button>
          </div>
          {sheetLinks.length ? (
            <div className="excel-sheet-jump" aria-label={t("sheets")}>
              <Table2 size={16} />
              {sheetLinks.map((sheet) => (
                <button key={sheet.id} onClick={() => jumpToSheet(sheet.id)} type="button">
                  {sheet.label}
                </button>
              ))}
            </div>
          ) : null}
          <Button as="a" className="secondary-button small" href={preview.url || ""} rel="noreferrer" size="sm" target="_blank" variant="secondary">
            {t("openInNewTab")}
          </Button>
        </div>
      </div>
      <div className="excel-html-preview-shell">
        <iframe
          className="excel-html-preview-frame"
          onLoad={applyFrameChrome}
          ref={frameRef}
          sandbox="allow-same-origin"
          src={preview.url || ""}
          title={displayTitle}
        />
      </div>
    </section>
  );
}

function XlsxPreview({ preview, t }: XlsxPreviewProps) {
  const [activeSheet, setActiveSheet] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedCell, setSelectedCell] = useState<XlsxCell | null>(null);
  const sheets = preview.sheets || [];
  const previewKey = preview.document?.id || preview.url || preview.fallbackUrl || "";
  const activeIndex = Math.min(activeSheet, Math.max(0, sheets.length - 1));
  const sheet = sheets[activeIndex];

  useEffect(() => {
    setActiveSheet(0);
    setQuery("");
    setSelectedCell(null);
  }, [previewKey]);

  useEffect(() => {
    setSelectedCell(null);
  }, [activeIndex, previewKey]);

  const selectSheet = (index: number): void => {
    setActiveSheet(index);
  };

  return (
    <section className="document-preview-workbook">
      <div className="preview-toolbar">
        <div className="preview-toolbar-title">
          <h2>{t("excelPreview")}</h2>
          <p>{t("xlsxPreviewHint")}</p>
        </div>
        <label className="preview-search">
          <Search size={16} />
          <input
            aria-label={t("searchInSheet")}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchInSheet")}
            value={query}
          />
        </label>
      </div>
      {sheets.length > 1 ? (
        <div className="sheet-tab-list" aria-label={t("sheets")}>
          {sheets.map((item, index) => (
            <button
              className={index === activeIndex ? "active" : ""}
              key={`${item.name}-${index}`}
              onClick={() => selectSheet(index)}
              aria-pressed={index === activeIndex}
              type="button"
              title={item.name}
            >
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      ) : null}
      <SheetTable onCellSelect={setSelectedCell} query={query} selectedCellId={selectedCell?.id} sheet={sheet} t={t} />
      {selectedCell ? <CellInspector cell={selectedCell} t={t} /> : <p className="empty-text compact">{t("selectedCellHint")}</p>}
    </section>
  );
}

function ImagePreview({ lang, preview, t }: NativePreviewProps) {
  const displayTitle = getDocumentDisplayTitle(preview.document, t("imagePreview"), lang);
  return (
    <section className="document-preview-workbook document-native-preview">
      <div className="native-preview-toolbar">
        <h2>{t("imagePreview")}</h2>
      </div>
      <img alt={displayTitle} className="image-preview-frame" src={preview.url || ""} />
    </section>
  );
}

function TextPreview({ preview, t }: TextPreviewProps) {
  return (
    <section className="document-preview-workbook document-native-preview">
      <div className="native-preview-toolbar">
        <h2>{t("textPreview")}</h2>
      </div>
      <pre className="text-preview-frame">{preview.text || ""}</pre>
    </section>
  );
}

function DocxRun({ run }: DocxRunProps) {
  return (
    <span
      style={{
        color: run.style?.color || undefined,
        fontWeight: run.style?.bold ? 800 : undefined,
        fontStyle: run.style?.italic ? "italic" : undefined,
        textDecoration: run.style?.underline ? "underline" : undefined
      }}
    >
      {run.text}
    </span>
  );
}

function DocxParagraph({ paragraph }: DocxParagraphProps) {
  const level = Number(paragraph.headingLevel);
  if (level === 1) return <h1>{paragraph.runs.map((run, index) => <DocxRun key={index} run={run} />)}</h1>;
  if (level === 2) return <h2>{paragraph.runs.map((run, index) => <DocxRun key={index} run={run} />)}</h2>;
  if (level === 3) return <h3>{paragraph.runs.map((run, index) => <DocxRun key={index} run={run} />)}</h3>;
  return <p>{paragraph.runs.map((run, index) => <DocxRun key={index} run={run} />)}</p>;
}

function DocxTable({ table }: DocxTableProps) {
  return (
    <div className="docx-table-shell">
      <table>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td colSpan={(cell.colSpan || 1) > 1 ? cell.colSpan : undefined} key={cellIndex}>
                  {cell.paragraphs.map((paragraph, paragraphIndex) => (
                    <DocxParagraph key={paragraphIndex} paragraph={paragraph} />
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocxPreview({ preview, t }: DocxPreviewProps) {
  return (
    <section className="document-preview-workbook document-native-preview">
      <div className="native-preview-toolbar">
        <div>
          <h2>{t("wordPreview")}</h2>
          <p>{t("automaticPreview")}</p>
        </div>
      </div>
      <article className="docx-preview-page">
        {(preview.blocks || []).map((block, index) =>
          block.type === "table" ? <DocxTable key={index} table={block} /> : <DocxParagraph key={index} paragraph={block} />
        )}
      </article>
    </section>
  );
}

export function DocumentPreviewPage({ lang, t, model }: DocumentPreviewPageProps) {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState<XlsxCell | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMessage("");
    const loadPreview = async (): Promise<PreviewPayload> => {
      if (!id) throw new Error("Document id is missing");
      try {
        return await fetchBrowserPreview(id);
      } catch (browserErr) {
        try {
          return withKind(await api.fetchDocumentPreview(id));
        } catch {
          if (hasPreviewPayload(browserErr) && isPreviewPayload(browserErr.payload)) return browserErr.payload;
          throw browserErr;
        }
      }
    };

    loadPreview()
      .then((payload) => {
        if (!alive) return;
        setPreview(payload);
        setActiveSheet(0);
        setSelectedCell(null);
        setMessage(payload?.supported === false ? t(payload.reasonKey || "previewUnavailable") || payload.reason || t("previewUnavailable") : "");
      })
      .catch((err) => {
        if (!alive) return;
        setPreview(null);
        setMessage(getErrorMessage(err, t("previewUnavailable")));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const document = preview?.document || null;
  const displayTitle = getDocumentDisplayTitle(document, t("previewDocument"), lang);
  const kind = preview?.kind || getDocumentKind(document);
  const sourceExtension = getExtension(document);
  const sheets = preview?.supported ? preview.sheets || [] : [];
  const activeIndex = Math.min(activeSheet, Math.max(0, sheets.length - 1));
  const sheet = sheets[activeIndex];
  const departmentLabel = getDepartmentLabel(document, model?.departments, lang, t);
  const categoryLabel = getCategoryLabel(document, lang, t);
  const DocumentIcon = ["xlsx", "excel-html"].includes(kind) || SPREADSHEET_HTML_EXTENSIONS.has(sourceExtension) ? FileSpreadsheet : FileText;
  const closePreview = (): void => {
    navigate("/documents", { replace: true });
  };
  const modalShellStyle: CSSProperties = {
    background:
      "radial-gradient(circle at top, rgba(37, 99, 235, 0.14), transparent 44%), linear-gradient(180deg, rgba(5, 11, 24, 0.82), rgba(5, 11, 24, 0.92))",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    inset: 0,
    height: "100dvh",
    margin: 0,
    maxWidth: "none",
    overflow: "hidden",
    padding: 12,
    position: "fixed",
    width: "100vw",
    zIndex: 100000
  };

  useEffect(() => {
    const body = globalThis.document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") closePreview();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const modalRoot = globalThis.document?.body ?? null;
  const modalContent = (
    <div
      aria-busy={loading ? "true" : "false"}
      aria-modal="true"
      aria-label={displayTitle}
      className="document-preview-page document-preview-modal-page"
      role="dialog"
      style={modalShellStyle}
    >
      <section className="document-preview-hero">
        <div className="document-preview-title">
          <span className="document-preview-icon">
            <DocumentIcon size={24} />
          </span>
          <div className="document-preview-heading">
            <Link className="document-preview-back compact" to="/documents">
              <ArrowLeft size={15} />
              {t("backToDocuments")}
            </Link>
            <h1>{displayTitle}</h1>
            <p>{document?.originalName || t("documentPreviewSubtitle")}</p>
          </div>
        </div>
        <div className="document-preview-actions">
          {document?.url ? (
            <Button as="a" className="secondary-button" download={document.originalName || document.fileName || true} href={documentDownloadUrl(document)} variant="secondary">
              <Download size={18} />
              {t("downloadOriginal")}
            </Button>
          ) : null}
          <Link className="document-preview-close" replace to="/documents" aria-label={t("close")} title={t("close")}>
            <X size={16} />
          </Link>
        </div>
      </section>

      {loading ? (
        <section className="document-preview-loading">
          <FileSpreadsheet size={26} />
          <p>{t("previewLoading")}</p>
        </section>
      ) : null}
      {message ? <p className="form-message">{message}</p> : null}

      {document ? (
        <section className="document-preview-meta">
          <PreviewStat label={t("category")} value={categoryLabel} />
          <PreviewStat label={t("department")} value={departmentLabel} />
          <PreviewStat label={t("version")} value={`v${document.version || "1.0"}`} />
          <PreviewStat label={t("storagePath")} value={document.storagePath || document.fileName || ""} />
        </section>
      ) : null}

      {!loading && preview && !preview.supported ? (
        <section className="document-preview-empty">
          <AlertCircle size={30} />
          <h2>{t("unsupportedPreview")}</h2>
          <p>{preview.reasonKey ? t(preview.reasonKey) : preview.reason || t("previewUnavailable")}</p>
          {document?.url ? (
            <Button as="a" className="secondary-button" download={document.originalName || document.fileName || true} href={documentDownloadUrl(document)} variant="secondary">
              <Download size={18} />
              {t("downloadOriginal")}
            </Button>
          ) : null}
        </section>
      ) : null}
      {kind === "excel-html" && preview?.supported ? <ExcelHtmlPreview lang={lang} preview={preview} t={t} /> : null}
      {kind === "xlsx" && preview?.supported ? <XlsxPreview preview={preview} t={t} /> : null}
      {kind === "pdf" && preview?.supported ? <PdfPreview lang={lang} preview={preview} t={t} /> : null}
      {kind === "docx" && preview?.supported ? <DocxPreview preview={preview} t={t} /> : null}
      {kind === "image" && preview?.supported ? <ImagePreview lang={lang} preview={preview} t={t} /> : null}
      {kind === "text" && preview?.supported ? <TextPreview preview={preview} t={t} /> : null}
    </div>
  );

  return modalRoot ? createPortal(modalContent, modalRoot) : modalContent;
}
