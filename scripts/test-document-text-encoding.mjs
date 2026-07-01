import {
  mojibakeScore,
  normalizeDocumentPatch,
  normalizeDocumentTextFields,
  repairMojibakeText
} from "../server/core/textEncoding.js";

const fail = (message, evidence = {}) => {
  console.error(JSON.stringify({ ok: false, message, evidence }, null, 2));
  process.exit(1);
};

const assertEqual = (name, actual, expected) => {
  if (actual !== expected) {
    fail(`Unexpected ${name}`, { actual, expected });
  }
};

const assert = (name, pass, evidence = {}) => {
  if (!pass) fail(name, evidence);
};

const periodKanji = String.fromCodePoint(0x671f);
const corruptedPeriodName = `PE1-22${String.fromCodePoint(0x00e6, 0x009c, 0x009f)}-ED-05 - BC thang 3.2026.pptx`;
const repairedPeriodName = `PE1-22${periodKanji}-ED-05 - BC thang 3.2026.pptx`;

const vietnameseName = "v\u1eadt t\u01b0 d\u1ef1 \u00e1n IoT m\u00e1y u\u1ed1n EBM PY2 (1).xlsx";
const corruptedVietnameseName = Buffer.from(vietnameseName, "utf8").toString("latin1");
const displayName = "Nguy\u1ec5n V\u0103n Th\u1eafng - PE1";

const cases = [
  {
    input: corruptedPeriodName,
    label: "three-byte-cjk-mojibake",
    expected: repairedPeriodName
  },
  {
    input: corruptedVietnameseName,
    label: "vietnamese-file-name-mojibake",
    expected: vietnameseName
  },
  {
    input: displayName,
    label: "clean-vietnamese-name",
    expected: displayName
  }
];

for (const item of cases) {
  const actual = repairMojibakeText(item.input);
  assertEqual(item.label, actual, item.expected);
  assert(`${item.label}-score-contract`, item.input === item.expected || mojibakeScore(item.input) > 0, {
    inputHex: [...item.input].map((char) => char.codePointAt(0).toString(16))
  });
  assert(`${item.label}-repaired-clean`, mojibakeScore(actual) === 0, {
    actual,
    score: mojibakeScore(actual)
  });
}

const normalizedDocument = normalizeDocumentTextFields({
  createdByName: corruptedVietnameseName,
  id: "encoding-regression",
  originalName: corruptedPeriodName,
  title: corruptedVietnameseName,
  updatedByName: displayName
});

assertEqual("normalizeDocumentTextFields.originalName", normalizedDocument.originalName, repairedPeriodName);
assertEqual("normalizeDocumentTextFields.title", normalizedDocument.title, vietnameseName);
assertEqual("normalizeDocumentTextFields.createdByName", normalizedDocument.createdByName, vietnameseName);
assertEqual("normalizeDocumentTextFields.clean-name", normalizedDocument.updatedByName, displayName);

const normalizedPatch = normalizeDocumentPatch({
  originalName: corruptedPeriodName,
  untouched: corruptedPeriodName
});

assertEqual("normalizeDocumentPatch.originalName", normalizedPatch.originalName, repairedPeriodName);
assertEqual("normalizeDocumentPatch.untouched", normalizedPatch.untouched, corruptedPeriodName);

console.log(JSON.stringify({
  ok: true,
  checkedCases: cases.map((item) => item.label),
  normalizedFields: ["originalName", "title", "createdByName", "updatedByName"],
  repairedPeriodName,
  repairedVietnameseName: vietnameseName
}, null, 2));
