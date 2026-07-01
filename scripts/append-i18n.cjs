const fs = require('fs');

const path = 'src/i18n.ts';
let code = fs.readFileSync(path, 'utf8');

const additions = {
  vi: {
    // Subcategories
    subMISSING_GUARD: "Thiếu che chắn an toàn",
    subBROKEN_MACHINE: "Máy hỏng đang sử dụng",
    subHIGH_PRESSURE: "Áp suất vượt ngưỡng",
    subMISSING_MAINTENANCE: "Thiếu bảo trì định kỳ",
    subEXPOSED_WIRES: "Dây điện hở",
    subEXPIRED_EQUIPMENT: "Thiết bị cũ quá hạn thay",
    
    subPOOR_LIGHTING: "Chiếu sáng không đủ",
    subHIGH_NOISE: "Tiếng ồn vượt ngưỡng",
    subHIGH_TEMPERATURE: "Nhiệt độ cao",
    subEXCESSIVE_DUST: "Bụi vượt ngưỡng",
    subSLIPPERY_FLOOR: "Sàn trơn trượt",
    subBLOCKED_AISLE: "Lối đi bị chặn",
    subPOOR_VENTILATION: "Thông gió kém",
    
    subNO_PPE: "Không đeo PPE",
    subPROCESS_VIOLATION: "Vi phạm quy trình",
    subUNAUTHORIZED_WORK: "Làm việc không được phép",
    subUNTRAINED: "Chưa được đào tạo",
    subUSING_PHONE: "Sử dụng điện thoại khi làm việc",
    subNO_LOTO: "Không khóa thiết bị trước bảo trì",
    
    subEXPIRED_EXTINGUISHER: "Bình PCCC hết hạn",
    subBLOCKED_ESCAPE_ROUTE: "Lối thoát hiểm bị chặn",
    subBROKEN_EXIT_SIGN: "Biển thoát hiểm hỏng",
    subMISSING_EVAC_PLAN: "Thiếu bản đồ thoát hiểm",
    subFIRE_ALARM_FAULT: "Hệ thống báo cháy lỗi",
    subMISSING_FIRE_DRILL: "Thiếu diễn tập PCCC",
    
    subNO_CHEMICAL_LABEL: "Không có nhãn hóa chất",
    subMISSING_SDS: "Thiếu SDS/MSDS",
    subIMPROPER_STORAGE: "Bảo quản sai quy định",
    subNO_CHEMICAL_PPE: "Không có PPE hóa chất",
    subMINOR_LEAK: "Rò rỉ nhỏ chưa xử lý",
    subEXPIRED_CHEMICALS: "Hóa chất hết hạn",
    
    subIMPROPER_LIFTING: "Nâng hàng sai tư thế",
    subUNSUITABLE_CHAIR: "Ghế làm việc không phù hợp",
    subMONITOR_HEIGHT: "Màn hình quá cao/thấp",
    subPROLONGED_STANDING: "Đứng liên tục > 4 giờ",
    subMACHINE_VIBRATION: "Rung động máy kéo dài",
    subREPETITIVE_MOTION: "Thao tác lặp lại liên tục",

    // Standards
    stdQCVN_26_2016: "QCVN 26:2016/BLĐTBXH",
    stdTCVN_5179_2013: "TCVN 5179:2013",
    stdIEC_60204_1: "IEC 60204-1",
    stdQCVN_24_2016: "QCVN 24:2016",
    stdTCVN_3733_2002: "TCVN 3733:2002",
    stdLAW_ATVSLD_2015: "Luật ATVSLĐ 2015",
    stdQCVN_04_2015: "QCVN 04:2015/BLĐTBXH",
    stdQCVN_06_2021: "QCVN 06:2021/BXD",
    stdTCVN_3890_2009: "TCVN 3890:2009",
    stdLAW_PCCC_2001: "Luật PCCC 2001",
    stdQCVN_05_2009: "QCVN 05:2009/BCT",
    stdCIRCULAR_32_2017: "Thông tư 32/2017/TT-BCT",
    stdGHS_CLP: "GHS/CLP",
    stdISO_9241: "ISO 9241",
    stdTCVN_7303_2003: "TCVN 7303:2003"
  },
  en: {
    // Subcategories
    subMISSING_GUARD: "Missing safety guard",
    subBROKEN_MACHINE: "Broken machine in use",
    subHIGH_PRESSURE: "High pressure",
    subMISSING_MAINTENANCE: "Missing regular maintenance",
    subEXPOSED_WIRES: "Exposed electrical wires",
    subEXPIRED_EQUIPMENT: "Expired equipment",
    
    subPOOR_LIGHTING: "Poor lighting",
    subHIGH_NOISE: "Excessive noise",
    subHIGH_TEMPERATURE: "High temperature",
    subEXCESSIVE_DUST: "Excessive dust",
    subSLIPPERY_FLOOR: "Slippery floor",
    subBLOCKED_AISLE: "Blocked aisle",
    subPOOR_VENTILATION: "Poor ventilation",
    
    subNO_PPE: "No PPE worn",
    subPROCESS_VIOLATION: "Process violation",
    subUNAUTHORIZED_WORK: "Unauthorized work",
    subUNTRAINED: "Untrained personnel",
    subUSING_PHONE: "Using phone while working",
    subNO_LOTO: "No LOTO before maintenance",
    
    subEXPIRED_EXTINGUISHER: "Expired fire extinguisher",
    subBLOCKED_ESCAPE_ROUTE: "Blocked escape route",
    subBROKEN_EXIT_SIGN: "Broken exit sign",
    subMISSING_EVAC_PLAN: "Missing evacuation plan",
    subFIRE_ALARM_FAULT: "Fire alarm fault",
    subMISSING_FIRE_DRILL: "Missing fire drill",
    
    subNO_CHEMICAL_LABEL: "No chemical label",
    subMISSING_SDS: "Missing SDS/MSDS",
    subIMPROPER_STORAGE: "Improper storage",
    subNO_CHEMICAL_PPE: "No chemical PPE",
    subMINOR_LEAK: "Minor chemical leak",
    subEXPIRED_CHEMICALS: "Expired chemicals",
    
    subIMPROPER_LIFTING: "Improper lifting posture",
    subUNSUITABLE_CHAIR: "Unsuitable chair",
    subMONITOR_HEIGHT: "Incorrect monitor height",
    subPROLONGED_STANDING: "Prolonged standing > 4h",
    subMACHINE_VIBRATION: "Prolonged machine vibration",
    subREPETITIVE_MOTION: "Repetitive motion",

    // Standards
    stdQCVN_26_2016: "QCVN 26:2016/BLDTBXH",
    stdTCVN_5179_2013: "TCVN 5179:2013",
    stdIEC_60204_1: "IEC 60204-1",
    stdQCVN_24_2016: "QCVN 24:2016",
    stdTCVN_3733_2002: "TCVN 3733:2002",
    stdLAW_ATVSLD_2015: "OSH Law 2015",
    stdQCVN_04_2015: "QCVN 04:2015/BLDTBXH",
    stdQCVN_06_2021: "QCVN 06:2021/BXD",
    stdTCVN_3890_2009: "TCVN 3890:2009",
    stdLAW_PCCC_2001: "Fire Prevention Law 2001",
    stdQCVN_05_2009: "QCVN 05:2009/BCT",
    stdCIRCULAR_32_2017: "Circular 32/2017/TT-BCT",
    stdGHS_CLP: "GHS/CLP",
    stdISO_9241: "ISO 9241",
    stdTCVN_7303_2003: "TCVN 7303:2003"
  },
  ja: {
    // Subcategories
    subMISSING_GUARD: "安全カバーの欠落",
    subBROKEN_MACHINE: "故障した機械の使用",
    subHIGH_PRESSURE: "異常高圧",
    subMISSING_MAINTENANCE: "定期メンテナンス不足",
    subEXPOSED_WIRES: "電線の露出",
    subEXPIRED_EQUIPMENT: "期限切れ機器",
    
    subPOOR_LIGHTING: "照度不足",
    subHIGH_NOISE: "基準値以上の騒音",
    subHIGH_TEMPERATURE: "高温環境",
    subEXCESSIVE_DUST: "過剰な粉塵",
    subSLIPPERY_FLOOR: "滑りやすい床",
    subBLOCKED_AISLE: "通路の閉塞",
    subPOOR_VENTILATION: "換気不良",
    
    subNO_PPE: "PPE未着用",
    subPROCESS_VIOLATION: "手順違反",
    subUNAUTHORIZED_WORK: "無許可作業",
    subUNTRAINED: "未訓練作業者",
    subUSING_PHONE: "作業中の携帯電話使用",
    subNO_LOTO: "保全前のLOTO未実施",
    
    subEXPIRED_EXTINGUISHER: "消火器の期限切れ",
    subBLOCKED_ESCAPE_ROUTE: "避難経路の閉塞",
    subBROKEN_EXIT_SIGN: "誘導灯の故障",
    subMISSING_EVAC_PLAN: "避難計画図の欠落",
    subFIRE_ALARM_FAULT: "火災報知器の故障",
    subMISSING_FIRE_DRILL: "避難訓練の不足",
    
    subNO_CHEMICAL_LABEL: "化学物質ラベルなし",
    subMISSING_SDS: "SDS/MSDSなし",
    subIMPROPER_STORAGE: "不適切な保管",
    subNO_CHEMICAL_PPE: "化学物質用PPEなし",
    subMINOR_LEAK: "未処理の軽微な漏れ",
    subEXPIRED_CHEMICALS: "期限切れ化学物質",
    
    subIMPROPER_LIFTING: "不適切な持ち上げ姿勢",
    subUNSUITABLE_CHAIR: "不適切な作業椅子",
    subMONITOR_HEIGHT: "モニターの高さ不適切",
    subPROLONGED_STANDING: "4時間以上の連続立ち作業",
    subMACHINE_VIBRATION: "長時間の機械振動",
    subREPETITIVE_MOTION: "反復動作",

    // Standards
    stdQCVN_26_2016: "QCVN 26:2016/BLDTBXH",
    stdTCVN_5179_2013: "TCVN 5179:2013",
    stdIEC_60204_1: "IEC 60204-1",
    stdQCVN_24_2016: "QCVN 24:2016",
    stdTCVN_3733_2002: "TCVN 3733:2002",
    stdLAW_ATVSLD_2015: "労働安全衛生法 2015",
    stdQCVN_04_2015: "QCVN 04:2015/BLDTBXH",
    stdQCVN_06_2021: "QCVN 06:2021/BXD",
    stdTCVN_3890_2009: "TCVN 3890:2009",
    stdLAW_PCCC_2001: "消防法 2001",
    stdQCVN_05_2009: "QCVN 05:2009/BCT",
    stdCIRCULAR_32_2017: "通達 32/2017/TT-BCT",
    stdGHS_CLP: "GHS/CLP",
    stdISO_9241: "ISO 9241",
    stdTCVN_7303_2003: "TCVN 7303:2003"
  }
};

const insertInto = (lang, dict) => {
  const str = Object.entries(dict).map(([k, v]) => `    ${k}: "${v}",`).join('\\n');
  const target = `${lang}: {`;
  code = code.replace(target, `${target}\\n${str}`);
};

insertInto('vi', additions.vi);
insertInto('en', additions.en);
insertInto('ja', additions.ja);

fs.writeFileSync(path, code, 'utf8');
console.log('Appended dict keys successfully!');
