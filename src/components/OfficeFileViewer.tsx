// @ts-nocheck
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { createClientDocxPreview } from "../utils/docxPreviewClient";
import PdfJsViewer from "./PdfJsViewer";
import ExcelGridViewer from "./ExcelGridViewer";

type Kind = "xlsx" | "docx" | "pdf" | "image" | "unsupported";

interface Props {
  url?: string;
  fileName: string;
  onClose: () => void;
  fileObj?: File;
}

function detectKind(name: string): Kind {
  const n = name.toLowerCase();
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) return "xlsx";
  if (n.endsWith(".docx")) return "docx";
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".gif") || n.endsWith(".webp")) return "image";
  return "unsupported";
}

function getExt(name: string) {
  return (name.split(".").pop() || "").toLowerCase();
}

function escHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── Color resolution: RGB / indexed / theme ── */
const OFFICE_THEME_COLORS = [
  "#FFFFFF","#000000","#E7E6E6","#44546A",
  "#4472C4","#ED7D31","#A5A5A5","#FFC000","#5B9BD5","#70AD47",
];
const INDEXED_COLORS = [
  "#000000","#FFFFFF","#FF0000","#00FF00","#0000FF","#FFFF00","#FF00FF","#00FFFF",
  "#000000","#FFFFFF","#FF0000","#00FF00","#0000FF","#FFFF00","#FF00FF","#00FFFF",
  "#800000","#008000","#000080","#808000","#800080","#008080","#C0C0C0","#808080",
  "#9999FF","#993366","#FFFFCC","#CCFFFF","#660066","#FF8080","#0066CC","#CCCCFF",
  "#000080","#FF00FF","#FFFF00","#00FFFF","#800080","#800000","#008080","#0000FF",
  "#00CCFF","#CCFFFF","#CCFFCC","#FFFF99","#99CCFF","#FF99CC","#CC99FF","#FFCC99",
  "#3366FF","#33CCCC","#99CC00","#FFCC00","#FF9900","#FF6600","#666699","#969696",
  "#003366","#339966","#003300","#333300","#993300","#993366","#333399","#333333",
];

function applyTint(hex: string, tint: number): string {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  let nr: number, ng: number, nb: number;
  if (tint > 0) {
    nr = Math.round(r + (255-r)*tint);
    ng = Math.round(g + (255-g)*tint);
    nb = Math.round(b + (255-b)*tint);
  } else {
    nr = Math.round(r*(1+tint));
    ng = Math.round(g*(1+tint));
    nb = Math.round(b*(1+tint));
  }
  return `#${nr.toString(16).padStart(2,"0")}${ng.toString(16).padStart(2,"0")}${nb.toString(16).padStart(2,"0")}`;
}

function resolveColor(colorObj: any, skipWhiteBlack = false): string | null {
  if (!colorObj) return null;
  let hex: string | null = null;
  if (colorObj.rgb) {
    hex = `#${colorObj.rgb.slice(-6)}`;
  } else if (colorObj.indexed !== undefined && colorObj.indexed < INDEXED_COLORS.length) {
    hex = INDEXED_COLORS[colorObj.indexed] || null;
  } else if (colorObj.theme !== undefined) {
    const base = OFFICE_THEME_COLORS[colorObj.theme] || null;
    if (!base) return null;
    hex = colorObj.tint ? applyTint(base, colorObj.tint) : base;
  }
  if (!hex) return null;
  if (skipWhiteBlack && (hex.toUpperCase() === "#FFFFFF" || hex.toUpperCase() === "#000000")) return null;
  return hex;
}

function borderEdge(b: any): string | null {
  if (!b?.style) return null;
  const w = b.style === "hair" ? "1px"
    : b.style === "thin" ? "1px"
    : b.style === "medium" ? "2px"
    : b.style === "thick" ? "3px"
    : b.style === "double" ? "3px"
    : "1px";
  const styleType = b.style === "double" ? "double" : "solid";
  const color = resolveColor(b.color) || "#000000";
  return `${w} ${styleType} ${color}`;
}

/* ══════════════════════════════════════════════════════
   X-SPREADSHEET converter  (SheetJS → x-data-spreadsheet)
   ══════════════════════════════════════════════════════ */

function resolveColorStr(colorObj: any, skipWhiteBlack = false): string {
  const c = resolveColor(colorObj, skipWhiteBlack);
  return c || "";
}

function mapXStyle(s: any): any {
  if (!s) return null;
  const xstyle: any = {};

  // Background
  if (s.fill && s.fill.patternType && s.fill.patternType !== "none") {
    const bg = resolveColorStr(s.fill?.fgColor, true);
    if (bg) xstyle.bgcolor = bg;
  }

  // Font
  const font: any = {};
  if (s.font) {
    if (s.font.bold)   font.bold   = true;
    if (s.font.italic) font.italic = true;
    if (s.font.underline && s.font.underline !== false) font.underline = true;
    if (s.font.sz) font.size = Math.max(9, Math.round(s.font.sz * 0.75));
    if (s.font.name) font.name = s.font.name;
    const fc = resolveColorStr(s.font?.color, true);
    if (fc) font.color = fc;
  }
  if (Object.keys(font).length) xstyle.font = font;

  // Alignment
  if (s.alignment) {
    const ha = s.alignment.horizontal;
    if (ha) xstyle.align = ha === "centerContinuous" ? "center" : ha;
    const va = s.alignment.vertical;
    if (va === "center") xstyle.valign = "middle";
    else if (va === "top" || va === "bottom") xstyle.valign = va;
    if (s.alignment.wrapText) xstyle.textwrap = true;
  }

  // Border
  const border: any = {};
  for (const side of ["top", "bottom", "left", "right"] as const) {
    const b = s.border?.[side];
    if (b?.style) {
      const color = resolveColorStr(b.color) || "#000000";
      border[side] = [b.style, color];
    }
  }
  if (Object.keys(border).length) xstyle.border = border;

  return Object.keys(xstyle).length ? xstyle : null;
}

