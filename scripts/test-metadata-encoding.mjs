import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mojibakeScore } from "../server/core/textEncoding.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const args = new Set(process.argv.slice(2));
const requireDist = args.has("--require-dist");

const fail = (message, evidence = {}) => {
  console.error(JSON.stringify({ ok: false, message, evidence }, null, 2));
  process.exit(1);
};

const relativeFile = (filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/");

const decodeHtml = (value) =>
  String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const parseAttributes = (tag) => {
  const attributes = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[3]);
  }
  return attributes;
};

const collectSchemaTypes = (jsonLdDocuments) => {
  const graph = jsonLdDocuments.flatMap((document) =>
    Array.isArray(document["@graph"]) ? document["@graph"] : [document]
  );

  return [
    ...new Set(
      graph
        .flatMap((entry) => (Array.isArray(entry?.["@type"]) ? entry["@type"] : [entry?.["@type"]]))
        .filter(Boolean)
    )
  ];
};

const requiredPhrases = [
  ["title", "C\u1ed5ng ti\u1ec7n \u00edch"],
  ["title", "An to\u00e0n 6S"],
  ["description", "c\u1ed5ng ti\u1ec7n \u00edch n\u1ed9i b\u1ed9"],
  ["description", "PLC Gateway Pro"],
  ["description", "An to\u00e0n - 6S"],
  ["ogDescription", "Truy c\u1eadp nhanh"],
  ["twitterDescription", "C\u1ed5ng n\u1ed9i b\u1ed9"],
  ["author", "Nguyen Van Thang - PE1"]
];

const requiredSchemaTypes = ["Organization", "WebSite", "SoftwareApplication", "BreadcrumbList", "FAQPage"];

const validateMetadataFile = ({ label, filePath, required }) => {
  if (!fs.existsSync(filePath)) {
    if (required) {
      fail("Required metadata file is missing", {
        label,
        file: relativeFile(filePath),
        hint: label === "dist" ? "Run npm run build before this check." : undefined
      });
    }
    return null;
  }

  const html = fs.readFileSync(filePath, "utf8");
  const metaTags = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => parseAttributes(match[0]));
  const metaByName = new Map(metaTags.filter((attrs) => attrs.name).map((attrs) => [attrs.name, attrs.content || ""]));
  const metaByProperty = new Map(
    metaTags.filter((attrs) => attrs.property).map((attrs) => [attrs.property, attrs.content || ""])
  );

  const title = decodeHtml((html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").trim());
  const jsonLdTextBlocks = [
    ...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  ].map((match) => match[1].trim());

  if (!jsonLdTextBlocks.length) {
    fail("JSON-LD metadata script is missing", { label, file: relativeFile(filePath) });
  }

  const jsonLdDocuments = jsonLdTextBlocks.map((jsonLdText, index) => {
    try {
      return JSON.parse(jsonLdText);
    } catch (error) {
      fail("JSON-LD metadata is not valid JSON", {
        label,
        file: relativeFile(filePath),
        scriptIndex: index,
        error: error.message
      });
    }
  });

  const schemaTypes = collectSchemaTypes(jsonLdDocuments);
  const fields = {
    title,
    description: metaByName.get("description") || "",
    author: metaByName.get("author") || "",
    ogTitle: metaByProperty.get("og:title") || "",
    ogDescription: metaByProperty.get("og:description") || "",
    twitterTitle: metaByName.get("twitter:title") || "",
    twitterDescription: metaByName.get("twitter:description") || "",
    jsonLd: JSON.stringify(jsonLdDocuments)
  };

  const rawC1ControlPattern = /[\u0080-\u009F]/u;
  const mojibakeHits = Object.entries(fields)
    .map(([name, value]) => ({
      hasC1Control: rawC1ControlPattern.test(value),
      name,
      score: mojibakeScore(value),
      value
    }))
    .filter((hit) => hit.score > 0 || hit.hasC1Control)
    .map(({ hasC1Control, name, score, value }) => ({
      hasC1Control,
      name,
      score,
      value: value.slice(0, 240)
    }));

  if (mojibakeHits.length) {
    fail("Metadata contains mojibake-like text", {
      label,
      file: relativeFile(filePath),
      mojibakeHits
    });
  }

  const missingPhrases = requiredPhrases
    .filter(([field, phrase]) => !fields[field]?.includes(phrase))
    .map(([field, phrase]) => ({ field, phrase, value: fields[field] || "" }));

  if (missingPhrases.length) {
    fail("Metadata is missing required readable Vietnamese phrases", {
      label,
      file: relativeFile(filePath),
      missingPhrases
    });
  }

  const missingSchemaTypes = requiredSchemaTypes.filter((type) => !schemaTypes.includes(type));
  if (missingSchemaTypes.length) {
    fail("Metadata JSON-LD is missing required schema types", {
      label,
      file: relativeFile(filePath),
      missingSchemaTypes,
      schemaTypes
    });
  }

  return {
    label,
    file: relativeFile(filePath),
    checkedFields: Object.keys(fields).filter((key) => key !== "jsonLd"),
    schemaTypes
  };
};

const targets = [
  {
    label: "source",
    filePath: path.join(rootDir, "index.html"),
    required: true
  },
  {
    label: "dist",
    filePath: path.join(rootDir, "dist", "index.html"),
    required: requireDist
  }
];

const results = targets.map(validateMetadataFile).filter(Boolean);

console.log(
  JSON.stringify(
    {
      ok: true,
      checkedFiles: results.map(({ label, file }) => ({ label, file })),
      checkedFields: results[0]?.checkedFields || [],
      schemaTypesByFile: Object.fromEntries(results.map(({ file, schemaTypes }) => [file, schemaTypes]))
    },
    null,
    2
  )
);
