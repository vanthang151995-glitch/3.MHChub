import { parseXlsxEntriesToPreview } from "../../shared/xlsxPreviewCore.js";
import type { DocumentRecord } from "../services/api";

const textDecoder = new TextDecoder("utf-8");
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

type ZipTextEntry = {
  compressed: Uint8Array;
  fileName: string;
  method: number;
};
type PreviewInput = {
  arrayBuffer: ArrayBuffer | ArrayBufferView;
  document?: DocumentRecord | null;
};

const readUInt16 = (view: DataView, offset: number): number => view.getUint16(offset, true);
const readUInt32 = (view: DataView, offset: number): number => view.getUint32(offset, true);

const toBytes = (arrayBuffer: ArrayBuffer | ArrayBufferView): Uint8Array =>
  arrayBuffer instanceof ArrayBuffer
    ? new Uint8Array(arrayBuffer)
    : new Uint8Array(arrayBuffer.buffer, arrayBuffer.byteOffset, arrayBuffer.byteLength);

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const inflateRaw = async (compressed: Uint8Array): Promise<Uint8Array> => {
  if (!("DecompressionStream" in globalThis)) {
    throw new Error("Browser XLSX decompression is not available");
  }

  const stream = new Blob([toArrayBuffer(compressed)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const readZipEntries = async (arrayBuffer: ArrayBuffer | ArrayBufferView): Promise<{ binaries: Map<string, Uint8Array>; texts: Map<string, string> }> => {
  const bytes = toBytes(arrayBuffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;

  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (readUInt32(view, offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("Invalid XLSX file");

  const totalEntries = readUInt16(view, eocd + 10);
  let pointer = readUInt32(view, eocd + 16);
  const entries: ZipTextEntry[] = [];

  for (let index = 0; index < totalEntries; index += 1) {
    if (readUInt32(view, pointer) !== 0x02014b50) break;
    const method = readUInt16(view, pointer + 10);
    const compressedSize = readUInt32(view, pointer + 20);
    const fileNameLength = readUInt16(view, pointer + 28);
    const extraLength = readUInt16(view, pointer + 30);
    const commentLength = readUInt16(view, pointer + 32);
    const localHeaderOffset = readUInt32(view, pointer + 42);
    const fileName = textDecoder.decode(bytes.subarray(pointer + 46, pointer + 46 + fileNameLength));

    if (readUInt32(view, localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Invalid XLSX local header for ${fileName}`);
    }

    const localNameLength = readUInt16(view, localHeaderOffset + 26);
    const localExtraLength = readUInt16(view, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    entries.push({
      fileName,
      method,
      compressed: bytes.slice(dataStart, dataStart + compressedSize)
    });

    pointer += 46 + fileNameLength + extraLength + commentLength;
  }

  const texts = new Map<string, string>();
  const binaries = new Map<string, Uint8Array>();
  await Promise.all(
    entries.map(async (entry) => {
      let data;
      if (entry.method === 0) data = entry.compressed;
      else if (entry.method === 8) data = await inflateRaw(entry.compressed);
      else throw new Error(`Unsupported XLSX compression method ${entry.method}`);
      binaries.set(entry.fileName, data);
      if (entry.fileName.endsWith(".xml") || entry.fileName.endsWith(".rels")) {
        texts.set(entry.fileName, textDecoder.decode(data));
      }
    })
  );

  return { binaries, texts };
};

const childByLocal = (el: Element | undefined | null, localName: string): Element | undefined => {
  if (!el) return undefined;
  return Array.from(el.children).find((child) => child.localName === localName) as Element | undefined;
};

const firstDescByLocal = (el: Element | undefined | null, localName: string): Element | undefined => {
  if (!el) return undefined;
  return el.getElementsByTagNameNS("*", localName)[0] as Element | undefined;
};

const attrNum = (el: Element | undefined, attr: string): number => Number(el?.getAttribute(attr) || 0);

function normalizePath(basePath: string, rel: string): string {
  if (!rel) return "";
  if (rel.startsWith("/")) return rel.slice(1);
  const baseDir = basePath.replace(/[^/]+$/, "");
  const parts = (baseDir + rel).split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function readXfrm(
  el: Element | undefined,
): { off: { x: number; y: number }; ext: { cx: number; cy: number }; chOff?: { x: number; y: number }; chExt?: { cx: number; cy: number } } | undefined {
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
    chExt: chExt ? { cx: attrNum(chExt, "cx"), cy: attrNum(chExt, "cy") } : undefined
  };
}

function picAbsoluteXfrm(pic: Element, anchor: Element): { rect?: { x: number; y: number; cx: number; cy: number }; grouped: boolean } {
  const picXfrm = readXfrm(childByLocal(pic, "spPr"));
  if (!picXfrm) return { grouped: false };

  let rect = {
    x: picXfrm.off.x,
    y: picXfrm.off.y,
    cx: picXfrm.ext.cx,
    cy: picXfrm.ext.cy
  };

  const groups: Element[] = [];
  let parent = pic.parentElement;
  while (parent && parent !== anchor) {
    if (parent.localName === "grpSp") groups.push(parent);
    parent = parent.parentElement;
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
      cy: rect.cy * sy
    };
  }

  return { rect, grouped: groups.length > 0 };
}

const guessMime = (name: string): string => {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "bmp") return "image/bmp";
  if (ext === "webp") return "image/webp";
  return "image/png";
};

const uint8ToBase64 = (bytes: Uint8Array): string => {
  let s = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    s += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(s);
};

type ExtractedWorkbookImage = {
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

const extractWorkbookImageSheets = (binaries: Map<string, Uint8Array>, texts: Map<string, string>) => {
  const output = new Map<string, ExtractedWorkbookImage[]>();
  const parser = typeof DOMParser !== "undefined" ? new DOMParser() : null;
  if (!parser) return output;

  const workbookXml = texts.get("xl/workbook.xml") || "";
  const workbookRelsXml = texts.get("xl/_rels/workbook.xml.rels") || "";
  if (!workbookXml || !workbookRelsXml) return output;

  const workbook = parser.parseFromString(workbookXml, "application/xml");
  const workbookRels = parser.parseFromString(workbookRelsXml, "application/xml");
  const workbookRelsMap: Record<string, string> = {};
  Array.from(workbookRels.getElementsByTagName("Relationship")).forEach((rel) => {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (id && target) workbookRelsMap[id] = target;
  });

  const sheets = Array.from(workbook.getElementsByTagName("sheet"));
  for (const sheet of sheets) {
    const name = sheet.getAttribute("name") || "";
    const relId =
      sheet.getAttributeNS(REL_NS, "id") ||
      sheet.getAttribute("r:id") ||
      sheet.getAttribute("id") ||
      "";
    if (!name || !relId) {
      continue;
    }

    const sheetTarget = workbookRelsMap[relId];
    if (!sheetTarget) {
      continue;
    }

    const sheetPath = normalizePath("xl/workbook.xml", sheetTarget);
    const sheetRelsPath = sheetPath.replace(/([^/]+)$/, "_rels/$1.rels");
    const sheetRelsXml = texts.get(sheetRelsPath) || "";
    if (!sheetRelsXml) {
      continue;
    }

    const sheetRels = parser.parseFromString(sheetRelsXml, "application/xml");
    let drawingTarget = "";
    Array.from(sheetRels.getElementsByTagName("Relationship")).forEach((rel) => {
      if ((rel.getAttribute("Type") || "").endsWith("/drawing")) {
        drawingTarget = rel.getAttribute("Target") || "";
      }
    });
    if (!drawingTarget) {
      continue;
    }

    const drawingPath = normalizePath(sheetPath, drawingTarget);
    const drawingXml = texts.get(drawingPath) || "";
    if (!drawingXml) {
      continue;
    }

    const drawingRelsPath = drawingPath.replace(/([^/]+)$/, "_rels/$1.rels");
    const drawingRelsXml = texts.get(drawingRelsPath) || "";
    const drawingRels = drawingRelsXml ? parser.parseFromString(drawingRelsXml, "application/xml") : null;
    const drawingRelsMap: Record<string, string> = {};
    drawingRels &&
      Array.from(drawingRels.getElementsByTagName("Relationship")).forEach((rel) => {
        const id = rel.getAttribute("Id");
        const target = rel.getAttribute("Target");
        if (id && target) drawingRelsMap[id] = target;
      });

    const drawing = parser.parseFromString(drawingXml, "application/xml");
    const anchors = Array.from(drawing.documentElement.children);
    const images: ExtractedWorkbookImage[] = [];

    for (const anchor of anchors) {
      const local = anchor.localName;
      if (local !== "twoCellAnchor" && local !== "oneCellAnchor" && local !== "absoluteAnchor") continue;

      const pics = Array.from(anchor.getElementsByTagNameNS("*", "pic"));
      if (!pics.length) continue;

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
        const bytes = binaries.get(mediaPath);
        if (!bytes) continue;

        const src = `data:${guessMime(mediaPath)};base64,${uint8ToBase64(bytes)}`;
        const { rect: xfrm, grouped } = picAbsoluteXfrm(pic, anchor);
        const from = anchor.getElementsByTagNameNS("*", "from")[0];
        const to = anchor.getElementsByTagNameNS("*", "to")[0];
        const posEl = Array.from(anchor.children).find((child) => child.localName === "pos");
        const extEl = Array.from(anchor.children).find((child) => child.localName === "ext");

        let left = 0;
        let top = 0;
        let width = 0;
        let height = 0;

        if (xfrm) {
          left = xfrm.x / 9525;
          top = xfrm.y / 9525;
          width = xfrm.cx / 9525;
          height = xfrm.cy / 9525;
        } else if (local === "absoluteAnchor" && posEl && extEl) {
          left = Number(posEl.getAttribute("x") || 0) / 9525;
          top = Number(posEl.getAttribute("y") || 0) / 9525;
          width = Number(extEl.getAttribute("cx") || 0) / 9525;
          height = Number(extEl.getAttribute("cy") || 0) / 9525;
        } else {
          const fromCol = Number(from?.getElementsByTagNameNS("*", "col")[0]?.textContent || 0);
          const fromRow = Number(from?.getElementsByTagNameNS("*", "row")[0]?.textContent || 0);
          const fromColOff = Number(from?.getElementsByTagNameNS("*", "colOff")[0]?.textContent || 0);
          const fromRowOff = Number(from?.getElementsByTagNameNS("*", "rowOff")[0]?.textContent || 0);
          const toCol = Number(to?.getElementsByTagNameNS("*", "col")[0]?.textContent || fromCol);
          const toRow = Number(to?.getElementsByTagNameNS("*", "row")[0]?.textContent || fromRow);
          const toColOff = Number(to?.getElementsByTagNameNS("*", "colOff")[0]?.textContent || fromColOff);
          const toRowOff = Number(to?.getElementsByTagNameNS("*", "rowOff")[0]?.textContent || fromRowOff);
          // Without grid metrics we cannot convert the cell anchor exactly here;
          // keep the position at least stable by falling back to cell offsets.
          left = fromCol * 92 + fromColOff / 9525;
          top = fromRow * 18.4 + fromRowOff / 9525;
          width = Math.max(1, (toCol - fromCol) * 92 + (toColOff - fromColOff) / 9525);
          height = Math.max(1, (toRow - fromRow) * 18.4 + (toRowOff - fromRowOff) / 9525);
        }

        images.push({
          alt: pic.getElementsByTagNameNS("*", "cNvPr")[0]?.getAttribute("descr") || pic.getElementsByTagNameNS("*", "cNvPr")[0]?.getAttribute("name") || "",
          height,
          left,
          name: pic.getElementsByTagNameNS("*", "cNvPr")[0]?.getAttribute("name") || "",
          src,
          target: mediaPath,
          top,
          width,
          grouped
        });
      }
    }

    output.set(name, images);
  }

  return output;
};

export const createClientXlsxPreview = async ({ arrayBuffer, document }: PreviewInput) => {
  const name = String(document?.fileName || document?.originalName || "").toLowerCase();
  if (!name.endsWith(".xlsx")) {
    return {
      document,
      supported: false,
      reason: "Only .xlsx preview is supported"
    };
  }

  const { binaries, texts } = await readZipEntries(arrayBuffer);
  const preview = parseXlsxEntriesToPreview({
    binaryEntries: binaries,
    entries: texts,
    document
  });
  const imageSheets = extractWorkbookImageSheets(binaries, texts);
  if (Array.isArray(preview.sheets) && imageSheets.size) {
    preview.sheets = preview.sheets.map((sheet) => {
      const correctedImages = (imageSheets.get(String(sheet.name || "").normalize("NFC")) || []).filter((image) => image.grouped);
      if (!correctedImages.length) return sheet;

      const correctedByTarget = new Map(correctedImages.map((image) => [image.target || image.name || "", image]));
      const images = (sheet.images || []).map((image) => {
        const key = image.target || image.name || "";
        const corrected = correctedByTarget.get(key);
        return corrected
          ? {
              ...image,
              alt: corrected.alt || image.alt,
              grouped: corrected.grouped || image.grouped,
              height: corrected.height,
              left: corrected.left,
              name: corrected.name || image.name,
              src: corrected.src,
              target: corrected.target || image.target,
              top: corrected.top,
              width: corrected.width
            }
          : image;
      });
      return { ...sheet, images };
    });
  }
  return { ...preview, source: "browser" };
};