function stoxConvert(wb: XLSX.WorkBook): any[] {
  const sheets: any[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) {
      sheets.push({ name, rows: {}, cols: {}, merges: [], styles: [] });
      continue;
    }
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const styleMap = new Map<string, number>();
    const styles: any[] = [];
    const rows: any = {};
    const cols: any = {};

    function getStyleIdx(xstyle: any): number | undefined {
      if (!xstyle) return undefined;
      const key = JSON.stringify(xstyle);
      if (styleMap.has(key)) return styleMap.get(key);
      const idx = styles.length;
      styles.push(xstyle);
      styleMap.set(key, idx);
      return idx;
    }

    for (let r = range.s.r; r <= range.e.r; r++) {
      const cells: any = {};
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) continue;
        const text = cell.w !== undefined ? cell.w : (cell.v !== undefined ? String(cell.v) : "");
        const xcell: any = { text };
        const xstyle = mapXStyle(cell.s);
        const si = getStyleIdx(xstyle);
        if (si !== undefined) xcell.style = si;
        cells[c] = xcell;
      }
      const rDef = (ws["!rows"] || [])[r];
      const row: any = { cells };
      if (rDef?.hpx) row.height = rDef.hpx;
      if (Object.keys(cells).length || rDef?.hpx) rows[r] = row;
    }

    // Column widths
    (ws["!cols"] || []).forEach((col: any, i: number) => {
      if (col?.wpx) cols[i] = { width: col.wpx };
    });

    // Merges
    const merges = (ws["!merges"] || []).map((m: any) => XLSX.utils.encode_range(m));

    sheets.push({ name, rows, cols, merges, styles });
  }
  return sheets;
}

/* ── x-spreadsheet iframe viewer ── */
function XSpreadViewer({ wb, triggerPrint }: { wb: XLSX.WorkBook; triggerPrint?: number }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sentRef   = useRef(false);
  const sheetsRef = useRef<any[] | null>(null);

  // Compute once
  if (!sheetsRef.current) sheetsRef.current = stoxConvert(wb);

  function sendData() {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !sheetsRef.current) return;
    iframe.contentWindow.postMessage({ type: "LOAD_DATA", sheets: sheetsRef.current }, "*");
    sentRef.current = true;
  }

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "XSPREAD_READY") sendData();
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    sentRef.current = false;
    sheetsRef.current = stoxConvert(wb);
  }, [wb]);

  useEffect(() => {
    if (!triggerPrint) return;
    iframeRef.current?.contentWindow?.print();
  }, [triggerPrint]);

  const srcDoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/x-data-spreadsheet@1.1.9/dist/xspreadsheet.css">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{overflow:hidden;background:#fff}
  #app{position:absolute;inset:0}
