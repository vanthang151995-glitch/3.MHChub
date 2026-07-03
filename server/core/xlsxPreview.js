import fs from "fs";
import path from "path";
import zlib from "zlib";
import { parseXlsxEntriesToPreview } from "../../shared/xlsxPreviewCore.js";

const readZipTextEntries = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("Invalid XLSX zip: missing central directory");

  const entries = new Map();
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const fileNameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localHeaderOffset = buffer.readUInt32LE(pointer + 42);
    const fileName = buffer.toString("utf8", pointer + 46, pointer + 46 + fileNameLength);

    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Invalid XLSX zip: bad local header for ${fileName}`);
    }

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    if (fileName.endsWith(".xml") || fileName.endsWith(".rels")) {
      if (method === 0) entries.set(fileName, compressed.toString("utf8"));
      else if (method === 8) entries.set(fileName, zlib.inflateRawSync(compressed).toString("utf8"));
      else throw new Error(`Unsupported XLSX compression method ${method} for ${fileName}`);
    }

    pointer += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
};

export const createXlsxPreview = ({ filePath, document }) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".xlsx") {
    return {
      document,
      supported: false,
      reason: "Only .xlsx preview is supported"
    };
  }

  return parseXlsxEntriesToPreview({
    entries: readZipTextEntries(filePath),
    document
  });
};
