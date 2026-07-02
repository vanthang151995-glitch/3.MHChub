import JSZip from "jszip";

export type SheetImage = {
  src: string;
  mediaPath: string;
  anchorType: "twoCellAnchor" | "oneCellAnchor" | "absoluteAnchor";
  editAs?: "twoCell" | "oneCell" | "absolute" | string;
  /** Absolute picture rectangle in EMU, read from a:xfrm and resolved through any xdr:grpSp transforms. */
  xfrm?: { x: number; y: number; cx: number; cy: number };
  /** True when the picture is inside a grouped drawing object. */
  grouped?: boolean;
  fromCol: number;
  fromRow: number;
  fromColOff: number; // EMU
  fromRowOff: number; // EMU
  toCol?: number;
  toRow?: number;
  toColOff?: number;
  toRowOff?: number;
  pos?: { x: number; y: number }; // EMU for absoluteAnchor
  ext?: { cx: number; cy: number }; // EMU for oneCellAnchor
};

export type ImagesBySheet = Record<string, SheetImage[]>;

const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function normalizePath(basePath: string, rel: string): string {
  if (!rel) return "";
  if (rel.startsWith("/")) return rel.slice(1);
  const baseDir = basePath.replace(/[^/]+$/, "");
  const parts = (baseDir + rel).split("/");
  const stack: string[] = [];
  for (const p of parts) {
    if (p === "..") stack.pop();
    else if (p && p !== ".") stack.push(p);
  }
  return stack.join("/");
}

function uint8ToBase64(bytes: Uint8Array): string {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
  }
  return btoa(s);
}

function guessMime(name: string): string {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "bmp") return "image/bmp";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

const num = (el: Element | undefined, tag: string): number => {
  if (!el) return 0;
  const node = el.getElementsByTagName(tag)[0] || el.getElementsByTagNameNS("*", tag.replace(/^[^:]+:/, ""))[0];
  return Number(node?.textContent || "0");
};

const childByLocal = (el: Element | undefined | null, localName: string): Element | undefined => {
  if (!el) return undefined;
  return Array.from(el.children).find((c) => c.localName === localName) as Element | undefined;
};

const firstDescByLocal = (el: Element | undefined | null, localName: string): Element | undefined => {
  if (!el) return undefined;
  return el.getElementsByTagNameNS("*", localName)[0] as Element | undefined;
};

const attrNum = (el: Element | undefined, attr: string) => Number(el?.getAttribute(attr) || 0);

function readXfrm(el: Element | undefined):
  | { off: { x: number; y: number }; ext: { cx: number; cy: number }; chOff?: { x: number; y: number }; chExt?: { cx: number; cy: number } }
  | undefined {
  if (!el) return undefined;
  const off = firstDescByLocal(el, "off");
  const ext = firstDescByLocal(el, "ext");
  if (!off || !ext) return undefined;
  const chOff = firstDescByLocal(el, "chOff");
  const chExt = firstDescByLocal(el, "chExt");
  return {
    off: { x: attrNum(off, "x"), y: attrNum(off, "y") },
    ext: { cx: attrNum(ext, "cx"), cy: attrNum(ext, "cy") },
    chOff: chOff ? { x: attrNum(chOff, "x"), y: attrNum(chOff, "y") } : undefined,
    chExt: chExt ? { cx: attrNum(chExt, "cx"), cy: attrNum(chExt, "cy") } : undefined,
  };
}

function picAbsoluteXfrm(pic: Element, anchor: Element): { rect?: SheetImage["xfrm"]; grouped: boolean } {
  const picXfrm = readXfrm(childByLocal(pic, "spPr"));
  if (!picXfrm) return { grouped: false };

  let rect = {
    x: picXfrm.off.x,
    y: picXfrm.off.y,
    cx: picXfrm.ext.cx,
    cy: picXfrm.ext.cy,
  };

  // Excel stores pictures inside xdr:grpSp in the group's child coordinate
  // system. The anchor from/to belongs to the whole group, so using it for the
  // picture makes the image oversized/shifted. Resolve every group transform
  // from inner → outer to get the real sheet-space rectangle.
  const groups: Element[] = [];
  let p = pic.parentElement;
  while (p && p !== anchor) {
    if (p.localName === "grpSp") groups.push(p);
    p = p.parentElement;
  }

  for (const group of groups) {
    const g = readXfrm(childByLocal(group, "grpSpPr"));
    if (!g?.chOff || !g.chExt?.cx || !g.chExt?.cy) continue;
    const sx = g.ext.cx / g.chExt.cx;
    const sy = g.ext.cy / g.chExt.cy;
    rect = {
      x: g.off.x + (rect.x - g.chOff.x) * sx,
      y: g.off.y + (rect.y - g.chOff.y) * sy,
      cx: rect.cx * sx,
      cy: rect.cy * sy,
    };
  }

  return { rect, grouped: groups.length > 0 };
}