</style>
</head>
<body>
<div id="app"></div>
<script src="https://cdn.jsdelivr.net/npm/x-data-spreadsheet@1.1.9/dist/xspreadsheet.js"></script>
<script>
(function(){
  var s=null;
  function init(){
    s=new window.x_spreadsheet('#app',{
      view:{height:function(){return document.documentElement.clientHeight},width:function(){return document.documentElement.clientWidth}},
      row:{len:200,height:25},
      col:{len:52,width:100,indexWidth:60,minWidth:40},
      showToolbar:false,
      showGrid:true,
      showContextmenu:false,
      mode:'read',
      style:{bgcolor:'#fff',align:'left',valign:'bottom',textwrap:false,strike:false,underline:false,color:'#0a0a0a',font:{name:'Arial',size:10,bold:false,italic:false}}
    });
  }
  window.addEventListener('message',function(e){
    if(!e.data||e.data.type!=='LOAD_DATA') return;
    if(!s) init();
    s.loadData(e.data.sheets);
  });
  window.parent.postMessage({type:'XSPREAD_READY'},'*');
})();
</script>
</body>
</html>`;

  return (
    <div style={{ flex:1, overflow:"hidden", position:"relative", display:"flex", flexDirection:"column" }}>
      <div style={{ padding:"6px 14px", background:"#fffbeb", borderBottom:"1px solid #fde68a",
        fontSize:12, color:"#92400e", display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
        <span>⚡</span>
        <span>Chế độ <strong>x-spreadsheet</strong> — render canvas, giữ màu nền / font / border tốt hơn. Cần internet để tải CDN.</span>
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-same-origin"
        style={{ flex:1, border:"none", display:"block", width:"100%", height:"100%" }}
        onLoad={sendData}
      />
    </div>
  );
}

/* ════════════════════════════════ */

function buildSheetHtml(ws: XLSX.WorkSheet): string {
  if (!ws || !ws["!ref"]) return "<p style='padding:32px;color:#94a3b8;font-family:sans-serif;font-size:14px;text-align:center'>📋 Sheet này không có dữ liệu.</p>";
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const colDefs = ws["!cols"] || [];
  const rowDefs = ws["!rows"] || [];
  const merges = ws["!merges"] || [];

  const hiddenCells = new Set<string>();
  const mergeMap = new Map<string, { cs: number; rs: number }>();
  for (const m of merges) {
    const key = `${m.s.r}_${m.s.c}`;
    mergeMap.set(key, { cs: m.e.c - m.s.c + 1, rs: m.e.r - m.s.r + 1 });
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r !== m.s.r || c !== m.s.c) hiddenCells.add(`${r}_${c}`);
      }
    }
  }

  let colgroup = '<colgroup><col class="rnum-col">';
  for (let c = range.s.c; c <= range.e.c; c++) {
    const def = colDefs[c];
    const w = def?.hidden ? "0px" : def?.wpx ? `${def.wpx}px` : def?.wch ? `${Math.round(def.wch * 7.5)}px` : "90px";
    colgroup += `<col style="width:${w}">`;
  }
  colgroup += "</colgroup>";

  let header = '<thead><tr class="col-hdr"><th class="corner"></th>';
  for (let c = range.s.c; c <= range.e.c; c++) {
    header += `<th>${XLSX.utils.encode_col(c)}</th>`;
  }
  header += "</tr></thead>";

  let body = "<tbody>";
  for (let r = range.s.r; r <= range.e.r; r++) {
    const rDef = rowDefs[r];
    const rh = rDef?.hidden ? ' style="display:none"' : rDef?.hpx ? ` style="height:${rDef.hpx}px"` : "";
    body += `<tr${rh}><td class="rnum">${r + 1}</td>`;

    for (let c = range.s.c; c <= range.e.c; c++) {
      if (hiddenCells.has(`${r}_${c}`)) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      const merge = mergeMap.get(`${r}_${c}`);
      const csAttr = merge && merge.cs > 1 ? ` colspan="${merge.cs}"` : "";
      const rsAttr = merge && merge.rs > 1 ? ` rowspan="${merge.rs}"` : "";

      let display = "";
      if (cell) {
        display = cell.w !== undefined ? cell.w : cell.v !== undefined ? String(cell.v) : "";
      }

      let styles: string[] = [];
      const s = cell?.s;
      if (s) {
        /* ── Fill / background ── */
        const patType = s.fill?.patternType;
        if (patType && patType !== "none") {
          const bg = resolveColor(s.fill?.fgColor, true);
          if (bg) styles.push(`background:${bg}`);
        }

        /* ── Font ── */
        if (s.font?.bold) styles.push("font-weight:700");
        if (s.font?.italic) styles.push("font-style:italic");
        const uline = s.font?.underline;
        if (uline && uline !== false) styles.push("text-decoration:underline");
        const fc = resolveColor(s.font?.color, true);
        if (fc) styles.push(`color:${fc}`);
        if (s.font?.sz) styles.push(`font-size:${Math.max(9, Math.round(s.font.sz * 0.75))}px`);
        if (s.font?.name) styles.push(`font-family:"${s.font.name}",Arial,sans-serif`);

        /* ── Alignment ── */
        const ha = s.alignment?.horizontal;
        if (ha) styles.push(`text-align:${ha === "centerContinuous" ? "center" : ha}`);
        const va = s.alignment?.vertical;
        if (va === "center") styles.push("vertical-align:middle");
        else if (va === "top") styles.push("vertical-align:top");
        if (s.alignment?.wrapText) styles.push("white-space:pre-wrap;overflow:visible;text-overflow:clip");

        /* ── Borders ── */
        const bl = borderEdge(s.border?.left);
        if (bl) styles.push(`border-left:${bl}`);
        const br2 = borderEdge(s.border?.right);
        if (br2) styles.push(`border-right:${br2}`);
        const bt = borderEdge(s.border?.top);
        if (bt) styles.push(`border-top:${bt}`);
        const bb = borderEdge(s.border?.bottom);
        if (bb) styles.push(`border-bottom:${bb}`);
      }

      const styleAttr = styles.length ? ` style="${styles.join(";")}"` : "";
      const title = display ? ` title="${escHtml(display)}"` : "";
      body += `<td${csAttr}${rsAttr}${styleAttr}${title}>${escHtml(display)}</td>`;
    }
    body += "</tr>";
  }
  body += "</tbody>";
  return `<table>${colgroup}${header}${body}</table>`;
}

function buildSrcdoc(tableHtml: string, query: string): string {
  const q = query.trim().toLowerCase();
  const highlightScript = q
    ? `
