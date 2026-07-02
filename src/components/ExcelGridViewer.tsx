import { useCallback, useEffect, useRef, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Printer,
  Search,
  Download,
  Maximize,
  Cloud,
  Loader2,
  Sun,
  Moon,
  Eye,
  EyeOff,
  Sigma,
  Snowflake,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { exportLuckysheetToXlsx, buildLuckysheetXlsxBlob } from "@/lib/excel/exportXlsx";
import { extractXlsxImages, type ImagesBySheet } from "@/lib/excel/extractImages";
import { injectImagesIntoLuckysheet } from "@/lib/excel/injectImages";

type Props = {
  data: ArrayBuffer;
  fileName?: string;
  onSaveToCloud?: (blob: Blob, suggestedName: string) => Promise<void> | void;
  cloudSaving?: boolean;
  /** Optional extra content injected at the start of the custom toolbar (e.g. mode switcher from a parent). */
  modeControl?: React.ReactNode;
  /**
   * Called when Luckysheet completely fails to render (CDN load failure or LuckyExcel
   * transform error). Parent can use this to switch to a fallback viewer.
   */
  onFatalError?: () => void;
};

// CDN assets for Luckysheet (UMD bundle + its dependencies)
const LUCKY_CSS = [
  "https://cdn.jsdelivr.net/npm/luckysheet@2.1.13/dist/plugins/css/pluginsCss.css",
  "https://cdn.jsdelivr.net/npm/luckysheet@2.1.13/dist/plugins/plugins.css",
  "https://cdn.jsdelivr.net/npm/luckysheet@2.1.13/dist/css/luckysheet.css",
  "https://cdn.jsdelivr.net/npm/luckysheet@2.1.13/dist/assets/iconfont/iconfont.css",
];

// Override Luckysheet's canvas fonts with locally bundled Vietnamese/Japanese-capable fonts.
const FONT_SANS_FAMILY = "Noto Sans";
const FONT_SERIF_FAMILY = "Noto Serif";
const FONT_MONO_FAMILY = "Roboto Mono";
const FONT_STACK =
  '"Noto Sans", "Noto Sans JP", "Segoe UI", "Yu Gothic UI", "Meiryo", Arial, sans-serif';
// (serif/mono stacks available if needed for future canvas overrides)
// const FONT_SERIF_STACK = '"Noto Serif", "Noto Serif JP", ...';
// const FONT_MONO_STACK = '"Roboto Mono", "Noto Sans JP", ...';

const VIETNAMESE_FONT_SAMPLE =
  "Tiếng Việt đầy đủ dấu: à á ả ã ạ ă ằ ắ ẳ ẵ ặ â ầ ấ ẩ ẫ ậ đ è é ẻ ẽ ẹ ê ề ế ểễệ ì í ỉ ĩ ị ò ó ỏ õ ọ ô ồ ố ổỗộ ơờớởỡợ ù ú ủũụ ưừứửữự ỳýỷỹỵ ĐẠI HỌC KIỂM TRA";
const JAPANESE_FONT_SAMPLE =
  "日本語フォント確認：危険度 改善対策 部門 工程 指摘事項 重大災害 ＡＢＣ";

// Map common Excel fonts -> our web-font stacks
const FONT_MAP: Record<string, string> = {
  "times new roman": FONT_SERIF_FAMILY,
  times: FONT_SERIF_FAMILY,
  cambria: FONT_SERIF_FAMILY,
  georgia: FONT_SERIF_FAMILY,
  calibri: FONT_SANS_FAMILY,
  arial: FONT_SANS_FAMILY,
  tahoma: FONT_SANS_FAMILY,
  verdana: FONT_SANS_FAMILY,
  "ms pgothic": FONT_SANS_FAMILY,
  "ms gothic": FONT_SANS_FAMILY,
  meiryo: FONT_SANS_FAMILY,
  "yu gothic": FONT_SANS_FAMILY,
  "courier new": FONT_MONO_FAMILY,
  courier: FONT_MONO_FAMILY,
  consolas: FONT_MONO_FAMILY,
  menlo: FONT_MONO_FAMILY,
};
const normalizeFontKey = (ff?: string) =>
  (ff || "")
    .trim()
    .toLowerCase()
    .replace(/^["']|["']$/g, "");
const remapFont = (ff?: string) => {
  const key = normalizeFontKey(ff);
  if (!key) return FONT_SANS_FAMILY;
  if (key.includes(".vntime") || key.includes("vni-")) return FONT_SANS_FAMILY;
  if (key.includes("wingdings") || key.includes("webdings") || key === "symbol") {
    return FONT_SANS_FAMILY;
  }
  return FONT_MAP[key] || FONT_SANS_FAMILY;
};

const TCVN3_CHAR_MAP: Record<string, string> = {
  "µ": "à", "¸": "á", "¶": "ả", "·": "ã", "¹": "ạ",
  "¨": "ă", "»": "ằ", "¾": "ắ", "¼": "ẳ", "½": "ẵ", "Æ": "ặ",
  "©": "â", "Ç": "ầ", "Ê": "ấ", "È": "ẩ", "É": "ẫ", "Ë": "ậ",
  "®": "đ", "Ì": "è", "Ð": "é", "Î": "ẻ", "Ï": "ẽ", "Ñ": "ẹ",
  "ª": "ê", "Ò": "ề", "Õ": "ế", "Ó": "ể", "Ô": "ễ", "Ö": "ệ",
  "×": "ì", "Ý": "í", "Ø": "ỉ", "Ü": "ĩ", "Þ": "ị",
  "ß": "ò", "ã": "ó", "á": "ỏ", "â": "õ", "ä": "ọ",
  "«": "ô", "å": "ồ", "è": "ố", "æ": "ổ", "ç": "ỗ", "é": "ộ",
  "¬": "ơ", "ê": "ờ", "í": "ớ", "ë": "ở", "ì": "ỡ", "î": "ợ",
  "ï": "ù", "ó": "ú", "ñ": "ủ", "ò": "ũ", "ô": "ụ",
  "­": "ư", "õ": "ừ", "ø": "ứ", "ö": "ử", "÷": "ữ", "ù": "ự",
  "ú": "ỳ", "ý": "ý", "û": "ỷ", "ü": "ỹ", "þ": "ỵ",
  "¡": "Ă", "¢": "Â", "§": "Đ", "£": "Ê", "¤": "Ô", "¥": "Ơ", "¦": "Ư",
};

const VNI_REPLACEMENTS: Array<[RegExp, string]> = [
  [/ñ/g, "đ"], [/Ñ/g, "Đ"],
  [/aø/g, "à"], [/aù/g, "á"], [/aû/g, "ả"], [/aõ/g, "ã"], [/aï/g, "ạ"],
  [/aê/g, "ă"], [/aè/g, "ằ"], [/aé/g, "ắ"], [/aú/g, "ẳ"], [/aü/g, "ẵ"], [/aë/g, "ặ"],
  [/aâ/g, "â"], [/aà/g, "ầ"], [/aá/g, "ấ"], [/aå/g, "ẩ"], [/aã/g, "ẫ"], [/aä/g, "ậ"],
  [/eø/g, "è"], [/eù/g, "é"], [/eû/g, "ẻ"], [/eõ/g, "ẽ"], [/eï/g, "ẹ"],
  [/eâ/g, "ê"], [/eà/g, "ề"], [/eá/g, "ế"], [/eå/g, "ể"], [/eã/g, "ễ"], [/eä/g, "ệ"],
  [/iø/g, "ì"], [/í/g, "í"], [/æ/g, "ỉ"], [/ó/g, "ĩ"], [/ò/g, "ị"],
  [/oø/g, "ò"], [/où/g, "ó"], [/oû/g, "ỏ"], [/oõ/g, "õ"], [/oï/g, "ọ"],
  [/oâ/g, "ô"], [/oà/g, "ồ"], [/oá/g, "ố"], [/oå/g, "ổ"], [/oã/g, "ỗ"], [/oä/g, "ộ"],
  [/ôø/g, "ờ"], [/ôù/g, "ớ"], [/ôû/g, "ở"], [/ôõ/g, "ỡ"], [/ôï/g, "ợ"], [/ô/g, "ơ"],
  [/uø/g, "ù"], [/uù/g, "ú"], [/uû/g, "ủ"], [/uõ/g, "ũ"], [/uï/g, "ụ"],
  [/öø/g, "ừ"], [/öù/g, "ứ"], [/öû/g, "ử"], [/öõ/g, "ữ"], [/öï/g, "ự"], [/ö/g, "ư"],
  [/yø/g, "ỳ"], [/yù/g, "ý"], [/yû/g, "ỷ"], [/yõ/g, "ỹ"], [/î/g, "ỵ"],
];

// Wingdings code-point → Unicode equivalent (common subset used in Excel checklists)
const WINGDINGS_MAP: Record<string, string> = {
  "¨": "☐", "ý": "✓", "þ": "☑", "ü": "✓", "û": "✗", "ÿ": "☒",
  "l": "●", "n": "■", "u": "◆", "q": "□", "¡": "○",
  "F": "★", "J": "☺", "K": "😐", "L": "☹",
  "à": "⬆", "á": "⬇", "â": "⬅", "ã": "➡",
  "ä": "↖", "å": "↗", "æ": "↙", "ç": "↘",
  "è": "🖐", "Ø": "✎",
};
const WEBDINGS_MAP: Record<string, string> = {
  "a": "✓", "r": "✗", "5": "🏠", "1": "🌐",
  "p": "▶", "q": "■", "P": "◀",
};
const SYMBOL_MAP: Record<string, string> = {
  "\u00FE": "→", "\u00DF": "↔", "\u00AC": "←", "\u00AD": "↑", "\u00AF": "↓",
  "\u00B7": "·", "\u00B4": "×", "\u00B8": "÷",
  "\u00D7": "✗", "\u00D6": "✓",
};

const mapSymbolChars = (text: string, table: Record<string, string>) =>
  Array.from(text, (c) => table[c] || c).join("");

const convertTcvn3 = (text: string) =>
  Array.from(text, (char) => TCVN3_CHAR_MAP[char] || char).join("");
const convertVni = (text: string) =>
  VNI_REPLACEMENTS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
const normalizeTextForFont = (value: string, font?: string) => {
  const key = normalizeFontKey(font);
  let text = value.normalize("NFC");
  if (key.includes(".vntime")) text = convertTcvn3(text);
  if (key.includes("vni-")) text = convertVni(text);
  if (key.includes("wingdings")) text = mapSymbolChars(text, WINGDINGS_MAP);
  else if (key.includes("webdings")) text = mapSymbolChars(text, WEBDINGS_MAP);
  else if (key === "symbol") text = mapSymbolChars(text, SYMBOL_MAP);
  return text.normalize("NFC");
};

const sanitizeCanvasFont = (value: string) => {
  let font = value
    .replace(/"Times New Roman"|Times New Roman|"Cambria"|Cambria/gi, '"Noto Serif"')
    .replace(/"Calibri"|Calibri|"Arial"|Arial|"Tahoma"|Tahoma|"Verdana"|Verdana/gi, '"Noto Sans"')
    .replace(/"Webdings"|Webdings|"Wingdings"|Wingdings|"Symbol"|Symbol/gi, '"Noto Sans"')
    .replace(/"Noto Sans, Noto Sans JP, [^"]+"/gi, '"Noto Sans"')
    .replace(/"Noto Serif, Noto Sans JP, [^"]+"/gi, '"Noto Serif"');

  if (!font.includes("Noto Sans JP") && !font.includes("Noto Serif JP")) {
    if (/sans-serif/i.test(font)) {
      font = font.replace(/sans-serif\s*$/i, '"Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif');
    } else if (/serif\s*$/i.test(font)) {
      font = font.replace(/,?\s*serif\s*$/i, ', "Noto Serif JP", "Noto Sans JP", serif');
    } else {
      font += ', "Noto Sans JP", "Noto Sans", sans-serif';
    }
  }
  return font.normalize("NFC");
};

function installCanvasFontPatch() {
  const proto = window.CanvasRenderingContext2D?.prototype as any;
  if (!proto || proto.__excelVietnameseFontPatchV2) return;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "font");
  if (descriptor?.set && descriptor?.get) {
    Object.defineProperty(proto, "font", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value: string) {
        descriptor.set?.call(this, sanitizeCanvasFont(value));
      },
    });
  }

  const normalizeCanvasText = (value: unknown) =>
    typeof value === "string" ? value.normalize("NFC") : String(value ?? "").normalize("NFC");
  const originalFillText = proto.fillText;
  const originalStrokeText = proto.strokeText;
  const originalMeasureText = proto.measureText;
  if (typeof originalFillText === "function") {
    proto.fillText = function (text: unknown, ...args: any[]) {
      return originalFillText.apply(this, [normalizeCanvasText(text), ...args]);
    };
  }
  if (typeof originalStrokeText === "function") {
    proto.strokeText = function (text: unknown, ...args: any[]) {
      return originalStrokeText.apply(this, [normalizeCanvasText(text), ...args]);
    };
  }
  if (typeof originalMeasureText === "function") {
    proto.measureText = function (text: unknown) {
      return originalMeasureText.call(this, normalizeCanvasText(text));
    };
  }

  proto.__excelVietnameseFontPatch = true;
  proto.__excelVietnameseFontPatchV2 = true;
}