export async function extractXlsxImages(buf: ArrayBuffer): Promise<ImagesBySheet> {
  const result: ImagesBySheet = {};
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    return result;
  }
  const parser = new DOMParser();

  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  const wbRelsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!wbXml || !wbRelsXml) return result;

  const wb = parser.parseFromString(wbXml, "application/xml");
  const wbRels = parser.parseFromString(wbRelsXml, "application/xml");

  const wbRelsMap: Record<string, string> = {};
  Array.from(wbRels.getElementsByTagName("Relationship")).forEach((r) => {
    const id = r.getAttribute("Id");
    const target = r.getAttribute("Target");
    if (id && target) wbRelsMap[id] = target;
  });

  const sheetEls = Array.from(wb.getElementsByTagName("sheet"));
  for (const s of sheetEls) {
    const name = s.getAttribute("name") || "";
    const rId =
      s.getAttributeNS(REL_NS, "id") ||
      s.getAttribute("r:id") ||
      s.getAttribute("id");
    if (!name || !rId) continue;
    const target = wbRelsMap[rId];
    if (!target) {
      result[name] = [];
      continue;
    }
    const sheetPath = normalizePath("xl/workbook.xml", target);
    const sheetRelsPath = sheetPath.replace(/([^/]+)$/, "_rels/$1.rels");
    const sheetRelsXml = await zip.file(sheetRelsPath)?.async("string");
    if (!sheetRelsXml) {
      result[name] = [];
      continue;
    }
    const sheetRels = parser.parseFromString(sheetRelsXml, "application/xml");
    let drawingTarget: string | null = null;
    Array.from(sheetRels.getElementsByTagName("Relationship")).forEach((r) => {
      if ((r.getAttribute("Type") || "").endsWith("/drawing")) {
        drawingTarget = r.getAttribute("Target");
      }
    });
    if (!drawingTarget) {
      result[name] = [];
      continue;
    }
    const drawingPath = normalizePath(sheetPath, drawingTarget);
    const drawingXml = await zip.file(drawingPath)?.async("string");
    if (!drawingXml) {
      result[name] = [];
      continue;
    }
    const drawingRelsPath = drawingPath.replace(/([^/]+)$/, "_rels/$1.rels");
    const drawingRelsXml = await zip.file(drawingRelsPath)?.async("string");
    const drawingRels = drawingRelsXml
      ? parser.parseFromString(drawingRelsXml, "application/xml")
      : null;
    const drawingRelsMap: Record<string, string> = {};
    drawingRels &&
      Array.from(drawingRels.getElementsByTagName("Relationship")).forEach((r) => {
        const id = r.getAttribute("Id");
        const tgt = r.getAttribute("Target");
        if (id && tgt) drawingRelsMap[id] = tgt;
      });

    const drw = parser.parseFromString(drawingXml, "application/xml");
    const root = drw.documentElement;
    const anchors = Array.from(root.children);
    const images: SheetImage[] = [];

    for (const a of anchors) {
      const local = a.localName;
      if (local !== "twoCellAnchor" && local !== "oneCellAnchor" && local !== "absoluteAnchor") continue;
      const pics = Array.from(a.getElementsByTagNameNS("*", "pic"));
      if (pics.length === 0) continue;

      for (const pic of pics) {
        const blip = pic.getElementsByTagNameNS("*", "blip")[0];
        const embed =
          blip?.getAttributeNS(REL_NS, "embed") ||
          blip?.getAttribute("r:embed") ||
          "";
        if (!embed) continue;
        const mediaTarget = drawingRelsMap[embed];
        if (!mediaTarget) continue;
        const mediaPath = normalizePath(drawingPath, mediaTarget);
        const file = zip.file(mediaPath);
        if (!file) continue;
        const bytes = await file.async("uint8array");
        const src = `data:${guessMime(mediaPath)};base64,${uint8ToBase64(bytes)}`;

        const from = a.getElementsByTagNameNS("*", "from")[0];
        const to = a.getElementsByTagNameNS("*", "to")[0];
        const posEl = Array.from(a.children).find((c) => c.localName === "pos");
        const extEl = Array.from(a.children).find((c) => c.localName === "ext");
        const { rect: xfrm, grouped } = picAbsoluteXfrm(pic, a);

        images.push({
          src,
          mediaPath,
          anchorType: local as SheetImage["anchorType"],
          editAs: a.getAttribute("editAs") || (local === "twoCellAnchor" ? "twoCell" : local === "oneCellAnchor" ? "oneCell" : "absolute"),
          xfrm,
          grouped,
          fromCol: num(from, "col"),
          fromRow: num(from, "row"),
          fromColOff: num(from, "colOff"),
          fromRowOff: num(from, "rowOff"),
          toCol: to ? num(to, "col") : undefined,
          toRow: to ? num(to, "row") : undefined,
          toColOff: to ? num(to, "colOff") : undefined,
          toRowOff: to ? num(to, "rowOff") : undefined,
          pos: posEl
            ? {
                x: Number(posEl.getAttribute("x") || 0),
                y: Number(posEl.getAttribute("y") || 0),
              }
            : undefined,
          ext: extEl
            ? {
                cx: Number(extEl.getAttribute("cx") || 0),
                cy: Number(extEl.getAttribute("cy") || 0),
              }
            : undefined,
        });
      }
    }
    result[name.normalize("NFC")] = images;
  }
  return result;
}