(function(){
  var cells=document.querySelectorAll("td:not(.rnum)");
  var q=${JSON.stringify(q)};
  var count=0;
  cells.forEach(function(td){
    var t=(td.textContent||"").toLowerCase();
    if(t.includes(q)){td.classList.add("hl");count++;}
  });
  if(window.parent) window.parent.postMessage({type:"xlsxHighlightCount",count:count},"*");
})()`
    : `if(window.parent)window.parent.postMessage({type:"xlsxHighlightCount",count:0},"*");`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{font-family:"Noto Sans JP","Noto Sans","Segoe UI",Arial,sans-serif;font-size:12px;background:#f1f5f9;color:#1e293b;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
#scroller{overflow:auto;height:100vh;width:100vw;cursor:default;scroll-behavior:smooth}
#scroller::-webkit-scrollbar{width:10px;height:10px}
#scroller::-webkit-scrollbar-track{background:#f1f5f9}
#scroller::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:5px;border:2px solid #f1f5f9}
#scroller::-webkit-scrollbar-thumb:hover{background:#94a3b8}
#scroller::-webkit-scrollbar-corner{background:#f1f5f9}
#zoomer{transform-origin:top left;display:inline-block;min-width:100%;padding:8px}
table{border-collapse:collapse;table-layout:fixed;min-width:calc(100% - 16px);background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)}
.rnum-col{width:44px}
.corner{background:#f1f5f9;border-right:2px solid #d1d9e0;border-bottom:2px solid #d1d9e0}
.col-hdr th{
  background:#f1f5f9;color:#475569;font-weight:700;font-size:11px;
  border-right:1px solid #dde3ea;border-bottom:2px solid #217346;
  padding:4px 6px;text-align:center;
  position:sticky;top:0;z-index:2;letter-spacing:.04em;
  white-space:nowrap;
}
.col-hdr th:first-child{position:sticky;left:0;z-index:3}
.rnum{
  background:#f8fafc;color:#64748b;font-size:11px;font-weight:600;
  border-right:2px solid #d1d9e0;border-bottom:1px solid #edf0f3;
  padding:2px 6px;text-align:right;
  position:sticky;left:0;z-index:1;min-width:44px;
}
td{
  border-right:1px solid #edf0f3;border-bottom:1px solid #edf0f3;
  padding:3px 8px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  vertical-align:bottom;min-height:22px;
}
tr:hover td:not(.rnum){background-color:rgba(33,115,70,0.04)}
tr:hover .rnum{background:#e8f5ee;color:#217346}
td.hl{background:#fef08a !important;outline:2px solid #eab308;outline-offset:-1px}
@media print{
  html,body{height:auto;overflow:visible;background:#fff}
  #scroller{overflow:visible;height:auto;width:auto}
  #zoomer{transform:none!important;width:auto!important;padding:0}
  table{box-shadow:none;border-radius:0;min-width:100%}
  .col-hdr th,.rnum{position:static}
  tr:hover td:not(.rnum){background:none}
  tr:hover .rnum{background:#f8fafc;color:#64748b}
}
</style>
</head>
<body>
<div id="scroller">
  <div id="zoomer">
    ${tableHtml}
  </div>
</div>
<script>
(function(){
  var zoom=1;
  var zoomer=document.getElementById('zoomer');
  var scroller=document.getElementById('scroller');

  function applyZoom(z){
    zoom=Math.min(3,Math.max(0.25,z));
    zoomer.style.transform='scale('+zoom+')';
    zoomer.style.width=Math.ceil(100/zoom)+'%';
    window.parent.postMessage({type:'TABLE_ZOOM_CHANGE',ratio:zoom},'*');
  }

  window.addEventListener('message',function(e){
    if(!e.data) return;
    if(e.data.type==='TABLE_ZOOM') applyZoom(e.data.ratio);
    if(e.data.type==='TABLE_PRINT') window.print();
  });

  document.addEventListener('wheel',function(e){
    if(!e.ctrlKey) return;
    e.preventDefault();
    applyZoom(zoom+(e.deltaY<0?0.1:-0.1));
  },{passive:false});

  ${highlightScript}
})();
</script>
</body>
</html>`;
}

/* ══════════════════════════════════════════════════════
   LUCKYSHEET viewer (Luckysheet + LuckyExcel via CDN)
   ══════════════════════════════════════════════════════ */
const ZOOM_STEPS = [25,33,50,67,75,80,90,100,110,125,150,175,200,250,300];
function nearestZoomStep(z: number, dir: 1 | -1): number {
  if (dir === 1) return ZOOM_STEPS.find(s => s > z) ?? 300;
  return [...ZOOM_STEPS].reverse().find(s => s < z) ?? 25;
}

function ZoomBar({ zoom, onZoom }: { zoom: number; onZoom: (z: number) => void }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
      <button
        onClick={() => onZoom(nearestZoomStep(zoom, -1))}
        title="Thu nhỏ (−)"
        style={{ width:28, height:28, border:"1.5px solid #e2e8f0", borderRadius:6,
          background:"#fff", cursor:"pointer", fontSize:14, fontWeight:700,
          color:"#475569", display:"flex", alignItems:"center", justifyContent:"center",
          transition:"all .12s" }}>−</button>
      <button
        onClick={() => onZoom(100)}
        title="Đặt lại 100%"
        style={{ minWidth:52, height:28, border:"1.5px solid #e2e8f0", borderRadius:6,
          background:"#fff", cursor:"pointer", fontSize:11, fontWeight:700,
          color:"#217346", padding:"0 6px", transition:"all .12s" }}>
        {zoom}%
      </button>
      <button
        onClick={() => onZoom(nearestZoomStep(zoom, 1))}
        title="Phóng to (+)"
        style={{ width:28, height:28, border:"1.5px solid #e2e8f0", borderRadius:6,
          background:"#fff", cursor:"pointer", fontSize:14, fontWeight:700,
          color:"#475569", display:"flex", alignItems:"center", justifyContent:"center",
          transition:"all .12s" }}>+</button>
    </div>
  );
}

function LuckysheetViewer({ rawBuf, fileName, onFallback, triggerPrint }: { rawBuf: ArrayBuffer; fileName: string; onFallback?: () => void; triggerPrint?: number }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sentRef = useRef(false);
  const rawBufRef = useRef<ArrayBuffer | null>(null);
  const fallbackCalledRef = useRef(false);
  const [zoom, setZoom] = useState(100);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { rawBufRef.current = rawBuf ?? null; }, [rawBuf]);

  function sendBuffer() {
    const iframe = iframeRef.current;
    const buf = rawBufRef.current ?? rawBuf;
    if (!iframe?.contentWindow || sentRef.current || !buf) return;
    const copy = buf.slice(0);
    iframe.contentWindow.postMessage({ type: "LUCKY_LOAD", buffer: copy, fileName }, "*", [copy]);
    sentRef.current = true;
  }

  function sendZoom(z: number) {
    iframeRef.current?.contentWindow?.postMessage({ type: "LUCKY_ZOOM", ratio: z / 100 }, "*");
  }

  useEffect(() => {
    sentRef.current = false;
    fallbackCalledRef.current = false;
    setLoaded(false);
    setZoom(100);
  }, [rawBuf]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "LUCKY_READY") sendBuffer();
      if (e.data?.type === "LUCKY_LOADED") setLoaded(true);

      if (e.data?.type === "LUCKY_CDN_FAIL" && !fallbackCalledRef.current) {
        fallbackCalledRef.current = true;
        onFallback?.();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [rawBuf, onFallback]);

  const handleZoom = (z: number) => {
    setZoom(z);
    sendZoom(z);
  };

  useEffect(() => {
    if (!triggerPrint) return;
    iframeRef.current?.contentWindow?.print();
  }, [triggerPrint]);

  return (
    <div style={{ flex:1, overflow:"hidden", position:"relative", display:"flex", flexDirection:"column" }}>
      {/* Luckysheet zoom bar */}
      {loaded && (
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 14px",
          background:"#f8fafc", borderBottom:"1px solid #e2e8f0", flexShrink:0 }}>
          <span style={{ fontSize:11, color:"#94a3b8", fontWeight:600 }}>Thu phóng</span>
          <ZoomBar zoom={zoom} onZoom={handleZoom} />
          <span style={{ fontSize:11, color:"#94a3b8", marginLeft:4 }}>· Ctrl+scroll trong sheet</span>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src="/luckysheet-viewer.html"
        style={{ flex:1, border:"none", display:"block", width:"100%", height:"100%" }}
        onLoad={sendBuffer}
      />
    </div>
  );
}

