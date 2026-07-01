import { parseXlsxEntriesToPreview } from "../../shared/xlsxPreviewCore.js";
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
  return { ...preview, source: "browser" };
};