const FONT_OVERRIDE_CSS = `
  /* Apply web fonts to text surfaces only — DO NOT touch icon font glyphs */
  #luckysheet .luckysheet-cell-input,
  #luckysheet .luckysheet-input-box,
  #luckysheet .luckysheet-cols-h-cells,
  #luckysheet .luckysheet-rows-h,
  #luckysheet .luckysheet-sheet-area,
  #luckysheet .luckysheet-sheet-container,
  #luckysheet .luckysheet-stat-area,
  #luckysheet .luckysheet-sheet-content,
  #luckysheet .sheet-tab,
  #luckysheet .luckysheet-modal-dialog,
  #luckysheet .luckysheet-modal-dialog * { font-family: ${FONT_STACK} !important; }
  /* Preserve Luckysheet's bundled iconfont so toolbar buttons render glyphs */
  #luckysheet [class*="iconfont"],
  #luckysheet .luckysheet-toolbar-button-split-left i,
  #luckysheet .luckysheet-toolbar-button i,
  #luckysheet .luckysheet-icon,
  #luckysheet .luckysheet-icon-img,
  #luckysheet i[class*="luckysheet-icon"] { font-family: "iconfont" !important; }
  /* Toolbar/text chrome should use Noto Sans (not iconfont) */
  #luckysheet .luckysheet-toolbar-button-split-left,
  #luckysheet .luckysheet-toolbar > div:not([class*="icon"]) { font-family: ${FONT_STACK} !important; }
  /* Crisper text on HiDPI canvas rendering */
  .luckysheet-share-area canvas, .luckysheet-cell-main canvas {
    image-rendering: -webkit-optimize-contrast;
    text-rendering: geometricPrecision;
  }
  /* Runtime toggles driven by wrapper classes */
  .excel-grid-wrap.hide-headers .luckysheet-rows-h,
  .excel-grid-wrap.hide-headers .luckysheet-cols-h-c,
  .excel-grid-wrap.hide-headers .luckysheet-cols-h-cells,
  .excel-grid-wrap.hide-headers .luckysheet-left-top { display: none !important; }
  .excel-grid-wrap.hide-formulabar #luckysheet-wa-editor,
  .excel-grid-wrap.hide-formulabar .luckysheet-wa-editor,
  .excel-grid-wrap.hide-formulabar .luckysheet-formula-text-color { display: none !important; }
  .excel-grid-wrap.hide-stat .luckysheet-stat-area { display: none !important; }
  /* Dark mode — invert Luckysheet chrome while keeping cell canvas readable */
  html.dark .excel-grid-wrap { background: #0b0f17; color: #e5e7eb; }
  html.dark #luckysheet,
  html.dark #luckysheet .luckysheet-grid-container,
  html.dark #luckysheet .luckysheet-sheet-area,
  html.dark #luckysheet .luckysheet-sheet-container,
  html.dark #luckysheet .luckysheet-sheet-content { background: #0b0f17 !important; }
  html.dark #luckysheet .luckysheet-cols-h-cells,
  html.dark #luckysheet .luckysheet-rows-h,
  html.dark #luckysheet .luckysheet-left-top,
  html.dark #luckysheet-wa-editor,
  html.dark #luckysheet .luckysheet-wa-editor,
  html.dark #luckysheet .luckysheet-sheet-area,
  html.dark #luckysheet .sheet-tab,
  html.dark #luckysheet .luckysheet-sheets-item,
  html.dark #luckysheet .luckysheet-stat-area,
  html.dark #luckysheet .luckysheet-toolbar { background: #111827 !important; color: #e5e7eb !important; border-color: #1f2937 !important; }
  html.dark #luckysheet .luckysheet-sheets-item-active { background: #1f2937 !important; color: #fff !important; }
  html.dark #luckysheet .luckysheet-toolbar-button,
  html.dark #luckysheet .luckysheet-toolbar-button-split-left,
  html.dark #luckysheet .luckysheet-toolbar-button-split-right { color: #e5e7eb !important; }
  html.dark #luckysheet .luckysheet-toolbar-button:hover,
  html.dark #luckysheet .luckysheet-toolbar-button-split-left:hover,
  html.dark #luckysheet .luckysheet-toolbar-button-split-right:hover { background: #1f2937 !important; }
  html.dark #luckysheet input,
  html.dark #luckysheet .luckysheet-input-box { background: #0b0f17 !important; color: #e5e7eb !important; border-color: #374151 !important; }
  html.dark .luckysheet-modal-dialog,
  html.dark .luckysheet-modal-dialog * { background-color: #111827; color: #e5e7eb; }
  @media print {
    body * { visibility: hidden; }
    #luckysheet, #luckysheet * { visibility: visible; }
    #luckysheet { position: absolute; inset: 0; }
    .excel-grid-toolbar { display: none !important; }
  }
`;
const LUCKY_JS = [
  "https://cdn.jsdelivr.net/npm/luckysheet@2.1.13/dist/plugins/js/plugin.js",
  "https://cdn.jsdelivr.net/npm/luckysheet@2.1.13/dist/luckysheet.umd.js",
];

