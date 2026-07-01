const defaultConfig = {
  utilityLinks: [
    {
      id: "iot-py2",
      type: "iot",
      title: { vi: "IoT Mani PY2", en: "IoT Mani PY2", ja: "IoT Mani PY2" },
      description: {
        vi: "Link IoT Mani PY2",
        en: "IoT Mani PY2 link",
        ja: "IoT Mani PY2 link"
      },
      url: "http://172.25.10.222:5000/",
      health: "good"
    },
    {
      id: "iot-py1",
      type: "iot",
      title: { vi: "IoT Mani PY1", en: "IoT Mani PY1", ja: "IoT Mani PY1" },
      description: {
        vi: "Link IoT Mani PY1",
        en: "IoT Mani PY1 link",
        ja: "IoT Mani PY1 link"
      },
      url: "http://172.20.1.55:3000/",
      health: "good"
    },
    {
      id: "gateway",
      type: "gateway",
      title: { vi: "PLC Gateway Pro", en: "PLC Gateway Pro", ja: "PLC Gateway Pro" },
      description: {
        vi: "Link PLC Gateway Pro",
        en: "PLC Gateway Pro link",
        ja: "PLC Gateway Pro link"
      },
      url: "http://172.25.20.208:3300/",
      health: "good"
    },
    {
      id: "notes",
      type: "notes",
      title: { vi: "Nhật ký ghi chép công việc", en: "Work log", ja: "作業記録" },
      description: {
        vi: "Link nhật ký ghi chép công việc",
        en: "Work log link",
        ja: "作業記録 link"
      },
      url: "http://172.20.1.55:3001/",
      health: "good"
    },
    {
      id: "safety",
      type: "safety",
      title: { vi: "An toàn - 6S", en: "Safety - 6S", ja: "安全 - 6S" },
      description: {
        vi: "Tổng quan công ty, bộ phận, checklist, hành động và tài liệu.",
        en: "Company overview, departments, checklists, actions, and documents.",
        ja: "全社概要、部門、チェック、アクション、資料を管理します。"
      },
      url: "/safety-6s",
      health: "alert"
    }
  ],
  departments: [
    {
      id: "production",
      name: { vi: "Sản xuất", en: "Production", ja: "生産" },
      owner: "Line Leader",
      score: 86,
      riskLevel: "watch",
      openActions: 7,
      trainingRate: 92,
      risks: {
        vi: ["Kẹp tay tại jig", "Trượt ngã do dầu", "Không khóa nguồn khi bảo trì"],
        en: ["Hand pinch at jig", "Slip risk from oil", "Missing lockout during maintenance"],
        ja: ["治具での挟まれ", "油による転倒", "保全時の電源遮断不足"]
      },
      checklist: {
        vi: ["Lối đi thông thoáng", "PPE đúng khu vực", "Tooling để đúng vị trí", "Tem cảnh báo rõ ràng"],
        en: ["Clear aisles", "Correct PPE by area", "Tooling in assigned positions", "Warning labels are clear"],
        ja: ["通路確保", "エリア別PPE遵守", "工具の定位置管理", "警告表示が明確"]
      }
    },
    {
      id: "warehouse",
      name: { vi: "Kho", en: "Warehouse", ja: "倉庫" },
      owner: "Warehouse Supervisor",
      score: 81,
      riskLevel: "watch",
      openActions: 5,
      trainingRate: 88,
      risks: {
        vi: ["Xe nâng giao cắt người đi bộ", "Xếp hàng quá cao", "Pallet hư hỏng"],
        en: ["Forklift and pedestrian crossing", "Over-stacked goods", "Damaged pallets"],
        ja: ["フォークリフトと歩行者の交差", "積み過ぎ", "破損パレット"]
      },
      checklist: {
        vi: ["Vạch phân luồng rõ", "Không che thiết bị PCCC", "FIFO đúng nhãn", "Pin xe nâng an toàn"],
        en: ["Clear traffic markings", "Fire equipment is not blocked", "FIFO labels are correct", "Forklift battery is safe"],
        ja: ["動線表示が明確", "消防設備を塞がない", "FIFOラベル遵守", "フォークリフト電池安全"]
      }
    },
    {
      id: "engineering",
      name: { vi: "Kỹ thuật", en: "Engineering", ja: "技術" },
      owner: "Maintenance Lead",
      score: 90,
      riskLevel: "good",
      openActions: 3,
      trainingRate: 96,
      risks: {
        vi: ["Điện áp cao", "Làm việc trên cao", "Máy chạy thử sau sửa chữa"],
        en: ["High voltage", "Working at height", "Machine trial after repair"],
        ja: ["高電圧", "高所作業", "修理後の試運転"]
      },
      checklist: {
        vi: ["LOTO trước bảo trì", "Biên bản nghiệm thu", "Dụng cụ cách điện", "Khu vực sửa chữa có rào chắn"],
        en: ["LOTO before maintenance", "Acceptance record", "Insulated tools", "Repair area barricaded"],
        ja: ["保全前LOTO", "検収記録", "絶縁工具", "修理エリア区画"]
      }
    },
    {
      id: "quality",
      name: { vi: "QA/QC", en: "QA/QC", ja: "品質" },
      owner: "Quality Supervisor",
      score: 93,
      riskLevel: "good",
      openActions: 2,
      trainingRate: 94,
      risks: {
        vi: ["Hóa chất kiểm tra", "Vật sắc cạnh", "Tư thế thao tác lặp lại"],
        en: ["Inspection chemicals", "Sharp edges", "Repetitive posture"],
        ja: ["検査薬品", "鋭利部品", "反復姿勢"]
      },
      checklist: {
        vi: ["MSDS sẵn sàng", "Mẫu NG tách riêng", "Kính bảo hộ", "Bàn kiểm tra sạch"],
        en: ["MSDS available", "NG samples separated", "Safety glasses", "Clean inspection desk"],
        ja: ["SDS掲示", "NGサンプル分離", "保護メガネ", "検査台清掃"]
      }
    },
    {
      id: "office",
      name: { vi: "Văn phòng", en: "Office", ja: "事務所" },
      owner: "Admin",
      score: 89,
      riskLevel: "good",
      openActions: 4,
      trainingRate: 91,
      risks: {
        vi: ["Dây điện dưới sàn", "Lối thoát hiểm bị che", "Tư thế làm việc"],
        en: ["Cables on floor", "Blocked emergency exit", "Working posture"],
        ja: ["床配線", "非常口の遮蔽", "作業姿勢"]
      },
      checklist: {
        vi: ["Bàn làm việc gọn", "Tài liệu lưu đúng chỗ", "Lối thoát hiểm rõ", "Thiết bị điện an toàn"],
        en: ["Clean desks", "Documents stored properly", "Emergency exits clear", "Electrical equipment safe"],
        ja: ["机上整理", "資料定位置", "非常口確保", "電気設備安全"]
      }
    },
    {
      id: "ehs",
      name: { vi: "EHS/6S", en: "EHS/6S", ja: "EHS/6S" },
      owner: "EHS Officer",
      score: 95,
      riskLevel: "good",
      openActions: 1,
      trainingRate: 98,
      risks: {
        vi: ["Theo dõi hành động quá hạn", "Cập nhật tiêu chuẩn", "Đào tạo định kỳ"],
        en: ["Overdue action tracking", "Standard updates", "Periodic training"],
        ja: ["期限超過対応", "標準更新", "定期教育"]
      },
      checklist: {
        vi: ["Audit theo lịch", "Biên bản cải tiến", "Tài liệu đúng phiên bản", "Thông báo an toàn cập nhật"],
        en: ["Scheduled audits", "Improvement records", "Documents at correct revision", "Safety notice updated"],
        ja: ["監査計画遵守", "改善記録", "資料版管理", "安全掲示更新"]
      }
    }
  ],
  safetyBulletins: [
  {
    "id": "bulletin-safety-meeting-2026-05",
    "date": "2026-05-30",
    "tone": "watch",
    "title": {
      "vi": "Họp AT T05/2026 (V2): nội dung trọng tâm đầy đủ",
      "en": "May 2026 safety meeting (V2): complete key content",
      "ja": "2026年5月安全会議（V2）：重点内容"
    },
    "summary": {
      "vi": "Tổng hợp đầy đủ 38 ý từ biên bản V2: y tế, TNLĐ/cận nguy, chỉ đạo sau tai nạn, 6S, đào tạo, PCCC, đánh giá rủi ro, hóa chất - môi trường, Medline và yêu cầu phổ biến tới toàn bộ CBCNV.",
      "en": "Complete 38-point summary from the V2 minutes: health, labor accidents/near-misses, post-accident instructions, 6S, training, fire safety, risk assessment, chemical/environment, Medline, and employee communication.",
      "ja": "V2議事録から38項目を要約：健康、労災・ヒヤリ、事故後指示、6S、教育、防火、リスク評価、化学物質・環境、Medline、全従業員への周知。"
    },
    "points": {
      "vi": [
        "Y tế PY: 50 trường hợp thăm khám; nhóm bệnh hô hấp 32%, thần kinh 22%, tiêu hóa 12%; trong tháng MT có 1 ca chấn thương ngón 5 tay trái.",
        "Y tế PY2: 72 trường hợp thăm khám; nhóm triệu chứng bất thường 20,8%, thần kinh 13,8%, tiêu hóa 13,8%; cần theo dõi xu hướng bất thường.",
        "Khám bổ sung BNN: 39 trường hợp khám sức khỏe/khám phát hiện bệnh nghề nghiệp bổ sung ngày 05/05/2026 tại Phòng khám đa khoa Ykao; phòng khám bố trí xe đưa đón.",
        "Báo cáo y tế: khối ED đề nghị đồng bộ báo cáo giữa 2 nhà máy, bổ sung chi tiết, biểu đồ so sánh theo tháng và phân tích nguyên nhân y tế bất thường; bác sĩ phản hồi việc phân tích nguyên nhân/giải pháp có thể phức tạp do nhiều nguyên nhân và điều kiện hạn chế; TBAT Tuấn yêu cầu EHS xem xét bổ sung để báo cáo rõ hơn.",
        "Cận nguy GA: tháng 4 không ghi nhận tai nạn nhỏ; ngày 03/04 BAT đã yêu cầu các bộ phận rà soát tủ điện tương tự để phòng cháy nổ, nhập kết quả vào link quy định và EHS xác nhận toàn công ty trong tháng 5.",
        "TNLĐ MT 29/04: khoảng 14h20 tại MHC-PY nhà máy 1, nhân viên Phạm Hồng Hạnh bị kẹp tay khi đóng nắp hố nước mưa; gãy đốt ngón út trái, xuất viện 06/05 và đi làm lại 07/05.",
        "TNLĐ MS1/PY2 05/05: khoảng 06h10 tại máy Namashi/nguyên công tạo rãnh, nhân viên Nguyễn Văn Long bị chấn động não, vết thương trán và ngón I tay phải; khâu 6 mũi trán, 4 mũi tay, đi làm lại 13/05.",
        "Chỉ đạo GĐ Nakamura: các bộ phận thống kê công việc không thường xuyên và nhận diện mối nguy có thể phát sinh; EHS đã gửi file ngày 18/05, hạn cập nhật dự kiến 29/06.",
        "Yêu cầu EHS: tổng hợp công việc không thường xuyên đã nhận diện mối nguy, lập kế hoạch xác nhận lại, nhanh chóng xây dựng biểu mẫu TBM và cơ chế vận dụng để áp dụng toàn công ty từ 06/2026.",
        "Văn hóa an toàn: GA/EHS đã đào tạo chuyên đề 'Thúc đẩy chuyển đổi văn hóa an toàn tại nơi làm việc' ngày 16, 19, 20/05 cho TBP trở lên; TBP phải lan tỏa nội dung tới nhân viên.",
        "Theo dõi an toàn trọng điểm: EHS xác nhận đối tượng, lập kế hoạch/bảng biểu, quản lý tiến trình; bổ sung mục đánh giá đặc biệt vào kế hoạch đánh giá risk.",
        "Ý kiến PGĐ Hùng: vụ MT thiếu cảnh báo và giới hạn phạm vi làm việc; các bộ phận cập nhật đủ danh sách công việc không thường xuyên, QA rà soát quy trình có đầy đủ hướng dẫn an toàn, EHS phối hợp xây dựng quy trình/tiêu chuẩn an toàn rõ ràng.",
        "Ý kiến OK2: cống thoát nước mưa nằm trên trục đường công nhân qua lại nên cần biện pháp phòng ngừa tái diễn; TBAT sẽ báo cáo xin chỉ đạo cấp trên.",
        "Chia sẻ MANI/MYL: MANI 21/04 kim chưa sử dụng đâm vào ngón tay khi tiêu hủy kim, vết thương khoảng 1 mm; MYL 10/04 va/rách nhẹ ngón trỏ khi tháo vít ê-tô và 27/04 kẹt ngón trỏ tại máy đánh bóng do chỉnh vật liệu bằng tay khi chưa dừng máy.",
        "Cận nguy nghiêm trọng MANI: ngày 27/03 tại Hanaoka, bình chia axit phosphoric 1:1 để lưu sau trao đổi với NCC bị hư/vỡ sau khoảng 4 tháng do nhận nhầm vật liệu nhôm là SUS; xử lý khăn lau dính axit và bình chứa, chuẩn hóa lưu trữ, niêm yết tiêu chuẩn tiêu hủy và đào tạo hóa chất chính khi phân công.",
        "Giao thông/phương tiện: tháng 4 không xảy ra tai nạn giao thông và không phát hiện vi phạm phương tiện đi lại.",
        "Cải tiến an toàn - 6S: xác nhận đề xuất cải tiến tại PY ngày 27/05 và PY2 ngày 29/05; kiểm tra hộp kỹ thuật, yêu cầu các bộ phận khẩn trương cập nhật số lượng trên server.",
        "Đào tạo ATVSLĐ: EHS & GA tiếp tục chương trình đào tạo chuyên sâu về an toàn VSLĐ với chủ đề chuyển đổi văn hóa an toàn; đối tượng là trưởng bộ phận trở lên, EHS và OS.",
        "Văn bản EHS: đến 05/2026 đã hoàn thiện/ban hành 7 quy trình QC-04-01, EHS-QT-06, EHS-QT-08, EHS-QT-09, EHS-QT-10, EHS-QT-11, EHS-QT-12; 2 dự thảo đang pháp chế kiểm tra gồm xử lý tình huống khẩn cấp và EHS-QT-15 quan trắc môi trường lao động; EHS đang xây dựng quy trình tuần tra AT/PCCC/6S và TBM, dự kiến áp dụng 06/2026.",
        "PCCC: ngày 21/05 NCC đã kết nối báo cháy PY/PY2 tới hệ thống dữ liệu PCCC/cứu nạn qua Internet/3G/4G/5G; mỗi nhà máy có 10 số nhận tin qua điện thoại/app, EHS hướng dẫn cài đặt và soạn quy định xử lý tin báo cháy.",
        "Đánh giá rủi ro ATVSLĐ: các bộ phận nhận diện mối nguy và đánh giá rủi ro cho mọi hoạt động trong 04-06/2026; tháng 7-8 BAT/EHS cùng ông Murai và ông Ishida xác nhận kết quả đánh giá.",
        "Lưu ý đánh giá risk: không gộp nhiều rủi ro cùng một hàng/kết quả; PPE chỉ thay đổi mức độ hậu quả, không thay đổi tần suất; TBP phải đôn đốc, EHS kiểm tra tiến độ và hỗ trợ tránh sai hệ thống.",
        "An toàn - 6S khác: EHS tiếp tục kiểm tra an toàn, 6S tại khu sản xuất và nhà vệ sinh; nhắc trực tiếp lỗi xử lý ngay; sản xuất duy trì kiểm tra an toàn, 6S hàng ngày.",
        "Hóa chất: kiểm tra an toàn hóa chất định kỳ tháng 5 tại 2 nhà máy; khu san chiết dùng chung có SA đăng ký, OS niêm yết danh sách người thực hiện, hóa chất san chiết và SDS tại vị trí bồn.",
        "Trang bị hóa chất: OS kiểm tra từng nguyên công sử dụng hóa chất; một số bộ phận đã mua/cấp phát phin lọc, tạp dề phù hợp, các bộ phận chưa hoàn thành theo dõi trong biểu tổng hợp.",
        "Bồn rửa mắt/đào tạo hóa chất: OS hoàn thiện hiển thị, bổ sung nước RO, hướng dẫn sử dụng và bàn giao bồn hiện có trong 05/2026; tháng 6 bổ sung bồn cho khu vực dùng hóa chất/dầu khi PC giao hàng, lập danh sách đào tạo và tổ chức mỗi nhà máy 3 lớp trong tháng 6-7.",
        "Môi trường nước thải: kết quả phân tích nước thải tháng 04/2026 đạt QCVN 40:2011/BTNMT cột B và QCVN 14:2008/BTNMT; test nhanh đến 25/04 có thời điểm TSS vượt chuẩn, OS phối hợp MT và nhà thầu xác nhận nguyên nhân/đối sách.",
        "Quan trắc môi trường: tháng 5/2026 thực hiện quan trắc định kỳ cho nhà máy PY2 theo luật môi trường và giấy phép môi trường; OS báo cáo kết quả trong họp an toàn tháng 6.",
        "Quy trình OS: tháng 5 OS soạn OS-QT-01 quản lý nước thải dự kiến ban hành 08/2026 và OS-QT-02 quản lý/đảm bảo an toàn hóa chất dự kiến hoàn thành cuối 06/2026.",
        "Đào tạo hóa chất/môi trường OS: trong tháng 5/2026 không thực hiện đào tạo, huấn luyện hóa chất và môi trường.",
        "Medline 12/2025: EHS & SP đã hoàn thành 2 mục; MT còn 2 mục đang khắc phục gồm hộp điện cạnh thang máy CR3 thiếu bao che/hướng dẫn tiếng Việt và thiếu báo cáo kiểm định an toàn tòa nhà sau 10 năm sử dụng.",
        "Báo cáo AT-PCCC-6S: file ghi 2 dòng kết quả tháng 03/2026 đều nhãn PY, gồm 6/6/0 và 7/7/0; giữ nguyên số liệu theo báo cáo và cần xác nhận lại nhãn nhà máy cho dòng 7/7.",
        "Tiểu ban ATVSLĐ: QAD, PED, DD, ED báo cáo kết quả kiểm tra an toàn, 6S; ED nêu vụ sét đánh tủ điện khu xử lý nước thải EBM cần biện pháp phòng ngừa tái diễn.",
        "Chỉ đạo về sét đánh: PGĐ Hùng xác định 2 vụ EBM và tủ trung tâm báo cháy là sét lan truyền; MT cần lập báo cáo chi tiết và biện pháp phòng ngừa chung cho thiết bị tương tự.",
        "Thông báo bấm móng tay: GA sửa nội quy, cấm cắt/bấm móng tay trong giờ làm việc hoặc khu vực làm việc; chỉ thực hiện ngoài giờ tại nơi chỉ định, thu gom móng đúng quy định; nếu cắt trong nhà vệ sinh phải rửa tay và dùng con lăn dính.",
        "Dây đeo thẻ: với nguyên công trực tiếp vận hành máy, khuyến cáo không dùng dây thẻ để tránh vướng vào cơ cấu chuyển động; nếu cần dùng thì đeo theo cách GA đã hướng dẫn.",
        "Lịch họp tiếp theo: họp an toàn tháng 06/2026 vào ngày 23/06/2026 tại nhà máy PY, PY2 tham gia online qua Teams.",
        "Bắt buộc phổ biến: nội dung họp phải được từng bộ phận thông báo tới toàn thể CBCNV; EHS cuối tháng kiểm tra việc triển khai và đưa vào checklist kiểm tra an toàn."
      ],
      "en": [
        "PY health: 50 medical visits; respiratory 32%, nervous system 22%, digestive 12%; MT had one left little-finger injury case.",
        "PY2 health: 72 medical visits; abnormal symptoms 20.8%, nervous system 13.8%, digestive 13.8%; abnormal trends must be monitored.",
        "Additional health/occupational disease checks: 39 people on 2026-05-05 at Ykao clinic, with transport arranged by the clinic.",
        "Medical reporting: ED requested aligned reports between PY/PY2, more detail, monthly comparison charts, and cause analysis for abnormal health issues; Safety Chair Tuan asked EHS to review additions.",
        "GA near-miss: no minor accidents in April; on Apr 3 BAT requested departments to review similar electrical cabinets, enter results in the required link, and EHS to confirm company-wide in May.",
        "MT accident on Apr 29: around 14:20 at MHC-PY factory 1, Pham Hong Hanh's hand was pinched while closing a rainwater pit cover; left little finger fracture, discharged May 6, returned May 7.",
        "MS1/PY2 accident on May 5: around 06:10 at Namashi/grooving process, Nguyen Van Long had concussion and wounds on forehead/right thumb; 6 stitches forehead, 4 stitches hand, returned May 13.",
        "Director Nakamura instruction: departments must list non-routine jobs and identify possible hazards; EHS sent the file on May 18 with target completion on Jun 29.",
        "EHS requirement: consolidate non-routine work hazards, plan rechecks, and quickly build TBM form/operation mechanism for company-wide use from Jun 2026.",
        "Safety culture: GA/EHS trained the topic on May 16, 19, 20 for section leaders and above; leaders must cascade content to employees.",
        "Key safety follow-up: EHS identifies targets, prepares plans/forms, manages progress, and adds special risk assessment items.",
        "Vice Director Hung: MT accident area lacked warning and work-zone limits; departments update non-routine lists, QA audits safety content in procedures, and EHS coordinates clear safety procedures/standards.",
        "OK2 comment: the rainwater drain is on a worker traffic route and needs recurrence prevention; Safety Chair will report for higher instruction.",
        "MANI/MYL sharing: MANI had a needle-stick during disposal; MYL had a hand impact while loosening a vise screw and a polishing-machine pinch caused by adjusting material without stopping the machine.",
        "Serious MANI near-miss: phosphoric acid container broke due to wrong container-material recognition; actions are storage standardization, disposal-area posting, and chemical training at assignment.",
        "Traffic/commuting: no traffic accidents and no commuting-vehicle violations in April.",
        "Safety - 6S improvement: confirm proposals at PY on May 27 and PY2 on May 29; check technical boxes and require departments to update quantities on the server.",
        "OSH training: EHS & GA continue advanced safety training on safety culture transformation for department heads and above, EHS, and OS.",
        "EHS documents: 7 procedures issued, 2 under legal review; AT/PCCC/6S patrol and TBM procedures are being built for Jun 2026 use.",
        "Fire safety: on May 21 alarm transmission from PY/PY2 was connected to fire authority systems via Internet/3G/4G/5G; each factory has 10 recipients, and EHS prepares app guidance/rules.",
        "OSH risk assessment: departments identify hazards and assess risks during Apr-Jun 2026; BAT/EHS with Mr. Murai and Mr. Ishida verify results in Jul-Aug.",
        "Risk assessment note: do not group multiple risks into one row; PPE changes consequence severity, not frequency; contact EHS to avoid system mistakes.",
        "Other Safety - 6S: EHS continues checks in production/toilet areas, directly reminds quick fixes, and production maintains daily checks.",
        "Chemicals: May periodic chemical safety checks at both factories; shared decanting area has SA registration, with worker list, chemicals, and SDS posted by OS.",
        "Chemical PPE: OS checks each chemical-using process; some departments bought/issued filters and aprons, while unfinished items remain tracked in the summary sheet.",
        "Eyewash/chemical training: OS adds mobile eyewash units, labels, RO water, and instructions; each factory plans 3 chemical safety classes during Jun-Jul.",
        "Wastewater: Apr 2026 results meet QCVN 40:2011/BTNMT column B and QCVN 14:2008/BTNMT; quick tests to Apr 25 showed some TSS exceedances, under OS/MT/vendor investigation.",
        "Environmental monitoring: May 2026 periodic monitoring is performed at PY2 under environmental law/license, with OS reporting in the June safety meeting.",
        "OS procedures: OS-QT-01 wastewater management planned for Aug 2026 and OS-QT-02 chemical safety management targeted by end-Jun 2026.",
        "OS chemical/environment training: no chemical or environmental training was conducted in May 2026.",
        "Medline Dec 2025: EHS & SP completed 2 items; MT still handles CR3 elevator electrical box cover/Vietnamese instruction and building safety inspection report.",
        "AT-PCCC-6S report: Mar 2026 findings were corrected 6/6 and 7/7 with zero open items; the 7/7 row needs factory-label confirmation because the source repeats PY.",
        "Safety subcommittees: QAD, PED, DD, ED reported safety/6S checks; ED raised lightning damage at EBM wastewater electrical cabinet for recurrence prevention.",
        "Lightning instruction: Vice Director Hung classified EBM and fire-alarm center panel events as induced lightning; MT must prepare a detailed report and common prevention actions.",
        "Nail-cutting rule: GA revises rules prohibiting nail cutting during working hours/work areas; use designated places only, collect nails, and wash/use sticky roller if done in restroom.",
        "ID strap: machine operators are advised not to wear neck straps near moving parts; if needed, wear as guided by GA.",
        "Next meeting: June 2026 safety meeting on 2026-06-23 at PY; PY2 joins online via Teams.",
        "Mandatory communication: every department must brief all employees; EHS checks deployment at month end and adds it to the safety checklist."
      ],
      "ja": [
        "PY医療: 受診50件。呼吸器32%、神経22%、消化器12%。当月MTで左小指の負傷1件を記録。",
        "PY2医療: 受診72件。異常症状20.8%、神経13.8%、消化器13.8%。異常傾向の継続監視が必要。",
        "職業病追加健診: 2026/05/05にYkao総合クリニックで39名が追加健康診断・職業病検査を受診。クリニックが送迎を手配。",
        "医療報告: EDは2工場間で報告形式を統一し、詳細、月次比較グラフ、異常原因分析を追加するよう提案。医師は原因・対策分析の複雑さを説明し、TBAT TuấnはEHSに報告の補強を依頼。",
        "GAヒヤリ: 4月は軽微事故なし。4/03にBATが各部門へ類似電気盤の点検、指定リンクへの結果入力、5月中のEHS全社確認を要請。",
        "MT労災 4/29: 14:20頃、MHC-PY第1工場でPhạm Hồng Hạnhさんが雨水枡のふたを閉める際に手を挟まれ、左小指を骨折。5/06退院、5/07復帰。",
        "MS1/PY2労災 5/05: 06:10頃、Namashi溝加工工程でNguyễn Văn Longさんが脳震とう、額と右第1指を負傷。額6針、手4針を縫合し、5/13復帰。",
        "中村社長指示: 各部門は非定常作業を洗い出し、発生し得る危険源を特定する。EHSは5/18にファイルを配布し、更新期限は6/29予定。",
        "EHS要求: 特定済みの非定常作業危険源を集約し、再確認計画を作成。TBM様式と運用ルールを早急に整備し、2026年6月から全社適用する。",
        "安全文化: GA/EHSは5/16、5/19、5/20に部門長以上へ「職場安全文化変革の推進」を教育。部門長は内容を従業員へ展開する。",
        "重点安全フォロー: EHSは対象を確定し、計画・帳票を作成して進捗管理する。リスク評価計画に特別評価項目を追加する。",
        "Hùng副社長意見: MT事故現場は警告と作業範囲制限が不足。各部門は非定常作業リストを更新し、QAは手順書の安全指示を確認、EHSは明確な安全手順・基準を整備する。",
        "OK2意見: 雨水排水口が作業者通行ルート上にあり、再発防止策が必要。TBATは上位指示を受けるため報告する。",
        "MANI/MYL共有: MANIでは未使用針廃棄時に指を刺し約1mm負傷。MYLではバイスねじ取り外し時の指裂傷と、停止前の手調整による研磨機での指挟まれが発生。",
        "MANI重大ヒヤリ: 3/27 Hanaokaで、リン酸1:1保管容器が約4か月後に破損。アルミ材をSUSと誤認したことが原因。酸付着ウエス・容器処理、保管標準化、廃棄基準掲示、化学物質教育を実施。",
        "交通・通勤車両: 4月は交通事故なし、通勤車両違反も検出なし。",
        "安全 - 6S改善: PYは5/27、PY2は5/29に改善提案を確認。技術ボックスを点検し、各部門にサーバー上の数量更新を急ぐよう要請。",
        "労働安全衛生教育: EHS & GAは安全文化変革をテーマに、部門長以上、EHS、OS向けの専門教育を継続。",
        "EHS文書: 2026年5月時点でQC-04-01、EHS-QT-06、08、09、10、11、12の7手順を発行済み。緊急時対応とEHS-QT-15環境測定は法務確認中。AT/PCCC/6S巡回とTBM手順は2026年6月適用予定で作成中。",
        "防火: 5/21に業者がPY/PY2火災警報をインターネット/3G/4G/5G経由で消防・救助データシステムへ接続。各工場10名が電話/アプリ通知を受け、EHSが設定案内と警報対応規定を作成。",
        "労働安全衛生リスク評価: 各部門は2026年4-6月に危険源特定とリスク評価を実施。7-8月にBAT/EHSがMurai氏、Ishida氏と結果を確認。",
        "リスク評価注意: 複数リスクを1行にまとめない。PPEは影響度を変えるだけで頻度は変えない。システム誤り防止のためEHSへ確認する。",
        "その他 Safety - 6S: EHSは生産エリアとトイレの安全・6S点検を継続し、即時是正を直接指摘。生産は日常安全・6S点検を維持する。",
        "化学物質: 5月に2工場で定期化学物質安全点検を実施。共用小分けエリアはSA登録があり、OSが作業者リスト、化学物質、小分けSDSをタンク位置へ掲示。",
        "化学物質保護具: OSは化学物質使用工程ごとに確認。一部部門はフィルター・エプロンを購入/配布済みで、未完了項目は集計表で継続管理。",
        "洗眼設備・化学教育: OSは表示、RO水補充、使用説明、既存洗眼設備の引き渡しを5月に完了。6月は化学物質/油使用エリアへ追加設置し、教育リストを作成、各工場3クラスを6-7月に実施予定。",
        "排水環境: 2026年4月の排水分析はQCVN 40:2011/BTNMT B列およびQCVN 14:2008/BTNMTに適合。4/25までの簡易試験でTSS超過が一部あり、OSがMT・業者と原因/対策を確認。",
        "環境測定: 2026年5月、PY2工場で環境法令・環境許可に基づく定期測定を実施。OSが6月安全会議で結果を報告。",
        "OS手順: 5月にOS-QT-01排水管理手順を作成し2026年8月発行予定。OS-QT-02化学物質安全管理手順は2026年6月末完了予定。",
        "OS化学・環境教育: 2026年5月は化学物質および環境教育を実施していない。",
        "Medline 2025年12月: EHS & SPは2項目完了。MTはCR3エレベーター横電気箱のカバー/ベトナム語表示不足と、10年使用後の建物安全検査報告不足の2項目を是正中。",
        "AT-PCCC-6S報告: 2026年3月指摘は6/6および7/7を是正済み、未是正0件。原本の7/7行はPYが重複しており工場ラベル確認が必要。",
        "労働安全衛生小委員会: QAD、PED、DD、EDが安全・6S点検結果を報告。EDはEBM排水処理電気盤の落雷損傷について再発防止を提起。",
        "落雷に関する指示: Hùng副社長はEBMと火災警報中央盤の2件を誘導雷と判断。MTは詳細報告と類似設備の共通予防策を作成する。",
        "爪切り通知: GAは就業時間中または作業エリアでの爪切りを禁止する規則を改定。指定場所で時間外にのみ実施し、爪を適切に回収。トイレで行った場合は手洗いと粘着ローラー使用を求める。",
        "IDストラップ: 機械を直接操作する工程では、可動部への巻き込まれ防止のため首掛けストラップを使用しないことを推奨。必要な場合はGA案内の方法で着用する。",
        "次回会議: 2026年6月安全会議は2026/06/23にPY工場で開催、PY2はTeamsでオンライン参加。",
        "必須展開: 会議内容は各部門が全従業員へ周知する。EHSは月末に展開状況を確認し、安全チェックリストへ反映する。"
      ]
    },
    "audience": {
      "vi": "Tất cả bộ phận",
      "en": "All departments",
      "ja": "全部門"
    },
    "documentId": "doc-hop-at-t05-2026-v2",
    "documentUrl": "/uploads/2026-05-30-hop-at-t05-2026-v2.xlsx",
    "published": true
  }
],
  safetyActions: [
  {
    "id": "act-nonroutine-hazard-2026-06",
    "departmentId": "production",
    "severity": "high",
    "due": "2026-06-29",
    "title": {
      "vi": "Thống kê công việc không thường xuyên & nhận diện mối nguy",
      "en": "List non-routine work and identify hazards",
      "ja": "非定常作業の洗い出しと危険源特定"
    }
  },
  {
    "id": "act-tbm-company-2026-06",
    "departmentId": "ehs",
    "severity": "high",
    "due": "2026-06-30",
    "title": {
      "vi": "Hoàn thiện biểu mẫu TBM và cơ chế áp dụng toàn công ty",
      "en": "Finalize TBM form and company-wide mechanism",
      "ja": "TBM様式と全社運用の整備"
    }
  },
  {
    "id": "act-electrical-cabinet-ga-2026-05",
    "departmentId": "engineering",
    "severity": "high",
    "due": "2026-05-31",
    "title": {
      "vi": "Rà soát tủ điện tương tự sau cận nguy GA, nhập kết quả đúng link",
      "en": "Review similar electrical cabinets after GA near-miss",
      "ja": "GAヒヤリ後の類似電気盤確認"
    }
  },
  {
    "id": "act-risk-assessment-2026-06",
    "departmentId": "ehs",
    "severity": "medium",
    "due": "2026-06-30",
    "title": {
      "vi": "Hoàn thành đánh giá rủi ro ATVSLĐ, không gộp rủi ro/PPE sai",
      "en": "Complete OSH risk assessment without grouped risks/PPE errors",
      "ja": "労安衛リスク評価の完了とPPE評価誤り防止"
    }
  },
  {
    "id": "act-pccc-alarm-app-2026-06",
    "departmentId": "ehs",
    "severity": "medium",
    "due": "2026-06-15",
    "title": {
      "vi": "Hướng dẫn app báo cháy và quy định xử lý tin báo PCCC",
      "en": "Guide fire alarm app setup and response rules",
      "ja": "火災通報アプリ設定と対応ルール案内"
    }
  },
  {
    "id": "act-chemical-eyewash-training-2026-07",
    "departmentId": "ehs",
    "severity": "medium",
    "due": "2026-07-31",
    "title": {
      "vi": "Bổ sung bồn rửa mắt, PPE hóa chất và danh sách đào tạo tháng 6-7",
      "en": "Add eyewash units, chemical PPE, and Jun-Jul training list",
      "ja": "洗眼器・化学PPE・6-7月教育リスト整備"
    }
  },
  {
    "id": "act-lightning-prevention-2026-06",
    "departmentId": "engineering",
    "severity": "medium",
    "due": "2026-06-15",
    "title": {
      "vi": "Lập báo cáo sét đánh EBM/tủ báo cháy và biện pháp phòng ngừa chung",
      "en": "Report EBM/fire-panel lightning cases and common prevention",
      "ja": "EBM・火災盤落雷報告と共通再発防止"
    }
  },
  {
    "id": "act-communicate-meeting-2026-06",
    "departmentId": "office",
    "severity": "high",
    "due": "2026-06-30",
    "title": {
      "vi": "Phổ biến nội dung họp tới toàn bộ CBCNV và ghi nhận checklist",
      "en": "Communicate meeting content to all employees and record checklist",
      "ja": "会議内容を全従業員へ周知しチェックリスト記録"
    }
  }
]

};

export default defaultConfig;
