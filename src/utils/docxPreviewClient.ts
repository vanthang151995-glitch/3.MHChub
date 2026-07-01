import { decodeXml } from "../../shared/xlsxPreviewCore.js";
import type { DocumentRecord } from "../services/api";

const textDecoder = new TextDecoder("utf-8");

type ZipTextEntry = {
  compressed: Uint8Array;
  fileName: string;
  method: number;
};
type PreviewInput = {
  arrayBuffer: ArrayBuffer | ArrayBufferView;
  document?: DocumentRecord | null;
};
type XmlAttrs = Record<string, string>;
type DocxRunStyle = {
  bold?: boolean;
  color?: string;
  italic?: boolean;
  underline?: boolean;
};
type DocxRun = {
  style: DocxRunStyle;
  text: string;
};
type DocxParagraphBlock = {
  headingLevel: string;
  runs: DocxRun[];
  styleId: string;
  text: string;
  type: "paragraph";
};
type DocxTableBlock = {
  rows: Array<Array<{ colSpan: number; paragraphs: DocxParagraphBlock[] }>>;
  type: "table";
};
type DocxBlock = DocxParagraphBlock | DocxTableBlock;

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

const parseAttrs = (value = ""): XmlAttrs => {
  const attrs: XmlAttrs = {};
  for (const match of String(value).matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
};

const inflateRaw = async (compressed: Uint8Array): Promise<Uint8Array> => {
  if (!("DecompressionStream" in globalThis)) {
    throw new Error("Browser DOCX decompression is not available");
  }

  const stream = new Blob([toArrayBuffer(compressed)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const readZipTextEntries = async (arrayBuffer: ArrayBuffer | ArrayBufferView): Promise<Map<string, string>> => {
  const bytes = toBytes(arrayBuffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;

  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (readUInt32(view, offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("Invalid DOCX file");

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
  await Promise.all(
    entries
      .filter((entry) => entry.fileName.endsWith(".xml") || entry.fileName.endsWith(".rels"))
      .map(async (entry) => {
        let data;
        if (entry.method === 0) data = entry.compressed;
        else if (entry.method === 8) data = await inflateRaw(entry.compressed);
        else throw new Error(`Unsupported DOCX compression method ${entry.method}`);
        texts.set(entry.fileName, textDecoder.decode(data));
      })
  );

  return texts;
};

const blockMatches = (xml = "", tagName: string): RegExpMatchArray[] => [...xml.matchAll(new RegExp(`<w:${tagName}\\b[\\s\\S]*?<\\/w:${tagName}>`, "g"))];

const paragraphStyle = (paragraphXml = ""): string => {
  const style = paragraphXml.match(/<w:pStyle\b([^>]*)\/?>/)?.[1] || "";
  return parseAttrs(style)["w:val"] || "";
};

const runStyle = (runXml = ""): DocxRunStyle => {
  const colorAttrs = parseAttrs(runXml.match(/<w:color\b([^>]*)\/?>/)?.[1] || "");
  const color = colorAttrs["w:val"] && colorAttrs["w:val"] !== "auto" ? `#${colorAttrs["w:val"].toLowerCase()}` : "";
  return {
    bold: /<w:b\b/i.test(runXml),
    italic: /<w:i\b/i.test(runXml),
    underline: /<w:u\b/i.test(runXml),
    color
  };
};

const paragraphText = (paragraphXml = ""): string =>
  [...paragraphXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)]
    .map((match) => {
      if (match[0].startsWith("<w:tab")) return "\t";
      if (match[0].startsWith("<w:br")) return "\n";
      return decodeXml(match[1] || "");
    })
    .join("");

const parseRuns = (paragraphXml = ""): DocxRun[] => {
  const runs = blockMatches(paragraphXml, "r").map((match) => {
    const runXml = match[0];
    const text = paragraphText(runXml);
    return { text, style: runStyle(runXml) };
  });
  return runs.length ? runs.filter((run) => run.text !== "") : [{ text: paragraphText(paragraphXml), style: {} }];
};

const parseParagraph = (paragraphXml = ""): DocxParagraphBlock => {
  const styleId = paragraphStyle(paragraphXml);
  const text = paragraphText(paragraphXml);
  return {
    type: "paragraph",
    styleId,
    headingLevel: styleId.match(/Heading(\d+)/i)?.[1] || "",
    text,
    runs: parseRuns(paragraphXml)
  };
};

const parseTable = (tableXml = ""): DocxTableBlock => ({
  type: "table",
  rows: blockMatches(tableXml, "tr").map((rowMatch) =>
    blockMatches(rowMatch[0], "tc").map((cellMatch) => {
      const cellXml = cellMatch[0];
      const gridSpanAttrs = parseAttrs(cellXml.match(/<w:gridSpan\b([^>]*)\/?>/)?.[1] || "");
      return {
        colSpan: Number(gridSpanAttrs["w:val"]) || 1,
        paragraphs: blockMatches(cellXml, "p").map((paragraph) => parseParagraph(paragraph[0])).filter((item) => item.text)
      };
    })
  )
});

const hasRenderableDocxBlock = (block: DocxBlock): boolean => block.type === "table" || ("text" in block && Boolean(block.text));

const parseBodyBlocks = (documentXml = ""): DocxBlock[] => {
  const body = documentXml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/)?.[1] || documentXml;
  return [...body.matchAll(/<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g)]
    .map((match) => (match[1] === "tbl" ? parseTable(match[0]) : parseParagraph(match[0])))
    .filter(hasRenderableDocxBlock);
};

export const createClientDocxPreview = async ({ arrayBuffer, document }: PreviewInput) => {
  const name = String(document?.fileName || document?.originalName || "").toLowerCase();
  if (!name.endsWith(".docx")) {
    return {
      document,
      kind: "unsupported",
      supported: false,
      reason: "Only .docx preview is supported"
    };
  }

  const entries = await readZipTextEntries(arrayBuffer);
  const documentXml = entries.get("word/document.xml") || "";
  if (!documentXml) throw new Error("DOCX document body not found");

  return {
    document,
    kind: "docx",
    supported: true,
    blocks: parseBodyBlocks(documentXml)
  };
};
