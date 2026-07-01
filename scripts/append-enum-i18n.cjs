const fs = require('fs');

const path = 'src/i18n.ts';
let code = fs.readFileSync(path, 'utf8');

const additions = {
  vi: {
    catEQUIPMENT: "Thiết bị / Máy móc",
    catENVIRONMENT: "Môi trường làm việc",
    catHUMAN_BEHAVIOR: "Hành vi con người",
    catFIRE_SAFETY: "PCCC & Thoát hiểm",
    catCHEMICALS: "Hóa chất nguy hiểm",
    catERGONOMICS: "Ergonomic / Tư thế",
    enumOPEN: "Mở",
    enumIN_PROGRESS: "Đang xử lý",
    enumDONE: "Hoàn thành",
    enumOVERDUE: "Quá hạn",
    enumREJECTED: "Từ chối",
    enumCRITICAL: "Cực kỳ nghiêm trọng",
    enumHIGH: "Nghiêm trọng",
    enumMEDIUM: "Trung bình",
    enumLOW: "Thấp",
    enumWAITING: "Chờ duyệt",
    enumAPPROVED: "Đã duyệt"
  },
  en: {
    catEQUIPMENT: "Equipment",
    catENVIRONMENT: "Environment",
    catHUMAN_BEHAVIOR: "Human Behavior",
    catFIRE_SAFETY: "Fire Safety",
    catCHEMICALS: "Chemicals",
    catERGONOMICS: "Ergonomics",
    enumOPEN: "Open",
    enumIN_PROGRESS: "In Progress",
    enumDONE: "Done",
    enumOVERDUE: "Overdue",
    enumREJECTED: "Rejected",
    enumCRITICAL: "Critical",
    enumHIGH: "High",
    enumMEDIUM: "Medium",
    enumLOW: "Low",
    enumWAITING: "Waiting",
    enumAPPROVED: "Approved"
  },
  ja: {
    catEQUIPMENT: "設備・機械",
    catENVIRONMENT: "作業環境",
    catHUMAN_BEHAVIOR: "人的行動",
    catFIRE_SAFETY: "防火・避難",
    catCHEMICALS: "危険化学物質",
    catERGONOMICS: "人間工学・姿勢",
    enumOPEN: "オープン",
    enumIN_PROGRESS: "対応中",
    enumDONE: "完了",
    enumOVERDUE: "期限切れ",
    enumREJECTED: "却下",
    enumCRITICAL: "最重大",
    enumHIGH: "重大",
    enumMEDIUM: "中",
    enumLOW: "低",
    enumWAITING: "承認待ち",
    enumAPPROVED: "承認済み"
  }
};

const insertInto = (lang, dict) => {
  const str = Object.entries(dict).map(([k, v]) => `    ${k}: "${v}",`).join('\n');
  const target = `${lang}: {`;
  code = code.replace(target, `${target}\n${str}`);
};

insertInto('vi', additions.vi);
insertInto('en', additions.en);
insertInto('ja', additions.ja);

fs.writeFileSync(path, code, 'utf8');
console.log('Appended enum dict keys successfully!');
