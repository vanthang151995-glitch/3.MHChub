import { AlertCircle, ArrowLeft, Download, FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import PdfJsViewer from "../components/PdfJsViewer";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
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

type PreviewDocument = DocumentRecord & {
  previewError?: string;
  storagePath?: string;
};
type PreviewKind = "docx" | "excel-html" | "image" | "pdf" | "text" | "unsupported" | "xlsx" | "xlsx-converting";
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
  value?: CellValue;
};
type XlsxRow = {
  cells?: XlsxCell[];
  height?: number;
  number: number;
  values: CellValue[];
};
type XlsxSheet = {
  columns?: string[];
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

const createExcelHtmlPreview = async (document: PreviewDocument, { signal }: { signal?: AbortSignal } = {}): Promise<PreviewPayload> => {
  const documentId = requireDocumentId(document);
  const url = api.documentExcelHtmlPreviewUrl(documentId);
  const response = await fetch(url, { signal });
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

  // xlsx: always use LibreOffice HTML. If converting (first open), return converting state.
  if (kind === "xlsx") {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90000);
      const result = await createExcelHtmlPreview(document, { signal: controller.signal });
      clearTimeout(timer);
      return result;
    } catch {
      // LibreOffice timed out or unavailable → show converting state with auto-retry
      return { document, kind: "xlsx-converting", supported: true };
    }
  }

  if (needsServerConverter(document)) {
    try {
      return await createServerPdfPreview(document);
    } catch (error) {
      const message = getErrorMessage(error, "This file type cannot be previewed in the browser yet");
      if (!["docx"].includes(kind)) {
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
      return await createExcelHtmlPreview(document);
    } catch {
      // Fall back to browser parsing below if the server cannot create a preview.
    }
  }
  if (kind === "image") {
    return { document, kind, supported: true, url: document.url };
  }
  if (!["docx", "text"].includes(kind)) {
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
  const rows = useMemo<XlsxRow[]>(() => {
    if (!sheet) return [];
    if (!normalizedQuery) return sheet.rows || [];
    return (sheet.rows || []).filter((row) =>
      row.values.some((value) => normalizeSearchText(value).includes(normalizedQuery))
    );
  }, [normalizedQuery, sheet]);

  if (!sheet) {
    return <p className="empty-text">{t("previewUnavailable")}</p>;
  }

  const columns = sheet.columns || [];
  const sourceRows = sheet.rows || [];
  const showSummary = Boolean(normalizedQuery || sheet.truncatedRows || sheet.truncatedColumns);
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
      <div className="preview-table-shell">
        <table className="document-preview-table">
          <caption className="sr-only">{sheet.name}</caption>
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
              <tr key={row.number} style={row.height ? { height: `${Math.max(28, row.height * 1.34)}px` } : undefined}>
                <th className="row-number-cell" scope="row">
                  {row.number}
                </th>
                {columns.map((column, index) => {
                  const cell: XlsxCell = row.cells?.[index] || { value: row.values[index] || "" };
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
        <PdfJsViewer url={sourceUrl} className="pdf-native-frame" />
      </div>
    </section>
  );
}

function ExcelHtmlPreview({ lang, preview, t }: NativePreviewProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [sheetLinks, setSheetLinks] = useState<ExcelSheetLink[]>([]);
  const displayTitle = getDocumentDisplayTitle(preview.document, t("excelPreview"), lang);

  const decorateFrame = (): void => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!doc?.body) return;

    try {
      if (!doc.getElementById("mhc-excel-preview-polish")) {
        const style = doc.createElement("style");
        style.id = "mhc-excel-preview-polish";
        style.textContent = `
          @font-face {
            font-family: ".VnTime";
            src: local("Times New Roman"), local("TimesNewRoman");
          }
          html {
            background: #f0f4f8;
            scroll-behavior: smooth;
          }
          body {
            background: #f0f4f8;
            margin: 0;
            padding: 20px 20px 40px;
          }
          body > center:first-of-type,
          body > center:first-of-type + p {
            display: none !important;
          }
          body > hr {
            display: none !important;
          }
          a[name^="table"] {
            color: inherit;
            display: block;
            text-decoration: none;
          }
          a[name^="table"] h1 {
            background: linear-gradient(135deg, #f8fbff, #eef6ff);
            border: 1px solid #d8e5f4;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(15, 23, 42, 0.07);
            color: #0f172a;
            font-family: "Be Vietnam Pro", "Segoe UI", Arial, sans-serif;
            font-size: 16px;
            font-weight: 700;
            margin: 0 0 12px;
            max-width: 100%;
            padding: 8px 14px;
          }
          a[name^="table"] h1 em {
            color: #1454ca;
            font-style: normal;
          }
          table {
            border-collapse: collapse;
            box-shadow: 0 8px 28px rgba(15, 23, 42, 0.10);
            margin: 0 0 32px;
            background: #fff;
          }
          td {
            padding-left: 4px;
            padding-right: 4px;
          }
          img {
            max-width: none;
            display: inline-block;
          }
          p:empty {
            display: none;
          }
        `;
        doc.head.appendChild(style);
      }

      const overview = doc.querySelector("body > center:first-of-type");
      if (overview?.querySelector("h1")?.textContent?.trim().toLowerCase() === "overview") {
        overview.setAttribute("aria-hidden", "true");
      }

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

  const jumpToSheet = (sheetId: string): void => {
    const doc = frameRef.current?.contentDocument;
    const target = doc ? [...doc.querySelectorAll<HTMLAnchorElement>("a[name]")].find((item) => item.getAttribute("name") === sheetId) : null;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="document-preview-workbook document-native-preview">
      <div className="native-preview-toolbar">
        <div>
          <h2>{t("excelPreview")}</h2>
          <p>{t("excelPreviewHint")}</p>
        </div>
        <div className="native-preview-actions">
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
          onLoad={decorateFrame}
          ref={frameRef}
          sandbox="allow-same-origin"
          src={preview.url || ""}
          title={displayTitle}
        />
      </div>
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

type LuckysheetXlsxViewerProps = {
  docId: string;
  document: PreviewDocument;
  t: HubTranslate;
};

type XlsxConvertingViewProps = {
  document: PreviewDocument;
  onReady: (payload: PreviewPayload) => void;
  t: HubTranslate;
};

function XlsxConvertingView({ document, onReady, t }: XlsxConvertingViewProps) {
  const [dots, setDots] = useState(".");
  const [retryCount, setRetryCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setDots((d) => (d.length >= 3 ? "." : `${d}.`)), 600);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!document?.id) return;
    let alive = true;
    const delay = Math.min(5000 + retryCount * 2000, 15000);
    const timer = setTimeout(async () => {
      if (!alive) return;
      try {
        const result = await createExcelHtmlPreview(document);
        if (alive) onReady(result);
      } catch {
        if (alive) setRetryCount((c) => c + 1);
      }
    }, delay);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document?.id, retryCount]);

  const downloadUrl = document?.url ? documentDownloadUrl(document) : "";
  const fileName = document?.originalName || document?.fileName || "file.xlsx";

  return (
    <section className="document-preview-loading" style={{ flexDirection: "column", gap: 18, minHeight: 320, paddingTop: 48, paddingBottom: 48 }}>
      <FileSpreadsheet size={44} style={{ color: "#2563eb", opacity: 0.75 }} />
      <p style={{ fontWeight: 700, fontSize: 17, color: "#1e3a5f", margin: 0 }}>
        Đang chuyển đổi Excel{dots}
      </p>
      <p style={{ fontSize: 13, color: "#6b7280", maxWidth: 380, textAlign: "center", margin: 0, lineHeight: 1.6 }}>
        LibreOffice đang xử lý file để hiển thị đúng gộp ô, màu viền và hình ảnh.
        <br />Trang sẽ tự động hiển thị khi hoàn tất.
      </p>
      <div style={{ width: 240, height: 5, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.min(10 + elapsed * 1.5, 90)}%`,
            background: "linear-gradient(90deg, #2563eb, #60a5fa)",
            borderRadius: 4,
            transition: "width 1s linear",
          }}
        />
      </div>
      <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>{elapsed}s {retryCount > 0 ? `• thử lại lần ${retryCount}` : ""}</p>
      {elapsed >= 20 && downloadUrl ? (
        <a
          href={downloadUrl}
          download={fileName}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "#f0f9ff", border: "1px solid #bae6fd",
            color: "#0369a1", borderRadius: 8,
            padding: "7px 16px", fontSize: 13, fontWeight: 600,
            textDecoration: "none", marginTop: 4,
          }}
        >
          <Download size={15} />
          Tải về để xem ngay
        </a>
      ) : null}
    </section>
  );
}

function LuckysheetXlsxViewer({ docId: _docId, document, t }: LuckysheetXlsxViewerProps) {
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [luckyFailed, setLuckyFailed] = useState(false);

  const docId = document?.id;

  useEffect(() => {
    setBuffer(null);
    setFetchError(null);
    setLuckyFailed(false);

    const url = documentInlineUrl(document);
    if (!url) {
      setFetchError("Không có URL file");
      return;
    }
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => setBuffer(buf))
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        setFetchError("Không tải được file Excel");
      });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  if (fetchError) return <p className="form-message">{fetchError}</p>;
  if (!buffer) return (
    <section className="document-preview-loading">
      <FileSpreadsheet size={26} />
      <p>{t("previewLoading")}</p>
    </section>
  );

  const fileName = document.originalName || document.fileName || "file.xlsx";
  const downloadUrl = documentInlineUrl(document);

  if (luckyFailed) {
    return (
      <section className="document-preview-loading" style={{ flexDirection: "column", gap: 12 }}>
        <FileSpreadsheet size={32} style={{ color: "#f59e0b" }} />
        <p style={{ fontWeight: 600, color: "#92400e" }}>Không thể hiển thị file Excel trực tiếp.</p>
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          File có thể dùng tính năng chưa được hỗ trợ. Bạn có thể tải về và mở bằng Excel / Google Sheets.
        </p>
        {downloadUrl && (
          <a
            href={downloadUrl}
            download={fileName}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "#217346", color: "#fff", borderRadius: 8,
              padding: "8px 18px", fontSize: 13, fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <Download size={15} />
            Tải về {fileName}
          </a>
        )}
      </section>
    );
  }

  return (
    <section className="document-preview-workbook document-luckysheet-preview" style={{ position: "relative" }}>
      <ExcelGridViewer
        data={buffer}
        fileName={fileName}
        onFatalError={() => setLuckyFailed(true)}
      />
    </section>
  );
}

export function DocumentPreviewPage({ lang, t, model }: DocumentPreviewPageProps) {
  const { id } = useParams<{ id?: string }>();
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

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
  const departmentLabel = getDepartmentLabel(document, model?.departments, lang, t);
  const categoryLabel = getCategoryLabel(document, lang, t);
  const DocumentIcon = ["xlsx", "excel-html"].includes(kind) || SPREADSHEET_HTML_EXTENSIONS.has(sourceExtension) ? FileSpreadsheet : FileText;

  return (
    <div className="page document-preview-page" aria-busy={loading ? "true" : "false"}>
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
          <Button as={Link} className="primary-button" to="/documents">
            {t("documentLibrary")}
          </Button>
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

      {sourceExtension === "xlsx" && kind === "xlsx-converting" && !loading && document ? (
        <XlsxConvertingView document={document} onReady={setPreview} t={t} />
      ) : null}
      {sourceExtension === "xlsx" && kind !== "excel-html" && kind !== "xlsx-converting" && !loading && document ? (
        <LuckysheetXlsxViewer document={document} docId={id || ""} t={t} />
      ) : null}
      {kind === "excel-html" && preview?.supported ? (
        <ExcelHtmlPreview lang={lang} preview={preview} t={t} onSwitchToLuckysheet={
          sourceExtension === "xlsx" && document ? () => setPreview({ ...preview, kind: "xlsx" }) : undefined
        } />
      ) : null}
      {kind === "pdf" && preview?.supported ? <PdfPreview lang={lang} preview={preview} t={t} /> : null}
      {kind === "docx" && preview?.supported ? <DocxPreview preview={preview} t={t} /> : null}
      {kind === "image" && preview?.supported ? <ImagePreview lang={lang} preview={preview} t={t} /> : null}
      {kind === "text" && preview?.supported ? <TextPreview preview={preview} t={t} /> : null}
    </div>
  );
}
