import type { ImagesBySheet, SheetImage } from "./extractImages";

// EMU → px (96 DPI): 914400 EMU/inch, 96 px/inch → 9525 EMU/px
const EMU_PER_PX = 9525;

function pxFromEmu(value: number | undefined): number {
  return (value || 0) / EMU_PER_PX;
}

function buildEdges(
  sizes: Record<string, number> | undefined,
  hidden: Record<string, unknown> | undefined,
  defaultPx: number,
  upTo: number,
): number[] {
  // Match LuckyExcel/Luckysheet exactly: edge[i] is the right/bottom edge
  // of row/column i and includes the 1px gridline added by the engine.
  const edge = new Array<number>(upTo + 1);
  let total = 0;
  for (let i = 0; i <= upTo; i++) {
    const key = String(i);
    const s = sizes?.[key];
    const gap = hidden && key in hidden ? 0 : typeof s === "number" && s >= 0 ? s : defaultPx;
    total += Math.round(gap + 1);
    edge[i] = total;
  }
  return edge;
}

function cellStart(edges: number[], index: number): number {
  return index <= 0 ? 0 : edges[index - 1] ?? 0;
}

function genId(): string {
  return (
    "img_" +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36).slice(-4)
  );
}

/**
 * Convert extracted image anchors into Luckysheet's native `images` object and
 * attach to each sheet of the Luckysheet exportJson, IN PLACE.
 *
 * Why native injection vs DOM overlay:
 *   - Luckysheet handles zoom / scroll / freeze / print natively
 *   - One source of truth → no duplicate rendering
 *   - Pixel coordinates use the SAME columnlen/rowlen the grid renders with
 */
export function injectImagesIntoLuckysheet(
  sheets: any[],
  imagesBySheet: ImagesBySheet,
): void {
  if (!Array.isArray(sheets) || !imagesBySheet) return;

  const imagesByNormalizedName = new Map(
    Object.entries(imagesBySheet).map(([key, value]) => [key.normalize("NFC"), value]),
  );

  for (const sheet of sheets) {
    const name: string | undefined = sheet?.name;
    if (!name) continue;

    // Always remove LuckyExcel's partial native image extraction first. If our
    // extractor cannot map a sheet, leaving the old objects causes duplicate or
    // zero-sized images after Luckysheet's own imagePositionCaculation pass.
    sheet.images = {};

    const list: SheetImage[] | undefined =
      imagesBySheet[name] || imagesByNormalizedName.get(name.normalize("NFC"));
    if (!list || list.length === 0) continue;

    const config = sheet.config || (sheet.config = {});
    const colLen: Record<string, number> = config.columnlen || {};
    const rowLen: Record<string, number> = config.rowlen || {};
    const colHidden: Record<string, unknown> = config.colhidden || {};
    const rowHidden: Record<string, unknown> = config.rowhidden || {};
    const defaultColWidth = Number(sheet.defaultColWidth) || 73;
    const defaultRowHeight = Number(sheet.defaultRowHeight) || 19;

    let maxCol = 0;
    let maxRow = 0;
    for (const img of list) {
      maxCol = Math.max(maxCol, img.toCol ?? img.fromCol, img.fromCol);
      maxRow = Math.max(maxRow, img.toRow ?? img.fromRow, img.fromRow);
    }

    const colEdges = buildEdges(colLen, colHidden, defaultColWidth, maxCol + 1);
    const rowEdges = buildEdges(rowLen, rowHidden, defaultRowHeight, maxRow + 1);

    // Replace LuckyExcel's own image objects. LuckyExcel already extracts images
    // but leaves them at 0x0 until its later calculation pass; adding ours on top
    // causes duplicate/stacked images in Luckysheet.
    const out: Record<string, any> = {};
    for (const img of list) {
      // For normal pictures, the xdr:from/xdr:to anchor matches the sheet grid.
      // For pictures inside xdr:grpSp, from/to describes the whole group, not the
      // actual image inside it; use the resolved a:xfrm rectangle instead.
      const useResolvedXfrm = Boolean(img.grouped && img.xfrm);
      const left = useResolvedXfrm
        ? pxFromEmu(img.xfrm?.x)
        : img.anchorType === "absoluteAnchor"
          ? pxFromEmu(img.pos?.x)
          : cellStart(colEdges, img.fromCol) + pxFromEmu(img.fromColOff);
      const top = useResolvedXfrm
        ? pxFromEmu(img.xfrm?.y)
        : img.anchorType === "absoluteAnchor"
          ? pxFromEmu(img.pos?.y)
          : cellStart(rowEdges, img.fromRow) + pxFromEmu(img.fromRowOff);

      let width: number;
      let height: number;
      if (useResolvedXfrm && img.xfrm) {
        width = pxFromEmu(img.xfrm.cx);
        height = pxFromEmu(img.xfrm.cy);
      } else if (img.toCol != null && img.toRow != null) {
        const right = cellStart(colEdges, img.toCol) + pxFromEmu(img.toColOff);
        const bottom = cellStart(rowEdges, img.toRow) + pxFromEmu(img.toRowOff);
        width = Math.max(8, right - left);
        height = Math.max(8, bottom - top);
      } else if (img.ext) {
        width = pxFromEmu(img.ext.cx);
        height = pxFromEmu(img.ext.cy);
      } else {
        width = 100;
        height = 100;
      }

      // Always use type "3" (absolute — don't move/size with cells). Types "1"
      // and "2" make Luckysheet recompute left/top/width/height from
      // fromCol/toCol on the FIRST mouse interaction with the image, which
      // visibly snaps the picture to a different position right after the
      // user clicks it. Since we already computed the correct pixel rectangle
      // from the XLSX anchor (and resolved group transforms), pin it.
      const type = "3";

      const id = genId();
      out[id] = {
        border: { color: "#000", radius: 0, style: "solid", width: 0 },
        crop: { offsetLeft: 0, offsetTop: 0, width, height },
        default: { left, top, width, height },
        fixedLeft: 0,
        fixedTop: 0,
        fromCol: img.fromCol,
        fromColOff: pxFromEmu(img.fromColOff),
        fromRow: img.fromRow,
        fromRowOff: pxFromEmu(img.fromRowOff),
        isFixedPos: false,
        originHeight: height,
        originWidth: width,
        src: img.src,
        toCol: img.toCol,
        toColOff: pxFromEmu(img.toColOff),
        toRow: img.toRow,
        toRowOff: pxFromEmu(img.toRowOff),
        type,
      };
    }
    sheet.images = out;
  }
}