let loadPromise: Promise<void> | null = null;

function loadLuckysheet(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).luckysheet) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // CSS
    for (const href of LUCKY_CSS) {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
      }
    }
    // JS, in order
    for (const src of LUCKY_JS) {
      await new Promise<void>((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const s = document.createElement("script");
        s.src = src;
        s.async = false;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Không tải được " + src));
        document.head.appendChild(s);
      });
    }
  })().catch((err) => {
    // Reset so the next mount can retry CDN load instead of caching the failure.
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}

function clearLuckysheetImageDom() {
  try {
    document.querySelectorAll(
      "#luckysheet-image-showBoxs .img-list, " +
        "#luckysheet-modal-dialog-activeImage, " +
        "#luckysheet-modal-dialog-cropping, " +
        ".luckysheet-modal-dialog-image",
    ).forEach((el) => {
      if (el.classList.contains("img-list")) el.innerHTML = "";
      else el.remove();
    });
  } catch {}
}

const VIEW_PREFS_KEY = "excel-view-prefs-v1";
type ViewToggles = { headers: boolean; formulaBar: boolean; statBar: boolean };
type FilePrefs = { zoom?: number; activeSheet?: number };
type ViewPrefs = { theme?: "light" | "dark"; toggles?: ViewToggles; files?: Record<string, FilePrefs> };

const readPrefs = (): ViewPrefs => {
  try { return JSON.parse(localStorage.getItem(VIEW_PREFS_KEY) || "{}"); } catch { return {}; }
};
const writePrefs = (p: ViewPrefs) => {
  try { localStorage.setItem(VIEW_PREFS_KEY, JSON.stringify(p)); } catch {}
};

export default function ExcelGridViewer({ data, fileName = "file.xlsx", onSaveToCloud, cloudSaving, modeControl, onFatalError }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const idRef = useRef(`luckysheet-${Math.random().toString(36).slice(2)}`);

  const initialPrefs = readPrefs();
  const [theme, setTheme] = useState<"light" | "dark">(
    initialPrefs.theme || (typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light"),
  );
  const [toggles, setToggles] = useState<ViewToggles>(
    initialPrefs.toggles || { headers: true, formulaBar: true, statBar: true },
  );
  const [freezeOpen, setFreezeOpen] = useState(false);

  // Page-break navigation
  const [pageStarts, setPageStarts] = useState<number[]>([]); // row index where each print page starts
  const [currentPage, setCurrentPage] = useState(0);

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    const p = readPrefs(); p.theme = theme; writePrefs(p);
  }, [theme]);

  // Persist toggles
  useEffect(() => {
    const p = readPrefs(); p.toggles = toggles; writePrefs(p);
  }, [toggles]);

  // Save per-file prefs (zoom)
  const saveFilePrefs = useCallback((patch: Partial<FilePrefs>) => {
    const p = readPrefs();
    p.files = p.files || {};
    p.files[fileName] = { ...(p.files[fileName] || {}), ...patch };
    writePrefs(p);
  }, [fileName]);

  // Page navigation
  const goToPage = useCallback((page: number, starts: number[]) => {
    const ls = (window as any).luckysheet;
    if (!ls || starts.length === 0) return;
    const clamped = Math.max(0, Math.min(starts.length - 1, page));
    const rowIdx = starts[clamped];
    try {
      // setRangeShow selects a cell; Luckysheet natively scrolls to keep the
      // selection visible. No extra option needed — the second arg is not
      // documented to support scrollToRange in v2.x.
      ls.setRangeShow?.({ row: [rowIdx, rowIdx], column: [0, 0] });
    } catch (e) {
      console.warn("[ExcelGridViewer] goToPage scroll failed:", e);
    }
    // Update the page counter regardless (scroll failing is non-critical)
    setCurrentPage(clamped);
  }, []);

  // Images are injected natively into sheet.images (see injectImagesIntoLuckysheet)
  const imagesRef = useRef<ImagesBySheet>({});

  // ----- Toolbar actions -----
  const applyZoom = useCallback((z: number) => {
    const ls: any = (window as any).luckysheet;
    if (!ls) return;
    const clamped = Math.max(0.5, Math.min(2, Number(z.toFixed(2))));
    try {
      const files = ls.getluckysheetfile?.() || [];
      for (let i = 0; i < files.length; i++) {
        ls.setSheetZoom?.(clamped, { order: i });
      }
      // setSheetZoom updates ga.zoomRatio + redraws the grid but does NOT
      // re-emit image DOM. Force a full re-activation of the current sheet
      // so imageCtrl.allImagesShow() re-renders every image at the new zoom.
      const currentIdx =
        ls.getCurrentSheet?.()?.order ??
        (typeof ls.getCurrentSheet?.()?.index === "number" ? files.findIndex((f: any) => f.index === ls.getCurrentSheet().index) : 0);
      const idx = Math.max(0, currentIdx ?? 0);
      if (files.length > 1) {
        const other = idx === 0 ? 1 : 0;
        ls.setSheetActive?.(other);
        setTimeout(() => { try { ls.setSheetActive?.(idx); } catch {} }, 20);
      } else {
        ls.setSheetActive?.(idx);
      }
    } catch (e) {
      console.warn(e);
    }
    setZoom(clamped);
    saveFilePrefs({ zoom: clamped });
  }, [saveFilePrefs]);

  // ----- Freeze panes -----
  const freezeFirstRow = useCallback(() => {
    try { (window as any).luckysheet?.frozenFirstRow?.(); } catch {}
    setFreezeOpen(false);
  }, []);
  const freezeFirstCol = useCallback(() => {
    try { (window as any).luckysheet?.frozenFirstColumn?.(); } catch {}
    setFreezeOpen(false);
  }, []);
  const freezeAtCursor = useCallback(() => {
    const ls: any = (window as any).luckysheet;
    try { ls?.frozenRangeAtCursor?.() ?? ls?.frozenRange?.(); } catch {}
    setFreezeOpen(false);
  }, []);
  const unfreeze = useCallback(() => {
    try { (window as any).luckysheet?.cancelFrozen?.(); } catch {}
    setFreezeOpen(false);
  }, []);

  const zoomIn = useCallback(() => applyZoom(zoom + 0.1), [zoom, applyZoom]);
  const zoomOut = useCallback(() => applyZoom(zoom - 0.1), [zoom, applyZoom]);
  const resetZoom = useCallback(() => applyZoom(1), [applyZoom]);
  const fitWidth = useCallback(() => {
    const ls: any = (window as any).luckysheet;
    const el = containerRef.current;
    if (!ls || !el) return;
    try {
      const sheet = ls.getluckysheetfile?.()[ls.getCurrentSheet?.()?.order ?? 0]
        ?? ls.getluckysheetfile?.()[0];
      const colLen = sheet?.config?.columnlen || {};
      const cols = sheet?.data?.[0]?.length || 26;
      let total = 0;
      for (let c = 0; c < cols; c++) total += Number(colLen[c]) || 73;
      const available = el.clientWidth - 60;
      if (total > 0 && available > 0) {
        applyZoom(Math.max(0.5, Math.min(2, available / total)));
      }
    } catch (e) {
      console.warn(e);
    }
  }, [applyZoom]);

  const openSearch = useCallback(() => {
    const ls: any = (window as any).luckysheet;
    try {
      ls?.find?.() ?? ls?.showSearch?.();
    } catch {
      const btn = document.querySelector<HTMLElement>(
        '#luckysheet-icon-searchReplace, [data-tips="Search and replace"]'
      );
      btn?.click();
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = wrapRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen?.();
      setIsFullscreen(false);
    }
    setTimeout(() => {
      try { (window as any).luckysheet?.resize?.(); } catch {}
    }, 200);
  }, []);

  const printOrPdf = useCallback(() => {
    window.print();
  }, []);

  const exportXlsx = useCallback(() => {
    try {
      const base = fileName.replace(/\.(xlsx|xls)$/i, "");
      exportLuckysheetToXlsx(`${base || "export"} (edited).xlsx`);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Không thể xuất file.");
    }
  }, [fileName]);

  // Fullscreen state sync
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Ctrl+wheel zoom
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      applyZoom(zoom + (e.deltaY < 0 ? 0.1 : -0.1));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, applyZoom]);

  // Ctrl+F for search, Ctrl+0 for reset zoom
  // Only fire when the viewer wrapper contains (or is) the active element / is hovered.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      // Guard: only intercept when focus is inside the viewer, or no other focusable element is active.
      const active = document.activeElement;
      const activeIsOther =
        active &&
        active !== document.body &&
        !wrap.contains(active);
      if (activeIsOther) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        openSearch();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "0" || e.code === "Numpad0")) {
        e.preventDefault();
        applyZoom(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch, applyZoom]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);
    setPageStarts([]);
    setCurrentPage(0);

    (async () => {
      try {
        await loadLuckysheet();
        installCanvasFontPatch();
        const LuckyExcelMod: any = await import("luckyexcel");
        const LuckyExcel = LuckyExcelMod.default || LuckyExcelMod;
        if (cancelled) return;

        const file = new File([data], fileName, {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        LuckyExcel.transformExcelToLucky(
          file,
          async (exportJson: any, _luckysheetfile: any) => {
            if (cancelled) return;
            if (!exportJson.sheets || exportJson.sheets.length === 0) {
              setError("Không đọc được file Excel. Đang chuyển sang chế độ bảng…");
              setLoading(false);
              setTimeout(() => { try { onFatalError?.(); } catch {} }, 800);
              return;
            }
            const nfc = (s: any) => (typeof s === "string" ? s.normalize("NFC") : s);
            const cleanCell = (cell: any) => {
              if (!cell || typeof cell !== "object") return;
              const originalFont = typeof cell.ff === "string" ? cell.ff : undefined;
              if (typeof cell.v === "string") cell.v = normalizeTextForFont(cell.v, originalFont);
              if (typeof cell.m === "string") cell.m = normalizeTextForFont(cell.m, originalFont);
              if (cell.ct && Array.isArray(cell.ct.s)) {
                for (const segment of cell.ct.s) {
                  if (!segment || typeof segment !== "object") continue;
                  const segmentFont = typeof segment.ff === "string" ? segment.ff : originalFont;
                  if (typeof segment.v === "string") {
                    segment.v = normalizeTextForFont(segment.v, segmentFont);
                  }
                  segment.ff = remapFont(segmentFont);
                }
              }
              cell.ff = remapFont(originalFont);
            };
            for (const sheet of exportJson.sheets) {
              if (Array.isArray(sheet.celldata)) {
                for (const cell of sheet.celldata) cleanCell(cell?.v);
              }
              if (Array.isArray(sheet.data)) {
                for (const row of sheet.data) {
                  if (!Array.isArray(row)) continue;
                  for (const cell of row) cleanCell(cell);
                }
              }
              if (sheet.name) sheet.name = nfc(sheet.name);
            }

            if (!document.getElementById("luckysheet-font-override")) {
              const style = document.createElement("style");
              style.id = "luckysheet-font-override";
              style.textContent = FONT_OVERRIDE_CSS;
              document.head.appendChild(style);
            }

            try {
              const f: any = (document as any).fonts;
              if (f?.load) {
                await Promise.all([
                  f.load('11px "Noto Sans"', VIETNAMESE_FONT_SAMPLE),
                  f.load('700 11px "Noto Sans"', VIETNAMESE_FONT_SAMPLE),
                  f.load('11px "Noto Serif"', VIETNAMESE_FONT_SAMPLE),
                  f.load('700 11px "Noto Serif"', VIETNAMESE_FONT_SAMPLE),
                  f.load('italic 11px "Noto Serif"', VIETNAMESE_FONT_SAMPLE),
                  f.load('700 italic 11px "Noto Serif"', VIETNAMESE_FONT_SAMPLE),
                  f.load('11px "Noto Sans JP"', JAPANESE_FONT_SAMPLE),
                  f.load('700 11px "Noto Sans JP"', JAPANESE_FONT_SAMPLE),
                  f.load('11px "Noto Serif JP"', JAPANESE_FONT_SAMPLE),
                  f.load('700 11px "Noto Serif JP"', JAPANESE_FONT_SAMPLE),
                ]);
                await f.ready;
              }
            } catch {}

            // Extract embedded images FIRST so we can inject them as native
            // Luckysheet images (correct zoom / scroll / freeze behavior).
            try {
              const imgs = await extractXlsxImages(data.slice(0));
              if (cancelled) return;
              imagesRef.current = imgs;
              injectImagesIntoLuckysheet(exportJson.sheets, imgs);
            } catch (e) {
              console.warn("extractXlsxImages failed", e);
            }

            const luckysheet = (window as any).luckysheet;
            installCanvasFontPatch();
            clearLuckysheetImageDom();
            try { luckysheet.destroy?.(); } catch {}
            clearLuckysheetImageDom();
            if (containerRef.current) containerRef.current.innerHTML = "";
            const filePrefs = (readPrefs().files || {})[fileName] || {};
            const restoredZoom = Math.max(0.5, Math.min(2, Number(filePrefs.zoom) || 1));

            // Force every sheet's zoomRatio to match our target BEFORE create
            // so the first paint is already correct.
            for (const sheet of exportJson.sheets) {
              sheet.zoomRatio = restoredZoom;
            }

            luckysheet.create({
              container: idRef.current,
              data: exportJson.sheets,
              title: nfc(exportJson.info?.name) || fileName,
              lang: "en",
              allowEdit: true,
              showinfobar: false,
              showtoolbar: true,
              showsheetbar: true,
              showstatisticBar: true,
              enableAddRow: true,
              enableAddBackTop: false,
              sheetFormulaBar: true,
              defaultFontSize: 11,
              hook: {
                sheetActivate: (index: number) => {
                  saveFilePrefs({ activeSheet: index });
                },
              },
            });

            // Restore zoom + active sheet, then force every sheet's images
            // to re-render at the current zoomRatio. Also extract page breaks.
            setTimeout(() => {
              // Guard against unmount or rapid file-switch
              if (cancelled) return;
              try {
                const files = luckysheet.getluckysheetfile?.() || [];
                for (let i = 0; i < files.length; i++) {
                  luckysheet.setSheetZoom?.(restoredZoom, { order: i });
                }
                const targetSheet =
                  typeof filePrefs.activeSheet === "number" && filePrefs.activeSheet < files.length
                    ? filePrefs.activeSheet
                    : 0;
                // Switch away (if possible) then back to force a full image refresh
                if (files.length > 1) {
                  const other = targetSheet === 0 ? 1 : 0;
                  luckysheet.setSheetActive?.(other);
                  setTimeout(() => {
                    try { luckysheet.setSheetActive?.(targetSheet); } catch {}
                  }, 30);
                } else {
                  luckysheet.setSheetActive?.(targetSheet);
                }

                // Extract print page breaks for page navigation
                if (!cancelled) {
                  try {
                    const sheet = files[targetSheet] || files[0];
                    if (sheet) {
                      const rawBreaks: number[] = sheet?.config?.rowBreaks || [];
                      let starts: number[] = [];
                      if (rawBreaks.length > 0) {
                        // rowBreaks = row indices AFTER which a new page begins
                        const sorted = [...rawBreaks].sort((a, b) => a - b);
                        starts = [0, ...sorted.map((b: number) => b + 1)];
                      } else {
                        // Estimate from row heights: A4 at 96 dpi ≈ 1123px per page
                        const PAGE_H = 1123;
                        const rowH: Record<number, number> = sheet?.config?.rowlen || {};
                        const DEFAULT_ROW_H = 19;
                        let totalRows = 0;
                        if (Array.isArray(sheet.data)) totalRows = sheet.data.length;
                        else if (Array.isArray(sheet.celldata)) {
                          for (const c of sheet.celldata) {
                            if (c && typeof c.r === "number") totalRows = Math.max(totalRows, c.r + 1);
                          }
                        }
                        if (totalRows > 20) {
                          starts = [0];
                          let acc = 0;
                          for (let r = 0; r < totalRows; r++) {
                            acc += rowH[r] != null ? Number(rowH[r]) : DEFAULT_ROW_H;
                            if (acc >= PAGE_H) {
                              const nextStart = r + 1;
                              // Avoid trailing start equal to or beyond last row
                              if (nextStart < totalRows) starts.push(nextStart);
                              acc = 0;
                            }
                          }
                        }
                      }
                      if (starts.length > 1) setPageStarts(starts);
                    }
                  } catch (e) {
                    console.warn("[ExcelGridViewer] page break extraction failed:", e);
                  }
                }
              } catch {}
            }, 350);

            // Auto-fit width on first open (no saved zoom preference).
            // Prevents the spreadsheet from appearing squished when the
            // file's actual column widths exceed the viewer container.
            if (!filePrefs.zoom) {
              const doAutoFit = (attempt: number) => {
                if (cancelled) return;
                try {
                  const el = containerRef.current;
                  if (!el) return;
                  const clientW = el.clientWidth;
                  // Retry once if layout hasn't settled yet (clientWidth == 0)
                  if (clientW === 0 && attempt === 0) {
                    setTimeout(() => doAutoFit(1), 300);
                    return;
                  }
                  const files = luckysheet.getluckysheetfile?.() || [];
                  const sheet = files[0];
                  if (!sheet) return;

                  // Determine the true max used column index from both celldata and data arrays
                  let maxCol = -1;
                  if (Array.isArray(sheet.celldata)) {
                    for (const c of sheet.celldata) {
                      if (c && c.v != null && typeof c.c === "number") maxCol = Math.max(maxCol, c.c);
                    }
                  }
                  if (Array.isArray(sheet.data)) {
                    for (const row of sheet.data) {
                      if (Array.isArray(row)) {
                        for (let ci = row.length - 1; ci >= 0; ci--) {
                          if (row[ci] != null) { maxCol = Math.max(maxCol, ci); break; }
                        }
                      }
                    }
                  }
                  // No real content — skip auto-fit
                  if (maxCol < 0) return;

                  const colLen: Record<string, number> = sheet?.config?.columnlen || {};
                  const DEFAULT_COL_W = 73;
                  let totalWidth = 0;
                  for (let c = 0; c <= maxCol; c++) {
                    // Use nullish check: colLen may have explicit 0 for hidden cols
                    const w = colLen[c] != null ? Number(colLen[c]) : DEFAULT_COL_W;
                    // Skip hidden/zero-width columns (don't let them inflate total)
                    if (w > 0) totalWidth += w;
                  }

                  const available = clientW - 46; // subtract row-header width
                  if (totalWidth > 0 && available > 0 && totalWidth > available) {
                    // Scale down to fit. Min 0.75 so text stays legible; if still
                    // too wide at 0.75 Luckysheet handles horizontal scroll.
                    const autoZoom = Math.max(0.75, Math.min(1.0, available / totalWidth));
                    for (let i = 0; i < files.length; i++) {
                      luckysheet.setSheetZoom?.(autoZoom, { order: i });
                    }
                    setZoom(autoZoom);
                    saveFilePrefs({ zoom: autoZoom });
                    // Re-activate current sheet to refresh images at new zoom
                    const targetSheet =
                      typeof filePrefs.activeSheet === "number" && filePrefs.activeSheet < files.length
                        ? filePrefs.activeSheet : 0;
                    luckysheet.setSheetActive?.(targetSheet);
                  }
                } catch (e) {
                  console.warn("[ExcelGridViewer] auto-fit failed:", e);
                }
              };
              setTimeout(() => doAutoFit(0), 650);
            }

            setZoom(restoredZoom);
            setLoading(false);
          },
          (err: any) => {
            console.error("[ExcelGridViewer] LuckyExcel transform failed:", err);
            if (!cancelled) {
              setError("Không thể chuyển đổi file Excel. Đang chuyển sang chế độ bảng…");
              setLoading(false);
              // Give the error message a moment to display, then fire the fallback.
              setTimeout(() => { try { onFatalError?.(); } catch {} }, 800);
            }
          },
        );
      } catch (e) {
        console.error("[ExcelGridViewer] Fatal error:", e);
        if (!cancelled) {
          setError("Không thể hiển thị file Excel. Đang chuyển sang chế độ bảng…");
          setLoading(false);
          setTimeout(() => { try { onFatalError?.(); } catch {} }, 800);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearLuckysheetImageDom();
      try { (window as any).luckysheet?.destroy?.(); } catch {}
      clearLuckysheetImageDom();
    };
  }, [data, fileName]);

  const btn =
    "inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700";

  const wrapClass = [
    "excel-grid-wrap relative flex h-full w-full flex-col bg-white dark:bg-gray-900",
    toggles.headers ? "" : "hide-headers",
    toggles.formulaBar ? "" : "hide-formulabar",
    toggles.statBar ? "" : "hide-stat",
  ].filter(Boolean).join(" ");

  // Resize Luckysheet when toggles change layout
  useEffect(() => {
    const t = setTimeout(() => { try { (window as any).luckysheet?.resize?.(); } catch {} }, 50);
    return () => clearTimeout(t);
  }, [toggles]);

  const toggleBtn = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium transition-colors ${
      active
        ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
        : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
    }`;

  return (
    <div ref={wrapRef} className={wrapClass} style={{ minHeight: 0 }}>
      {/* Custom toolbar */}
      <div className="excel-grid-toolbar flex shrink-0 flex-wrap items-center gap-1.5 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        {/* Injected mode control from parent (e.g. view mode switcher in XlsxViewer) */}
        {modeControl && (
          <>
            {modeControl}
            <div className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-600" />
          </>
        )}
        {/* Page navigation — shown when the sheet has multiple print pages */}
        {pageStarts.length > 1 && (
          <div className="flex items-center gap-0.5 rounded border border-indigo-200 bg-indigo-50 p-0.5 dark:border-indigo-800 dark:bg-indigo-950/40">
            <button
              onClick={() => goToPage(currentPage - 1, pageStarts)}
              disabled={currentPage === 0}
              className="inline-flex items-center rounded px-1.5 py-1 text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-40 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
              title="Trang trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[72px] select-none text-center text-xs font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">
              Trang {currentPage + 1} / {pageStarts.length}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1, pageStarts)}
              disabled={currentPage >= pageStarts.length - 1}
              className="inline-flex items-center rounded px-1.5 py-1 text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-40 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
              title="Trang sau"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {pageStarts.length > 1 && <div className="mx-0.5 h-5 w-px bg-gray-200 dark:bg-gray-600" />}

        {/* Zoom controls */}
        <div className="flex items-center gap-0.5 rounded border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-900">
          <button onClick={zoomOut} className={btn + " border-0"} title="Thu nhỏ (Ctrl + cuộn xuống)">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={resetZoom}
            className="min-w-[52px] rounded px-1.5 text-xs font-medium tabular-nums text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
            title="Đặt lại 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={zoomIn} className={btn + " border-0"} title="Phóng to (Ctrl + cuộn lên)">
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>

        <button onClick={fitWidth} className={btn} title="Vừa khít chiều ngang">
          <Maximize className="h-4 w-4" /> Fit width
        </button>
        <button onClick={openSearch} className={btn} title="Tìm kiếm (Ctrl+F)">
          <Search className="h-4 w-4" /> Tìm
        </button>

        <div className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-600" />

        {/* View toggles */}
        <button
          onClick={() => setToggles((t) => ({ ...t, headers: !t.headers }))}
          className={toggleBtn(toggles.headers)}
          title="Hiện/ẩn tiêu đề hàng & cột"
        >
          {toggles.headers ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} Tiêu đề
        </button>
        <button
          onClick={() => setToggles((t) => ({ ...t, formulaBar: !t.formulaBar }))}
          className={toggleBtn(toggles.formulaBar)}
          title="Hiện/ẩn thanh công thức"
        >
          <Sigma className="h-4 w-4" /> Công thức
        </button>

        {/* Freeze panes */}
        <div className="relative">
          <button
            onClick={() => setFreezeOpen((v) => !v)}
            className={btn}
            title="Cố định hàng/cột"
          >
            <Snowflake className="h-4 w-4" /> Cố định <ChevronDown className="h-3 w-3" />
          </button>
          {freezeOpen && (
            <div
              className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
              onMouseLeave={() => setFreezeOpen(false)}
            >
              <button onClick={freezeFirstRow} className="block w-full rounded px-3 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">
                Cố định hàng đầu
              </button>
              <button onClick={freezeFirstCol} className="block w-full rounded px-3 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">
                Cố định cột đầu
              </button>
              <button onClick={freezeAtCursor} className="block w-full rounded px-3 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">
                Cố định tại ô đang chọn
              </button>
              <div className="my-1 h-px bg-gray-200 dark:bg-gray-600" />
              <button onClick={unfreeze} className="block w-full rounded px-3 py-1.5 text-left text-xs text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700">
                Bỏ cố định
              </button>
            </div>
          )}
        </div>

        {/* Theme */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className={btn}
          title="Chế độ sáng/tối"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === "dark" ? "Sáng" : "Tối"}
        </button>

        <div className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-600" />

        <button onClick={toggleFullscreen} className={btn} title="Toàn màn hình (F11)">
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          {isFullscreen ? "Thoát" : "Toàn màn hình"}
        </button>
        <button onClick={printOrPdf} className={btn} title="In / Lưu PDF">
          <Printer className="h-4 w-4" /> In / PDF
        </button>
        <button
          onClick={exportXlsx}
          className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          title="Tải về file Excel đã chỉnh sửa"
        >
          <Download className="h-4 w-4" /> Xuất XLSX
        </button>
        {onSaveToCloud && (
          <button
            onClick={async () => {
              try {
                const blob = buildLuckysheetXlsxBlob();
                await onSaveToCloud(blob, fileName);
              } catch (e: any) {
                setError(e?.message || "Không thể lưu lên cloud");
              }
            }}
            disabled={cloudSaving}
            className="inline-flex items-center gap-1.5 rounded border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
            title="Lưu phiên bản mới lên cloud"
          >
            {cloudSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
            Lưu cloud
          </button>
        )}
      </div>

      {/* Grid area */}
      <div className="relative flex-1" style={{ minHeight: 0 }}>
        <div
          id={idRef.current}
          ref={containerRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
        {loading && !error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/60 text-sm text-gray-400 dark:bg-gray-900/60">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span>Đang tải bảng tính...</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 p-6 text-center text-sm text-red-500 dark:bg-gray-900/80">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