function XlsxViewer({ wb, fileName, rawBuf }: { wb: XLSX.WorkBook; fileName: string; rawBuf: ArrayBuffer }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [query, setQuery] = useState("");
  const [hlCount, setHlCount] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"luckysheet" | "table" | "xspread">("luckysheet");
  const [tableZoom, setTableZoom] = useState(100);
  const [printTick, setPrintTick] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sheetName = wb.SheetNames[activeIdx] ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const range = ws?.["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
  const rowCount = range ? range.e.r - range.s.r + 1 : 0;
  const colCount = range ? range.e.c - range.s.c + 1 : 0;

  const tableHtml = useMemo(() => buildSheetHtml(ws), [ws]);
  const srcdoc = useMemo(() => buildSrcdoc(tableHtml, query), [tableHtml, query]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "xlsxHighlightCount") setHlCount(e.data.count);
      if (e.data?.type === "TABLE_ZOOM_CHANGE") setTableZoom(Math.round(e.data.ratio * 100));
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => { setHlCount(null); }, [query, activeIdx]);

  useEffect(() => {
    if (viewMode === "table") {
      iframeRef.current?.contentWindow?.postMessage({ type: "TABLE_ZOOM", ratio: tableZoom / 100 }, "*");
    }
  }, [tableZoom, viewMode]);

  const VIEW_MODES = [
    { key: "luckysheet" as const, label: "📊 Luckysheet", title: "Luckysheet — giống Excel nhất, hỗ trợ format đầy đủ" },
    { key: "table" as const, label: "📋 Bảng", title: "Bảng HTML (SheetJS)" },
    { key: "xspread" as const, label: "✨ x-spreadsheet", title: "Canvas x-spreadsheet (định dạng tốt hơn bảng)" },
  ];

  // Compact mode-switcher injected into ExcelGridViewer's own toolbar
  const modeSwitcher = (
    <div style={{ display:"flex", alignItems:"center", background:"#f1f5f9",
      border:"1.5px solid #e2e8f0", borderRadius:8, padding:2, gap:2, flexShrink:0 }}>
      {VIEW_MODES.map(({ key, label, title }) => {
        const active = viewMode === key;
        return (
          <button key={key} onClick={() => setViewMode(key)} title={title}
            style={{ padding:"3px 9px", borderRadius:6, border:"none", cursor:"pointer",
              fontSize:11, fontWeight:700, transition:"all .15s",
              background: active ? "#fff" : "transparent",
              color: active ? "#217346" : "#64748b",
              boxShadow: active ? "0 1px 4px rgba(0,0,0,0.10)" : "none",
              whiteSpace:"nowrap" }}>
            {label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", background:"#fff" }}>

      {/* Outer toolbar — only for non-luckysheet modes; ExcelGridViewer has its own toolbar */}
      {viewMode !== "luckysheet" && (
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 14px",
          background:"#f8fafc", borderBottom:"1px solid #e2e8f0", flexShrink:0 }}>

          {/* Search */}
          <div style={{ display:"flex", alignItems:"center", gap:7, background:"#fff",
            border:"1.5px solid #e2e8f0", borderRadius:8, padding:"5px 10px",
            flex:1, maxWidth:320, transition:"border-color .15s" }}>
            <span style={{ fontSize:13, color:"#94a3b8", flexShrink:0 }}>🔍</span>
            <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setHlCount(null); }}
              placeholder="Tìm trong sheet..."
              style={{ flex:1, border:"none", outline:"none", fontSize:13,
                color:"#1e293b", background:"transparent", minWidth:0 }} />
            {query.trim()
              ? <button onClick={() => { setQuery(""); setHlCount(null); inputRef.current?.focus(); }}
                  style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8",
                    fontSize:13, padding:0, lineHeight:1, flexShrink:0 }}>✕</button>
              : null}
          </div>

          {query.trim() && hlCount !== null && (
            <div style={{ fontSize:12, fontWeight:700, padding:"4px 10px", borderRadius:20,
              background: hlCount > 0 ? "#dcfce7" : "#fee2e2",
              color: hlCount > 0 ? "#15803d" : "#dc2626",
              border: `1px solid ${hlCount > 0 ? "#86efac" : "#fca5a5"}`,
              whiteSpace:"nowrap", flexShrink:0 }}>
              {hlCount > 0 ? `${hlCount} kết quả` : "Không tìm thấy"}
            </div>
          )}

          <div style={{ flex:1 }} />

          {viewMode === "table" && <ZoomBar zoom={tableZoom} onZoom={setTableZoom} />}
          {viewMode === "table" && <div style={{ width:1, height:20, background:"#e2e8f0", flexShrink:0 }} />}

          {/* View mode toggle */}
          {modeSwitcher}

          {/* Stats */}
          <div style={{ display:"flex", gap:8, flexShrink:0 }}>
            <span style={{ fontSize:12, color:"#64748b", background:"#f1f5f9",
              padding:"3px 9px", borderRadius:6, border:"1px solid #e2e8f0",
              fontWeight:600, whiteSpace:"nowrap" }}>
              {rowCount.toLocaleString()} hàng × {colCount} cột
            </span>
            <span style={{ fontSize:12, color:"#64748b", background:"#f1f5f9",
              padding:"3px 9px", borderRadius:6, border:"1px solid #e2e8f0",
              fontWeight:600, whiteSpace:"nowrap" }}>
              {wb.SheetNames.length} sheet
            </span>
          </div>

          <div style={{ width:1, height:20, background:"#e2e8f0", flexShrink:0 }} />
          <button
            onClick={() => {
              if (viewMode === "table") {
                iframeRef.current?.contentWindow?.postMessage({ type: "TABLE_PRINT" }, "*");
              } else {
                setPrintTick(t => t + 1);
              }
            }}
            title="In sheet này (Ctrl+P)"
            style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 10px",
              border:"1.5px solid #e2e8f0", borderRadius:8, background:"#fff",
              cursor:"pointer", fontSize:12, fontWeight:600, color:"#475569",
              whiteSpace:"nowrap", flexShrink:0, transition:"all .12s" }}>
            🖨️ In
          </button>
        </div>
      )}

      {/* Content */}
      {viewMode === "luckysheet" ? (
        <div style={{ flex: 1, overflow: "hidden", position: "relative", display: "flex", flexDirection: "column" }}>
          <ExcelGridViewer
            data={rawBuf}
            fileName={fileName}
            modeControl={modeSwitcher}
            onFatalError={() => setViewMode("table")}
          />
        </div>
      ) : viewMode === "xspread" ? (
        <XSpreadViewer wb={wb} triggerPrint={printTick} />
      ) : (
        <>
          {/* Grid */}
          <div style={{ flex:1, overflow:"hidden", position:"relative" }}>
            <iframe
              ref={iframeRef}
              srcDoc={srcdoc}
              sandbox="allow-scripts"
              style={{ width:"100%", height:"100%", border:"none", display:"block" }}
            />
          </div>

          {/* Sheet tabs — bottom (like Excel) */}
          {wb.SheetNames.length > 1 && (
            <div style={{ display:"flex", alignItems:"center", gap:0, padding:"0 12px",
              background:"#f1f5f9", borderTop:"1.5px solid #e2e8f0",
              flexShrink:0, overflowX:"auto", minHeight:36 }}>
              <span style={{ fontSize:11, color:"#94a3b8", fontWeight:600,
                marginRight:10, whiteSpace:"nowrap", flexShrink:0 }}>SHEETS:</span>
              {wb.SheetNames.map((name, i) => {
                const active = i === activeIdx;
                return (
                  <button key={i} onClick={() => { setActiveIdx(i); setQuery(""); }}
                    style={{ padding:"5px 14px", fontSize:12, cursor:"pointer",
                      border:"none", borderTop: active ? "2.5px solid #217346" : "2.5px solid transparent",
                      borderRight:"1px solid #e2e8f0",
                      background: active ? "#fff" : "transparent",
                      fontWeight: active ? 700 : 500,
                      color: active ? "#217346" : "#64748b",
                      whiteSpace:"nowrap", transition:"all .15s",
                      boxShadow: active ? "0 -2px 8px rgba(33,115,70,0.08)" : "none" }}>
                    📊 {name}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DocxViewer({ blocks }: { blocks: any[] }) {
  return (
    <div style={{ flex:1, overflow:"auto", background:"#f5f5f0", padding:"24px 0" }}>
      <article style={{ maxWidth:820, margin:"0 auto", background:"#fff",
        boxShadow:"0 2px 20px rgba(0,0,0,0.12)", borderRadius:4, padding:"40px 56px",
        minHeight:400, fontFamily:"Georgia, 'Times New Roman', serif",
        fontSize:14.5, lineHeight:1.7, color:"#111" }}>
        {blocks.length === 0 ? (
          <p style={{ color:"#94a3b8", textAlign:"center" }}>Tài liệu trống.</p>
        ) : blocks.map((block: any, i: number) => {
          if (block.type === "table") {
            return (
              <div key={i} style={{ overflowX:"auto", margin:"16px 0" }}>
                <table style={{ borderCollapse:"collapse", width:"100%", fontSize:13 }}>
                  <tbody>
                    {block.rows.map((row: any, ri: number) => (
                      <tr key={ri}>
                        {row.map((cell: any, ci: number) => (
                          <td key={ci} colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                            style={{ border:"1px solid #94a3b8", padding:"6px 10px", verticalAlign:"top" }}>
                            {cell.paragraphs.map((p: any, pi: number) => (
                              <div key={pi} style={{ margin:"2px 0" }}>
                                {p.runs.map((run: any, ri2: number) => (
                                  <span key={ri2} style={{
                                    fontWeight: run.style?.bold ? 700 : undefined,
                                    fontStyle: run.style?.italic ? "italic" : undefined,
                                    textDecoration: run.style?.underline ? "underline" : undefined,
                                    color: run.style?.color || undefined
                                  }}>{run.text}</span>
                                ))}
                              </div>
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
          const level = Number(block.headingLevel);
          const Tag = level === 1 ? "h1" : level === 2 ? "h2" : level === 3 ? "h3" : "p";
          const headingStyle = level ? {
            fontFamily:"'Segoe UI', Arial, sans-serif", fontWeight:800, color:"#0f172a",
            margin:"20px 0 8px", lineHeight:1.3,
            fontSize: level === 1 ? 22 : level === 2 ? 18 : 15
          } : { margin:"4px 0" };
          return (
            <Tag key={i} style={headingStyle as any}>
              {block.runs.map((run: any, ri: number) => (
                <span key={ri} style={{
                  fontWeight: run.style?.bold ? 700 : undefined,
                  fontStyle: run.style?.italic ? "italic" : undefined,
                  textDecoration: run.style?.underline ? "underline" : undefined,
                  color: run.style?.color || undefined
                }}>{run.text}</span>
              ))}
            </Tag>
          );
        })}
      </article>
    </div>
  );
}

export default function OfficeFileViewer({ url, fileName, onClose, fileObj }: Props) {
  const kind = detectKind(fileName);
  const ext = getExt(fileName).toUpperCase();

  const rootRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFsChange);

    // Ẩn topnav + sidebar khi viewer mở — đảm bảo modal phủ toàn màn hình
    const styleEl = document.createElement("style");
    styleEl.id = "office-viewer-hide-chrome";
    styleEl.textContent = `
      body.office-viewer-open .topbar,
      body.office-viewer-open .side-rail,
      body.office-viewer-open .sidebar-backdrop {
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(styleEl);
    document.body.classList.add("office-viewer-open");

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.body.classList.remove("office-viewer-open");
      document.getElementById("office-viewer-hide-chrome")?.remove();
    };
  }, [onClose]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      rootRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null);
  const [rawBuf, setRawBuf] = useState<ArrayBuffer | null>(null);
  const [docxData, setDocxData] = useState<{ blocks: any[] } | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!fileObj || (kind !== "pdf" && kind !== "image")) return;
    const objUrl = URL.createObjectURL(fileObj);
    setBlobUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [fileObj, kind]);

  const load = useCallback(async () => {
    setStatus("loading");
    setErrMsg("");
    try {
      if (kind === "pdf" || kind === "image") {
        setStatus("ok");
        return;
      }
      let buf: ArrayBuffer;
      if (fileObj) {
        buf = await fileObj.arrayBuffer();
      } else {
        const resp = await fetch(url || "", { credentials:"same-origin" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${url}`);
        buf = await resp.arrayBuffer();
      }

      if (kind === "xlsx") {
        setRawBuf(buf);
        const workbook = XLSX.read(buf, {
          type:"array", cellStyles:true, cellDates:true, cellNF:true, dense:false,
        });
        setWb(workbook);
      } else if (kind === "docx") {
        const result = await createClientDocxPreview({
          arrayBuffer: buf,
          document: { fileName, originalName: fileName } as any
        });
        if (!result.supported) throw new Error(result.reason || "Không thể đọc file Word");
        setDocxData({ blocks: result.blocks || [] });
      }
      setStatus("ok");
    } catch (e: any) {
      setErrMsg(e?.message || "Không tải được file.");
      setStatus("error");
    }
  }, [url, fileName, kind, fileObj]);

  useEffect(() => { load(); }, [load]);

  const isExcel = kind === "xlsx";
  const isWord  = kind === "docx";
  const isPdf   = kind === "pdf";
  const isImage = kind === "image";

  const accentColor = isExcel ? "#217346" : isWord ? "#2b5797" : isPdf ? "#dc2626" : isImage ? "#7c3aed" : "#64748b";
  const accentLight = isExcel ? "#dcfce7"  : isWord ? "#dbeafe"  : isPdf ? "#fee2e2" : isImage ? "#ede9fe" : "#f1f5f9";
  const iconLabel   = isExcel ? "📗" : isWord ? "📘" : isPdf ? "📕" : isImage ? "🖼️" : "📄";
  const typeLabel   = isExcel ? "Excel" : isWord ? "Word" : isPdf ? "PDF" : isImage ? "Ảnh" : ext;

  const resolvedUrl = blobUrl || url || "";

  return createPortal(
    <div ref={rootRef} style={{ position:"fixed", inset:0, zIndex:9200,
      background:"rgba(15,23,42,0.82)", display:"flex", flexDirection:"column",
      backdropFilter:"blur(4px)" }}>

      {/* ── Header bar ── */}
      <div style={{ flexShrink:0, background:"#fff", borderBottom:`3px solid ${accentColor}`,
        display:"flex", alignItems:"center", padding:"0 16px", gap:12, minHeight:52,
        boxShadow:"0 2px 12px rgba(0,0,0,0.12)" }}>

        {/* File type badge */}
        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          <div style={{ width:34, height:34, borderRadius:8,
            background:accentLight, border:`1.5px solid ${accentColor}40`,
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>
            {iconLabel}
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:accentColor,
              letterSpacing:".06em", lineHeight:1 }}>{typeLabel}</div>
            <div style={{ fontSize:12, color:"#475569", fontWeight:600,
              lineHeight:1.2, marginTop:1 }}>Xem trước tài liệu</div>
          </div>
        </div>

        {/* File name */}
        <div style={{ flex:1, minWidth:0, padding:"0 8px" }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#0f172a",
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {fileName}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display:"flex", gap:8, alignItems:"center", flexShrink:0 }}>
          {/* Fullscreen toggle */}
          <button onClick={toggleFullscreen} title={isFullscreen ? "Thu nhỏ lại" : "Toàn màn hình trình duyệt"}
            style={{ display:"flex", alignItems:"center", justifyContent:"center",
              width:38, height:38, borderRadius:8, cursor:"pointer",
              background: isFullscreen ? "#dbeafe" : "#f1f5f9",
              border: isFullscreen ? "1.5px solid #93c5fd" : "1.5px solid #e2e8f0",
              fontSize:18, color: isFullscreen ? "#1d4ed8" : "#475569", flexShrink:0,
              transition:"all .15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = isFullscreen ? "#bfdbfe" : "#e2e8f0"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = isFullscreen ? "#dbeafe" : "#f1f5f9"; }}>
            {isFullscreen ? "🗗" : "⛶"}
          </button>

          {kind !== "unsupported" && resolvedUrl && (
            <a href={resolvedUrl} download={fileName} target="_blank" rel="noopener noreferrer"
              style={{ display:"flex", alignItems:"center", gap:5,
                padding:"7px 14px", borderRadius:8, textDecoration:"none",
                background:accentLight, border:`1.5px solid ${accentColor}40`,
                fontSize:13, color:accentColor, fontWeight:700, whiteSpace:"nowrap",
                transition:"all .15s" }}>
              ↓ Tải xuống
            </a>
          )}
          {kind !== "unsupported" && resolvedUrl && !fileObj && (
            <a href={resolvedUrl} target="_blank" rel="noopener noreferrer"
              style={{ display:"flex", alignItems:"center", gap:5,
                padding:"7px 14px", borderRadius:8, textDecoration:"none",
                background:"#f8fafc", border:"1.5px solid #e2e8f0",
                fontSize:13, color:"#475569", fontWeight:700, whiteSpace:"nowrap" }}>
              🔗 Tab mới
            </a>
          )}
          <button onClick={onClose} title="Đóng (Esc)"
            style={{ display:"flex", alignItems:"center", justifyContent:"center",
              width:40, height:40, borderRadius:"50%", cursor:"pointer",
              background:"#dc2626", border:"none",
              fontSize:20, fontWeight:900, color:"#fff", flexShrink:0,
              boxShadow:"0 2px 8px rgba(220,38,38,0.4)",
              transition:"background .15s, transform .1s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#b91c1c"; (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#dc2626"; (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}>
            ✕
          </button>
        </div>
      </div>

      {/* ── Content area ── */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column",
        background:"#fff", margin:"0", borderRadius:0 }}>

        {status === "loading" && (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
            flexDirection:"column", gap:16 }}>
            <div style={{ width:48, height:48, borderRadius:12,
              background:accentLight, border:`2px solid ${accentColor}40`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:24 }}>
              {iconLabel}
            </div>
            <div style={{ fontSize:14, fontWeight:700, color:"#475569" }}>
              Đang tải file {typeLabel}...
            </div>
            <div style={{ display:"flex", gap:6 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:8, height:8, borderRadius:"50%",
                  background:accentColor, opacity:0.3,
                  animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite` }} />
              ))}
            </div>
            <style>{`@keyframes pulse{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}`}</style>
          </div>
        )}

        {status === "error" && (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
            flexDirection:"column", gap:14 }}>
            <div style={{ fontSize:40 }}>⚠️</div>
            <div style={{ fontSize:16, fontWeight:700, color:"#dc2626" }}>Không thể xem trước</div>
            <div style={{ fontSize:13, color:"#64748b", maxWidth:420, textAlign:"center",
              padding:"0 24px", lineHeight:1.6 }}>{errMsg}</div>
            <div style={{ display:"flex", gap:10, marginTop:4 }}>
              <button onClick={load}
                style={{ padding:"9px 22px", borderRadius:8, cursor:"pointer",
                  background:"#1e40af", border:"none", fontSize:13, fontWeight:700, color:"#fff" }}>
                🔄 Thử lại
              </button>
              {resolvedUrl && !fileObj && (
                <a href={resolvedUrl} target="_blank" rel="noopener noreferrer"
                  style={{ padding:"9px 22px", borderRadius:8, textDecoration:"none",
                    background:"#f1f5f9", border:"1.5px solid #e2e8f0",
                    fontSize:13, fontWeight:700, color:"#475569" }}>
                  ↗ Mở tab mới
                </a>
              )}
            </div>
          </div>
        )}

        {status === "ok" && kind === "unsupported" && (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
            flexDirection:"column", gap:12 }}>
            <div style={{ fontSize:40 }}>📄</div>
            <div style={{ fontSize:15, fontWeight:700, color:"#475569" }}>
              Định dạng .{getExt(fileName)} chưa hỗ trợ xem trực tiếp
            </div>
            {resolvedUrl && (
              <a href={resolvedUrl} target="_blank" rel="noopener noreferrer"
                style={{ padding:"9px 22px", borderRadius:8, textDecoration:"none",
                  background:"#1e40af", fontSize:13, fontWeight:700, color:"#fff" }}>
                ↗ Mở tab mới để xem
              </a>
            )}
          </div>
        )}

        {status === "ok" && kind === "xlsx" && wb && rawBuf && (
          <XlsxViewer wb={wb} fileName={fileName} rawBuf={rawBuf} />
        )}

        {status === "ok" && kind === "docx" && docxData && (
          <DocxViewer blocks={docxData.blocks} />
        )}

        {status === "ok" && kind === "pdf" && resolvedUrl && (
          <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
            <PdfJsViewer url={resolvedUrl} file={fileObj} style={{ flex:1, height:"100%" }} />
          </div>
        )}

        {status === "ok" && kind === "pdf" && !resolvedUrl && (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
            flexDirection:"column", gap:12 }}>
            <div style={{ fontSize:14, color:"#64748b" }}>Đang chuẩn bị xem PDF...</div>
          </div>
        )}

        {status === "ok" && kind === "image" && resolvedUrl && (
          <div style={{ flex:1, overflow:"auto", display:"flex", alignItems:"center",
            justifyContent:"center", background:"#f8fafc", padding:16 }}>
            <img src={resolvedUrl} alt={fileName}
              style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain",
                borderRadius:8, boxShadow:"0 4px 20px rgba(0,0,0,0.15)" }} />
          </div>
        )}

        {status === "ok" && kind === "image" && !resolvedUrl && (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
            flexDirection:"column", gap:12 }}>
            <div style={{ fontSize:14, color:"#64748b" }}>Đang chuẩn bị xem ảnh...</div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
