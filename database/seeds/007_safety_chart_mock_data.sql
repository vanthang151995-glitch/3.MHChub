-- MHChub Safety - 6S chart mock data.
-- Adds richer simulated time-series data for charts without touching real rows.
-- Safe to re-run: only rows with mock-chart-* ids/codes are refreshed.

SET NAMES utf8mb4;

START TRANSACTION;

DELETE FROM safety_approval_actions
WHERE entity_id LIKE 'mock-chart-kpi-%'
   OR entity_id LIKE 'mock-chart-warning-%'
   OR entity_id LIKE 'mock-chart-incident-%';

DELETE FROM safety_training_courses
WHERE id LIKE 'mock-chart-training-%' OR code LIKE 'CHART-TRN-%';

DELETE FROM safety_reports
WHERE id LIKE 'mock-chart-report-%' OR code LIKE 'CHART-RPT-%';

DELETE FROM safety_checklist_submissions
WHERE submitted_by_id = 'mock-chart-user';

DELETE FROM safety_kpi_entries
WHERE id LIKE 'mock-chart-kpi-%' OR code LIKE 'CHART-KPI-%';

DELETE FROM safety_incidents
WHERE id LIKE 'mock-chart-incident-%' OR code LIKE 'CHART-INC-%';

DELETE FROM safety_warnings
WHERE id LIKE 'mock-chart-warning-%' OR code LIKE 'CHART-WARN-%';

INSERT INTO safety_warnings
  (id, code, title, category, subcategory, department, area, risk_probability, risk_consequence, risk_score, risk_level,
   description, current_control, proposed_action, responsible_person, deadline, reporter_name, evidence_notes, related_standard,
   status, approval_status, rejection_reason, submitted_by_dept, submitted_by_id, submitted_by_name, created_by_name,
   updated_by_name, created_at, updated_at)
SELECT
  seed.id,
  seed.code,
  seed.title,
  seed.category,
  seed.subcategory,
  seed.department,
  seed.area,
  seed.probability,
  seed.consequence,
  seed.probability * seed.consequence,
  CASE
    WHEN seed.probability * seed.consequence >= 16 THEN 'Cực kỳ nghiêm trọng'
    WHEN seed.probability * seed.consequence >= 9 THEN 'Nghiêm trọng'
    WHEN seed.probability * seed.consequence >= 4 THEN 'Trung bình'
    ELSE 'Thấp'
  END,
  seed.description,
  seed.current_control,
  seed.proposed_action,
  seed.responsible_person,
  seed.deadline,
  seed.reporter_name,
  seed.evidence_notes,
  seed.related_standard,
  seed.status,
  seed.approval_status,
  NULL,
  seed.department,
  'mock-chart-user',
  'Mock Chart Seed',
  'Mock chart seed',
  'Mock chart seed',
  seed.created_at,
  seed.updated_at
FROM (
  SELECT 'mock-chart-warning-202601-001' AS id, 'CHART-WARN-202601-001' AS code, 'Cáp nguồn máy ép đặt sát lối đi ca đêm' AS title, 'An toàn điện' AS category, 'Dây dẫn tạm' AS subcategory, 'PE1' AS department, 'Line ép nhựa PY1' AS area, 4 AS probability, 4 AS consequence, 'Cáp nguồn tạm đặt sát lối đi, có nguy cơ vấp ngã và hư hỏng lớp cách điện.' AS description, 'Đã dùng băng keo cố định tạm trong ca.' AS current_control, 'Đi lại máng cáp, kiểm tra tải và cập nhật ảnh chuẩn sau cải tiến.' AS proposed_action, 'PE1 Supervisor' AS responsible_person, '2026-01-20' AS deadline, 'Auditor 6S' AS reporter_name, 'Ảnh hiện trường ca đêm.' AS evidence_notes, 'S6 Safety / Electrical' AS related_standard, 'Hoàn thành' AS status, 'Đã duyệt' AS approval_status, '2026-01-12 08:10:00' AS created_at, '2026-01-20 16:30:00' AS updated_at
  UNION ALL SELECT 'mock-chart-warning-202601-002', 'CHART-WARN-202601-002', 'Pallet rỗng che một phần vạch PCCC', 'PCCC', 'Lối tiếp cận thiết bị', 'WM', 'Kho WIP cửa B1', 3, 4, 'Pallet rỗng đặt lệch vào vùng tiếp cận bình chữa cháy.', 'Có vạch đỏ nhưng bị mờ.', 'Sơn lại vạch, dán nhãn không che chắn và kiểm tra cuối ca.', 'WM Leader', '2026-01-22', 'EHS Patrol', 'Ảnh pallet tại khu cửa B1.', 'PCCC / S2', 'Hoàn thành', 'Đã duyệt', '2026-01-14 09:00:00', '2026-01-22 15:00:00'
  UNION ALL SELECT 'mock-chart-warning-202601-003', 'CHART-WARN-202601-003', 'Mẫu NG chưa tách khỏi mẫu OK sau audit', 'Chất lượng', 'Phân loại mẫu', 'QA', 'Bàn OQC', 3, 3, 'Mẫu NG và OK dùng khay cùng màu, dễ nhầm trong giờ cao điểm.', 'Có nhãn đỏ nhưng kích thước nhỏ.', 'Tách khay, đổi màu nền và đưa ảnh chuẩn lên bảng thao tác.', 'QA Supervisor', '2026-01-24', 'QA Auditor', 'Biên bản audit OQC.', 'S1 Sort / Quality gate', 'Hoàn thành', 'Đã duyệt', '2026-01-15 10:20:00', '2026-01-24 16:20:00'
  UNION ALL SELECT 'mock-chart-warning-202601-004', 'CHART-WARN-202601-004', 'Ghế thao tác MS2 sai chiều cao', 'Ergonomic / Tư thế', 'Tư thế thao tác', 'MS2', 'Cell lắp ráp MS2', 2, 3, 'Người thao tác phải cúi cổ liên tục khi kiểm ngoại quan.', 'Đã nhắc xoay vị trí thao tác.', 'Điều chỉnh ghế, bổ sung đệm chân và đánh giá lại sau 1 tuần.', 'MS2 Leader', '2026-01-26', 'Line Leader', 'Ảnh tư thế thao tác.', 'Ergonomic / S6', 'Hoàn thành', 'Đã duyệt', '2026-01-18 14:00:00', '2026-01-26 17:00:00'
  UNION ALL SELECT 'mock-chart-warning-202602-001', 'CHART-WARN-202602-001', 'Tủ điện phụ thiếu tem cảnh báo tiếng Việt', 'An toàn điện', 'Tủ điện', 'MR', 'Khu bảo trì MR', 4, 5, 'Tủ điện phụ có tem cảnh báo cũ, thiếu hướng dẫn thao tác an toàn bằng tiếng Việt.', 'Tủ có khóa nhưng thiếu checklist kiểm tra.', 'Dán tem mới, bổ sung hướng dẫn và kiểm tra siết đầu cos.', 'Maintenance Lead', '2026-02-12', 'EHS Officer', 'Ảnh tem cảnh báo bong mép.', 'Electrical safety / S6', 'Hoàn thành', 'Đã duyệt', '2026-02-04 08:30:00', '2026-02-12 16:00:00'
  UNION ALL SELECT 'mock-chart-warning-202602-002', 'CHART-WARN-202602-002', 'Xe nâng rẽ tại giao cắt chưa giảm tốc', 'Giao thông nội bộ', 'Điểm giao cắt', 'WM', 'Cửa nhập hàng', 4, 4, 'Quan sát thấy xe nâng rẽ qua điểm giao cắt khi vạch giảm tốc bị bụi che.', 'Có biển nhưng thiếu gương cầu.', 'Sơn lại vạch, lắp gương cầu và đào tạo lại tài xế.', 'Warehouse Supervisor', '2026-02-15', 'EHS Patrol', 'Log tuần tra xe nâng.', 'Forklift / Traffic', 'Hoàn thành', 'Đã duyệt', '2026-02-07 09:40:00', '2026-02-15 15:30:00'
  UNION ALL SELECT 'mock-chart-warning-202602-003', 'CHART-WARN-202602-003', 'Chai hóa chất chiết thiếu nhãn phụ', 'Hóa chất', 'Nhãn/SDS', 'QA', 'QA Lab', 3, 5, 'Một số chai chiết chỉ ghi mã viết tay, thiếu QR SDS tại điểm dùng.', 'SDS có trong thư mục chung.', 'Chuẩn hóa nhãn phụ, dán QR SDS và kiểm kê cuối ngày.', 'QA Supervisor', '2026-02-18', 'QA Auditor', 'Danh sách 6 chai cần cập nhật.', 'Chemical safety / GHS', 'Hoàn thành', 'Đã duyệt', '2026-02-10 13:10:00', '2026-02-18 16:15:00'
  UNION ALL SELECT 'mock-chart-warning-202602-004', 'CHART-WARN-202602-004', 'Dụng cụ setup để ngoài shadow board', '6S', 'Sắp xếp dụng cụ', 'PE1', 'Bàn setup PY2', 3, 2, 'Cờ lê và dưỡng kiểm để lại trên bàn sau setup, không trả về shadow board.', 'Có shadow board nhưng ảnh chuẩn cũ.', 'Cập nhật ảnh chuẩn, checklist cuối ca và gắn nhãn vị trí.', 'Production Supervisor', '2026-02-20', '6S Auditor', 'Ảnh bàn setup cuối ca.', 'S2 Set in order', 'Hoàn thành', 'Đã duyệt', '2026-02-13 16:00:00', '2026-02-20 17:00:00'
  UNION ALL SELECT 'mock-chart-warning-202603-001', 'CHART-WARN-202603-001', 'Khu vực dầu bảo trì thiếu khay chống tràn', 'Hóa chất/dầu', 'Chống tràn', 'MR', 'Kho bảo trì', 3, 4, 'Can dầu đang dùng dở đặt trực tiếp trên sàn, có vết loang nhỏ.', 'Có kệ riêng nhưng thiếu khay hứng.', 'Bổ sung khay chống tràn và nhãn tình trạng mở nắp.', 'Maintenance Lead', '2026-03-13', 'Storekeeper', 'Ảnh kệ dầu bảo trì.', 'Spill control / S3 / S6', 'Hoàn thành', 'Đã duyệt', '2026-03-05 10:15:00', '2026-03-13 16:10:00'
  UNION ALL SELECT 'mock-chart-warning-202603-002', 'CHART-WARN-202603-002', 'Lối thoát hiểm văn phòng bị thùng tài liệu chắn', 'Thoát hiểm', 'Lối đi', 'GA', 'Office cửa Tây', 3, 4, 'Thùng tài liệu cũ đặt sát cửa thoát hiểm, làm hẹp lối di chuyển.', 'Có biển exit nhưng chưa kẻ vùng cấm.', 'Di chuyển tài liệu, kẻ vùng cấm và kiểm tra chiều thứ Sáu.', 'GA Admin', '2026-03-11', 'EHS Patrol', 'Ảnh cửa thoát hiểm.', 'Emergency exit / S2 / S6', 'Hoàn thành', 'Đã duyệt', '2026-03-06 08:20:00', '2026-03-11 15:40:00'
  UNION ALL SELECT 'mock-chart-warning-202603-003', 'CHART-WARN-202603-003', 'Jig sắc cạnh chưa bọc bảo vệ tay', 'An toàn thao tác', 'Jig sắc cạnh', 'OK1', 'Line kiểm ngoại quan', 3, 3, 'Cạnh jig có ba via, người thao tác phải đưa tay sát cạnh sắc.', 'Có găng tay nhưng chưa xử lý tại nguồn.', 'Mài cạnh, bọc nẹp và cập nhật tiêu chuẩn kiểm jig.', 'OK1 Leader', '2026-03-18', 'Operator', 'Ghi chú vị trí jig.', 'Hand injury / S6', 'Hoàn thành', 'Đã duyệt', '2026-03-09 14:40:00', '2026-03-18 16:00:00'
  UNION ALL SELECT 'mock-chart-warning-202603-004', 'CHART-WARN-202603-004', 'Khu vực phế liệu chưa phân loại theo màu', 'Môi trường', 'Phân loại rác', 'OS', 'Khu tập kết OS', 2, 3, 'Thùng phế liệu nhựa và giấy dùng cùng màu, nhãn bị rách.', 'Có bảng phân loại cũ.', 'Đổi màu thùng, in nhãn mới và kiểm tra theo checklist tuần.', 'OS Leader', '2026-03-21', '6S Auditor', 'Ảnh khu phế liệu.', 'S1 Sort / Environment', 'Hoàn thành', 'Đã duyệt', '2026-03-12 11:00:00', '2026-03-21 16:20:00'
  UNION ALL SELECT 'mock-chart-warning-202604-001', 'CHART-WARN-202604-001', 'Không treo thẻ LOTO khi vệ sinh cảm biến', 'LOTO', 'Bảo trì ngắn', 'ETR', 'Cell đóng gói', 4, 5, 'Kỹ thuật viên vệ sinh cảm biến khi máy ở chế độ chờ, chưa treo thẻ LOTO.', 'Có nút dừng khẩn nhưng chưa có mini checklist.', 'Dừng vận hành để đào tạo lại LOTO và bổ sung checklist trước vệ sinh.', 'ETR Leader', '2026-04-09', 'EHS Patrol', 'Ghi nhận trong tuần tra sáng.', 'LOTO / S6', 'Hoàn thành', 'Đã duyệt', '2026-04-02 09:50:00', '2026-04-09 15:30:00'
  UNION ALL SELECT 'mock-chart-warning-202604-002', 'CHART-WARN-202604-002', 'Tem FIFO không khớp sau đổi layout kho', '6S', 'FIFO', 'WM', 'Rack WIP B', 3, 2, 'Một số kệ WIP có thẻ vị trí cũ, tem thùng mới không khớp thứ tự xuất.', 'Có kiểm kê tuần nhưng chưa kiểm tra sau đổi layout.', 'Cập nhật thẻ kệ, khóa layout trên sơ đồ kho và audit FIFO 2 lần/tuần.', 'Warehouse Supervisor', '2026-04-16', 'Inventory Staff', 'Bảng đối chiếu vị trí kệ.', 'S2 / FIFO', 'Hoàn thành', 'Đã duyệt', '2026-04-08 10:20:00', '2026-04-16 15:20:00'
  UNION ALL SELECT 'mock-chart-warning-202604-003', 'CHART-WARN-202604-003', 'Ổ cắm kéo dài có dấu quá tải', 'An toàn điện', 'Điện văn phòng', 'GA', 'Khu Admin', 3, 4, 'Ổ cắm kéo dài cấp nguồn cho nhiều thiết bị, dây nằm dưới lối chân ghế.', 'Có dây buộc nhưng chưa tách tải.', 'Tách nguồn, cố định dây và dán nhãn tải tối đa.', 'GA Admin', '2026-04-19', 'EHS Patrol', 'Ảnh ổ cắm và dây kéo dài.', 'Office electrical / S6', 'Hoàn thành', 'Đã duyệt', '2026-04-11 08:30:00', '2026-04-19 16:00:00'
  UNION ALL SELECT 'mock-chart-warning-202604-004', 'CHART-WARN-202604-004', 'Màn chắn máy ép chưa trả về vị trí chuẩn', 'Thiết bị bảo vệ', 'Machine guard', 'PE1', 'Máy ép PY1', 3, 4, 'Màn chắn sau vệ sinh chưa trả về vị trí chuẩn, khe hở lớn hơn tiêu chuẩn.', 'Có SOP vệ sinh nhưng thiếu bước xác nhận ảnh.', 'Bổ sung ảnh chuẩn sau vệ sinh và xác nhận trưởng ca.', 'PE1 Supervisor', '2026-04-22', 'Line Leader', 'Ảnh màn chắn máy ép.', 'Machine guarding / S6', 'Hoàn thành', 'Đã duyệt', '2026-04-14 14:15:00', '2026-04-22 16:45:00'
  UNION ALL SELECT 'mock-chart-warning-202605-001', 'CHART-WARN-202605-001', 'Pallet hư vẫn dùng tại tuyến xe nâng', 'Kho vận', 'Pallet hỏng', 'WM', 'Kho thành phẩm lane F3', 3, 4, 'Pallet nứt cạnh vẫn được dùng để xếp hàng, có nguy cơ đổ hàng.', 'Chưa có khu cách ly pallet hỏng rõ ràng.', 'Lập khu cách ly, dán nhãn đỏ và ghi nhận trong bàn giao ca.', 'Warehouse Leader', '2026-05-12', 'Forklift Driver', 'Ảnh pallet nứt cạnh.', 'Forklift / S1 / S6', 'Hoàn thành', 'Đã duyệt', '2026-05-04 09:00:00', '2026-05-12 16:00:00'
  UNION ALL SELECT 'mock-chart-warning-202605-002', 'CHART-WARN-202605-002', 'Biểu mẫu TBM thiếu tình huống công việc không thường xuyên', 'Quản trị an toàn', 'TBM', 'EHS', 'EHS Office', 2, 3, 'Biểu mẫu TBM chưa có ô xác nhận mối nguy phát sinh từ công việc không thường xuyên.', 'Có file draft nhưng chưa ban hành.', 'Thử nghiệm tại Production và Engineering trước khi ban hành.', 'EHS Officer', '2026-05-24', 'Safety Chair', 'Draft TBM v0.4.', 'S5 Sustain / TBM', 'Hoàn thành', 'Đã duyệt', '2026-05-08 09:40:00', '2026-05-24 16:30:00'
  UNION ALL SELECT 'mock-chart-warning-202605-003', 'CHART-WARN-202605-003', 'Vạch phân luồng xe nâng bị mờ sau vệ sinh sàn', 'Giao thông nội bộ', 'Vạch phân luồng', 'WM', 'Cửa nhập hàng', 3, 4, 'Vạch phân luồng tại điểm giao cắt xe nâng và người đi bộ bị mờ.', 'Có biển cảnh báo nhưng thiếu ở góc khuất.', 'Sơn lại vạch, thêm gương cầu và đưa vào tuần tra PCCC-6S.', 'Warehouse Supervisor', '2026-05-19', 'EHS Patrol', 'Ảnh điểm giao cắt.', 'Traffic / S4 / S6', 'Hoàn thành', 'Đã duyệt', '2026-05-10 11:20:00', '2026-05-19 15:50:00'
  UNION ALL SELECT 'mock-chart-warning-202605-004', 'CHART-WARN-202605-004', 'Tài liệu SDS cũ còn lưu tại điểm dùng', 'Hóa chất', 'SDS', 'QC', 'QC Lab', 2, 4, 'Một bản SDS cũ còn trong bìa hồ sơ tại điểm dùng, không khớp phiên bản mới.', 'Có QR SDS nhưng chưa loại bỏ bản cũ.', 'Thu hồi bản cũ, kiểm soát phiên bản và audit lại toàn bộ bìa SDS.', 'QC Supervisor', '2026-05-26', 'QC Auditor', 'Danh sách SDS cần thu hồi.', 'Chemical safety / S5', 'Hoàn thành', 'Đã duyệt', '2026-05-14 13:30:00', '2026-05-26 16:40:00'
  UNION ALL SELECT 'mock-chart-warning-202606-001', 'CHART-WARN-202606-001', 'Dây đeo thẻ gần cơ cấu quay máy Namashi', '6S', 'An toàn máy', 'MS1', 'MS1 Namashi', 5, 4, 'Công nhân vận hành còn đeo dây thẻ dạng cổ khi đứng gần trục quay.', 'Đã nhắc miệng trong ca nhưng chưa có quy định trực quan tại máy.', 'Ban hành dây thẻ ngắn hoặc kẹp áo, dán cảnh báo tại máy và xác nhận trong họp đầu ca.', 'MS1 Leader', '2026-06-10', 'Auditor 6S', 'Ảnh hiện trường máy Namashi.', 'S6 Safety / Machine guarding', 'Đang xử lý', 'Đã duyệt', '2026-06-02 08:00:00', '2026-06-06 08:00:00'
  UNION ALL SELECT 'mock-chart-warning-202606-002', 'CHART-WARN-202606-002', 'Tủ PCCC bị xe đẩy che khuất sau giờ nhập hàng', 'PCCC', 'Lối tiếp cận thiết bị', 'WM', 'Kho nguyên vật liệu D2', 4, 4, 'Xe đẩy hàng đặt sát tủ PCCC, giảm khả năng tiếp cận khi có báo cháy.', 'Có vạch đỏ nhưng chưa có checklist cuối ca.', 'Sơn lại vùng cấm, dán biển và đưa vào checklist kho.', 'Warehouse Supervisor', '2026-06-08', 'EHS Officer', 'Ảnh xe đẩy chắn tủ PCCC.', 'PCCC / S6 Safety', 'Đang xử lý', 'Đã duyệt', '2026-06-03 09:10:00', '2026-06-06 09:10:00'
  UNION ALL SELECT 'mock-chart-warning-202606-003', 'CHART-WARN-202606-003', 'Dầu rò tại lối đi cạnh máy ép', '6S', 'Sạch sẽ - trượt ngã', 'PE1', 'Line ép nhựa', 4, 4, 'Dầu thủy lực rò ra mép lối đi, có dấu chân kéo dài sang vùng thao tác.', 'Đã đặt khăn thấm tạm thời.', 'Cô lập khu vực, sửa điểm rò và thêm kiểm tra đầu ca trong 7 ngày.', 'Production Supervisor', '2026-06-09', 'Auditor 6S', 'Ảnh vệt dầu và vết chân.', 'S3 Shine / S6 Safety', 'Đang xử lý', 'Đã duyệt', '2026-06-04 13:30:00', '2026-06-06 13:30:00'
  UNION ALL SELECT 'mock-chart-warning-202606-004', 'CHART-WARN-202606-004', 'Khu vực hố nước mưa thiếu rào chắn thao tác', 'Công việc không thường xuyên', 'Hố nước mưa', 'GA', 'Sân sau nhà máy', 4, 4, 'Khu vực thao tác nắp hố nước mưa chưa có cảnh báo cố định và rào chắn khi mở nắp.', 'Có hướng dẫn miệng sau sự cố cũ.', 'Lập SOP mở nắp hố, bổ sung rào chắn di động và TBM trước thao tác.', 'GA/EHS', '2026-06-12', 'Safety Committee', 'Bài học TNLĐ hố nước mưa.', 'Non-routine work / S6', 'Mở', 'Chờ duyệt', '2026-06-05 14:30:00', '2026-06-05 14:30:00'
  UNION ALL SELECT 'mock-chart-warning-202606-005', 'CHART-WARN-202606-005', 'Thang di động thiếu tem kiểm định tháng 06', 'Thiết bị bảo vệ', 'Thiết bị phụ trợ', 'MR', 'Kho bảo trì', 3, 4, 'Một thang di động còn dùng nhưng tem kiểm định tháng 06 chưa được cập nhật.', 'Có danh sách kiểm định tháng nhưng chưa đối chiếu hiện trường.', 'Cách ly thang, kiểm định lại và dán tem trước khi trả về khu dùng chung.', 'Maintenance Lead', '2026-06-11', 'Storekeeper', 'Ảnh tem kiểm định cũ.', 'Work at height / S6', 'Mở', 'Chờ duyệt', '2026-06-05 15:20:00', '2026-06-05 15:20:00'
  UNION ALL SELECT 'mock-chart-warning-202606-006', 'CHART-WARN-202606-006', 'Ống khí nén để võng qua vùng thao tác', 'An toàn thao tác', 'Ống khí nén', 'DP2', 'Cell DP2', 3, 3, 'Ống khí nén để võng qua vùng thao tác, dễ vướng tay khi đổi gá.', 'Có kẹp treo nhưng chưa đủ vị trí.', 'Bổ sung kẹp treo, đánh dấu tuyến ống và kiểm tra sau đổi layout.', 'DP2 Leader', '2026-06-14', 'Line Leader', 'Ảnh tuyến ống khí nén.', 'S2 / S6', 'Mở', 'Đã duyệt', '2026-06-06 10:30:00', '2026-06-06 10:30:00'
) AS seed
WHERE 1 = 1
ON DUPLICATE KEY UPDATE
  title = VALUES(title), category = VALUES(category), subcategory = VALUES(subcategory), department = VALUES(department),
  area = VALUES(area), risk_probability = VALUES(risk_probability), risk_consequence = VALUES(risk_consequence),
  risk_score = VALUES(risk_score), risk_level = VALUES(risk_level), description = VALUES(description),
  current_control = VALUES(current_control), proposed_action = VALUES(proposed_action), responsible_person = VALUES(responsible_person),
  deadline = VALUES(deadline), reporter_name = VALUES(reporter_name), evidence_notes = VALUES(evidence_notes),
  related_standard = VALUES(related_standard), status = VALUES(status), approval_status = VALUES(approval_status),
  updated_by_name = VALUES(updated_by_name), updated_at = VALUES(updated_at);

INSERT INTO safety_incidents
  (id, code, type, severity, status, department, area, description, occurred_date, occurred_time, reporter_name,
   reporter_phone, handler_name, witnesses, body_parts_affected_json, first_aid_given, root_cause_category,
   root_cause_detail, immediate_action, corrective_action, preventive_action, estimated_cost, approval_status,
   rejection_reason, submitted_by_dept, submitted_by_id, submitted_by_name, created_by_name, updated_by_name,
   created_at, updated_at)
SELECT
  seed.id,
  seed.code,
  seed.type,
  seed.severity,
  seed.status,
  seed.department,
  seed.area,
  seed.description,
  seed.occurred_date,
  seed.occurred_time,
  seed.reporter_name,
  NULL,
  seed.handler_name,
  seed.witnesses,
  seed.body_parts_affected_json,
  seed.first_aid_given,
  seed.root_cause_category,
  seed.root_cause_detail,
  seed.immediate_action,
  seed.corrective_action,
  seed.preventive_action,
  seed.estimated_cost,
  seed.approval_status,
  NULL,
  seed.department,
  'mock-chart-user',
  'Mock Chart Seed',
  'Mock chart seed',
  'Mock chart seed',
  seed.created_at,
  seed.updated_at
FROM (
  SELECT 'mock-chart-incident-202601-001' AS id, 'CHART-INC-202601-001' AS code, 'Ngã/Va chạm' AS type, 'Trung bình' AS severity, 'Đóng' AS status, 'PE1' AS department, 'Line ép nhựa PY1' AS area, 'Nhân viên trượt chân do nền còn dầu sau vệ sinh máy.' AS description, '2026-01-16' AS occurred_date, '09:20' AS occurred_time, 'Line Leader' AS reporter_name, 'Production Supervisor' AS handler_name, '2 nhân viên cùng ca' AS witnesses, '["Đầu gối/Chân"]' AS body_parts_affected_json, 1 AS first_aid_given, 'Môi trường' AS root_cause_category, 'Nền chưa khô hoàn toàn sau vệ sinh, thiếu biển cảnh báo sàn ướt.' AS root_cause_detail, 'Sơ cứu và cô lập khu vực.' AS immediate_action, 'Bổ sung biển sàn ướt, kiểm tra điểm rò dầu.' AS corrective_action, 'Đưa kiểm tra sàn vào checklist đầu ca.' AS preventive_action, 300000 AS estimated_cost, 'Đã duyệt' AS approval_status, '2026-01-16 09:35:00' AS created_at, '2026-01-18 15:00:00' AS updated_at
  UNION ALL SELECT 'mock-chart-incident-202601-002', 'CHART-INC-202601-002', 'Sự cố thiết bị', 'Nhẹ', 'Đóng', 'MR', 'Khu bảo trì MR', 'Cảm biến cửa an toàn báo lỗi làm dừng máy 18 phút.', '2026-01-23', '15:05', 'Maintenance Tech', 'Maintenance Lead', 'Operator ca chiều', '[]', 0, 'Thiết bị', 'Đầu nối cảm biến lỏng sau rung động.', 'Dừng máy và kiểm tra tín hiệu.', 'Siết lại đầu nối, thay nẹp giữ cáp.', 'Bổ sung kiểm tra đầu nối trong PM tháng.', 450000, 'Đã duyệt', '2026-01-23 15:30:00', '2026-01-24 10:00:00'
  UNION ALL SELECT 'mock-chart-incident-202601-003', 'CHART-INC-202601-003', 'Hóa chất', 'Nhẹ', 'Đã khắc phục', 'QA', 'QA Lab', 'Tràn nhỏ dung dịch kiểm nghiệm khi chuyển chai chiết.', '2026-01-28', '11:10', 'QA Analyst', 'QA Supervisor', '1 nhân viên lab', '["Bàn tay/Ngón tay"]', 1, 'Phương pháp', 'Phễu chiết không phù hợp kích thước chai nhỏ.', 'Dùng bộ spill kit và thay găng.', 'Trang bị phễu chuẩn, nhãn rõ dung tích chai.', 'Đào tạo lại thao tác chiết dung dịch nhỏ.', 120000, 'Đã duyệt', '2026-01-28 11:25:00', '2026-01-30 16:00:00'
  UNION ALL SELECT 'mock-chart-incident-202602-001', 'CHART-INC-202602-001', 'Tai nạn lao động', 'Nghiêm trọng', 'Đóng', 'WM', 'Kho WIP B2', 'Xe nâng phanh gấp khi người đi bộ bước vào vùng giao cắt vạch mờ.', '2026-02-20', '14:10', 'Warehouse Leader', 'Warehouse Supervisor', 'Tài xế xe nâng', '[]', 0, 'Môi trường', 'Vạch phân luồng và biển giảm tốc không đủ nổi bật.', 'Dừng tuyến xe nâng 20 phút và phân luồng tạm.', 'Sơn lại vạch, lắp gương cầu.', 'Huấn luyện lại tuyến xe nâng cho toàn kho.', 0, 'Đã duyệt', '2026-02-20 14:40:00', '2026-02-25 16:00:00'
  UNION ALL SELECT 'mock-chart-incident-202602-002', 'CHART-INC-202602-002', 'Điện giật', 'Trung bình', 'Đóng', 'GA', 'Office Admin', 'Nhân viên bị tê nhẹ khi chạm vỏ ổ cắm kéo dài bị hở tiếp địa.', '2026-02-24', '16:45', 'GA Admin', 'EHS Officer', '2 nhân viên văn phòng', '["Bàn tay/Ngón tay"]', 1, 'Thiết bị', 'Ổ cắm kéo dài cũ và chưa kiểm tra định kỳ.', 'Cắt nguồn và thay ổ cắm.', 'Loại bỏ ổ cắm cũ, đo lại tiếp địa.', 'Dán tem kiểm tra điện văn phòng hàng quý.', 250000, 'Đã duyệt', '2026-02-24 17:05:00', '2026-02-26 14:30:00'
  UNION ALL SELECT 'mock-chart-incident-202602-003', 'CHART-INC-202602-003', 'Khác', 'Nhẹ', 'Đóng', 'OS', 'Khu tập kết OS', 'Bao phế liệu rơi khỏi xe đẩy do buộc dây không đúng.', '2026-02-27', '10:25', 'OS Leader', 'OS Leader', 'Nhân viên OS', '[]', 0, 'Phương pháp', 'Quy định buộc dây chưa được chuẩn hóa bằng ảnh.', 'Dọn khu vực và kiểm tra lại xe đẩy.', 'Cập nhật ảnh chuẩn buộc dây.', 'Kiểm tra xe đẩy trước khi di chuyển.', 80000, 'Đã duyệt', '2026-02-27 10:40:00', '2026-02-28 15:00:00'
  UNION ALL SELECT 'mock-chart-incident-202603-001', 'CHART-INC-202603-001', 'Chấn thương nhiệt', 'Trung bình', 'Đóng', 'PE1', 'Line ép nhựa', 'Nhân viên bị bỏng nhẹ khi chạm khuôn còn nóng sau đổi mã.', '2026-03-07', '08:50', 'Line Leader', 'Production Supervisor', '1 operator', '["Bàn tay/Ngón tay"]', 1, 'Con người', 'Thiếu xác nhận nhiệt độ khuôn trước thao tác vệ sinh.', 'Làm mát và sơ cứu.', 'Bổ sung bước đo nhiệt và biển cảnh báo khuôn nóng.', 'TBM trước khi đổi mã hàng.', 500000, 'Đã duyệt', '2026-03-07 09:10:00', '2026-03-12 16:00:00'
  UNION ALL SELECT 'mock-chart-incident-202603-002', 'CHART-INC-202603-002', 'Sự cố thiết bị', 'Nhẹ', 'Đã khắc phục', 'ETR', 'Cell ETR', 'Xi lanh khí nén kẹt làm rơi chi tiết vào khay NG.', '2026-03-17', '13:35', 'ETR Leader', 'Maintenance Lead', 'Operator ca chiều', '[]', 0, 'Thiết bị', 'Bụi bám tại ray dẫn hướng, lịch vệ sinh chưa phù hợp.', 'Dừng cell và vệ sinh ray.', 'Điều chỉnh tần suất vệ sinh ray dẫn hướng.', 'Theo dõi bất thường khí nén trong 2 tuần.', 350000, 'Đã duyệt', '2026-03-17 13:50:00', '2026-03-19 16:20:00'
  UNION ALL SELECT 'mock-chart-incident-202603-003', 'CHART-INC-202603-003', 'Ngã/Va chạm', 'Nhẹ', 'Đóng', 'GA', 'Cầu thang văn phòng', 'Nhân viên vấp mép thảm cửa sau mưa.', '2026-03-25', '08:15', 'GA Admin', 'GA Admin', 'Bảo vệ', '["Đầu gối/Chân"]', 1, 'Môi trường', 'Thảm cửa bị xô lệch và chưa có nẹp cố định.', 'Sơ cứu nhẹ và thay thảm.', 'Cố định nẹp thảm, kiểm tra sau ngày mưa.', 'Đưa vào checklist văn phòng.', 100000, 'Đã duyệt', '2026-03-25 08:35:00', '2026-03-26 11:00:00'
  UNION ALL SELECT 'mock-chart-incident-202604-001', 'CHART-INC-202604-001', 'Sự cố thiết bị', 'Nghiêm trọng', 'Đang điều tra', 'MR', 'Tủ điện CR3', 'Aptomat nhánh nóng bất thường trong lúc kiểm tra tải sau bảo trì.', '2026-04-06', '10:40', 'Maintenance Tech', 'Maintenance Lead', 'EHS Officer', '[]', 0, 'Thiết bị', 'Có khả năng siết đầu cos chưa đủ lực sau thay thế.', 'Cắt nguồn nhánh và đo nhiệt.', 'Kiểm tra lực siết, thay aptomat dự phòng.', 'Cập nhật checklist nghiệm thu tủ điện.', 1800000, 'Đã duyệt', '2026-04-06 11:10:00', '2026-04-08 16:30:00'
  UNION ALL SELECT 'mock-chart-incident-202604-002', 'CHART-INC-202604-002', 'Hóa chất', 'Trung bình', 'Đã khắc phục', 'QC', 'QC Lab', 'Dung dịch tẩy rửa rò từ nắp chai trong khay lưu mẫu.', '2026-04-18', '14:55', 'QC Analyst', 'QC Supervisor', '1 nhân viên QC', '["Bàn tay/Ngón tay"]', 1, 'Vật liệu', 'Nắp chai phụ không kín và thiếu kiểm tra sau đóng nắp.', 'Cô lập khay và dùng spill kit.', 'Thay chai phụ đạt chuẩn, kiểm tra nhãn và nắp.', 'Audit chai chiết mỗi cuối ca.', 220000, 'Đã duyệt', '2026-04-18 15:15:00', '2026-04-20 15:30:00'
  UNION ALL SELECT 'mock-chart-incident-202604-003', 'CHART-INC-202604-003', 'Ngã/Va chạm', 'Nhẹ', 'Đóng', 'OK2', 'Line OK2', 'Xe đẩy va nhẹ vào chân bàn thao tác do lối đi hẹp sau đổi layout.', '2026-04-26', '11:20', 'OK2 Leader', 'OK2 Leader', 'Operator', '["Đầu gối/Chân"]', 1, 'Phương pháp', 'Layout tạm chưa kiểm tra khoảng hở xe đẩy.', 'Dừng xe đẩy khu vực và mở rộng lối.', 'Rà soát layout sau đổi mã.', 'Xác nhận lối đi bằng ảnh trước vận hành.', 150000, 'Đã duyệt', '2026-04-26 11:40:00', '2026-04-28 14:00:00'
  UNION ALL SELECT 'mock-chart-incident-202605-001', 'CHART-INC-202605-001', 'Tai nạn lao động', 'Trung bình', 'Đang theo dõi', 'MS1', 'MS1 Namashi', 'Dây thẻ vướng nhẹ vào cạnh jig khi cúi kiểm chi tiết.', '2026-05-09', '09:30', 'MS1 Leader', 'Production Supervisor', 'Operator cùng line', '["Vai/Cánh tay"]', 1, 'Con người', 'Quy định dây thẻ ngắn chưa được triển khai đồng bộ.', 'Dừng thao tác, kiểm tra người lao động.', 'Ban hành dây thẻ ngắn và kẹp áo tại MS1.', 'Audit tuân thủ dây thẻ đầu ca.', 200000, 'Đã duyệt', '2026-05-09 09:50:00', '2026-05-14 15:00:00'
  UNION ALL SELECT 'mock-chart-incident-202605-002', 'CHART-INC-202605-002', 'Cháy nổ', 'Nguy hiểm', 'Đang điều tra', 'WM', 'Kho thành phẩm', 'Mùi khét phát ra từ ổ cắm quạt thông gió khu kho.', '2026-05-18', '16:05', 'Warehouse Leader', 'EHS Officer', 'Bảo vệ', '[]', 0, 'Thiết bị', 'Ổ cắm cũ chịu tải liên tục, chưa kiểm tra nhiệt định kỳ.', 'Cắt nguồn, kiểm tra bằng camera nhiệt.', 'Thay ổ cắm công nghiệp và tách tải.', 'Lập lịch kiểm tra nhiệt thiết bị điện kho.', 950000, 'Đã duyệt', '2026-05-18 16:25:00', '2026-05-22 16:45:00'
  UNION ALL SELECT 'mock-chart-incident-202605-003', 'CHART-INC-202605-003', 'Sự cố thiết bị', 'Nhẹ', 'Đóng', 'DP1', 'Cell DP1', 'Cảm biến nắp che lỗi làm dừng cell 12 phút.', '2026-05-27', '13:10', 'DP1 Leader', 'Maintenance Tech', 'Operator', '[]', 0, 'Thiết bị', 'Bụi bám tại công tắc hành trình.', 'Vệ sinh và reset cell.', 'Che bụi tốt hơn tại công tắc hành trình.', 'Thêm vào PM tuần.', 180000, 'Đã duyệt', '2026-05-27 13:25:00', '2026-05-28 10:30:00'
  UNION ALL SELECT 'mock-chart-incident-202606-001', 'CHART-INC-202606-001', 'Ngã/Va chạm', 'Trung bình', 'Đang xử lý', 'PE1', 'Line ép nhựa', 'Nhân viên trượt nhẹ tại mép lối đi cạnh máy ép có dầu rò.', '2026-06-03', '10:05', 'Line Leader', 'Production Supervisor', '1 operator', '["Đầu gối/Chân"]', 1, 'Môi trường', 'Điểm rò dầu chưa xử lý triệt để sau vệ sinh.', 'Sơ cứu, cô lập vùng dầu.', 'Sửa điểm rò và vệ sinh sàn.', 'Kiểm tra đầu ca trong 7 ngày.', 260000, 'Chờ duyệt', '2026-06-03 10:30:00', '2026-06-06 10:30:00'
  UNION ALL SELECT 'mock-chart-incident-202606-002', 'CHART-INC-202606-002', 'Sự cố thiết bị', 'Nghiêm trọng', 'Đang điều tra', 'MR', 'CR3', 'Tủ điện phụ có tiếng kêu bất thường khi tải tăng sau giờ cao điểm.', '2026-06-04', '15:45', 'Maintenance Tech', 'Maintenance Lead', 'EHS Officer', '[]', 0, 'Thiết bị', 'Chưa xác định, nghi ngờ tiếp xúc đầu nối kém.', 'Giảm tải và khoanh vùng kiểm tra.', 'Đo nhiệt, siết đầu nối, thay linh kiện nếu cần.', 'Nghiệm thu tủ bằng checklist ảnh.', 1200000, 'Chờ duyệt', '2026-06-04 16:10:00', '2026-06-06 16:10:00'
  UNION ALL SELECT 'mock-chart-incident-202606-003', 'CHART-INC-202606-003', 'Hóa chất', 'Nhẹ', 'Đã khắc phục', 'QA', 'QA Lab', 'Chai chiết đổ vài giọt do nắp phụ không cùng chuẩn ren.', '2026-06-05', '11:15', 'QA Analyst', 'QA Supervisor', '1 nhân viên lab', '["Bàn tay/Ngón tay"]', 1, 'Vật liệu', 'Chai phụ dùng lẫn nhiều loại nắp, chưa phân loại theo chuẩn.', 'Lau dọn bằng spill kit và thay găng.', 'Tách loại chai phụ, dán nhãn chuẩn ren.', 'Audit chai phụ cuối tuần.', 90000, 'Đã duyệt', '2026-06-05 11:30:00', '2026-06-06 11:30:00'
) AS seed
WHERE 1 = 1
ON DUPLICATE KEY UPDATE
  type = VALUES(type), severity = VALUES(severity), status = VALUES(status), department = VALUES(department),
  area = VALUES(area), description = VALUES(description), occurred_date = VALUES(occurred_date),
  occurred_time = VALUES(occurred_time), reporter_name = VALUES(reporter_name), handler_name = VALUES(handler_name),
  witnesses = VALUES(witnesses), body_parts_affected_json = VALUES(body_parts_affected_json),
  first_aid_given = VALUES(first_aid_given), root_cause_category = VALUES(root_cause_category),
  root_cause_detail = VALUES(root_cause_detail), immediate_action = VALUES(immediate_action),
  corrective_action = VALUES(corrective_action), preventive_action = VALUES(preventive_action),
  estimated_cost = VALUES(estimated_cost), approval_status = VALUES(approval_status),
  updated_by_name = VALUES(updated_by_name), updated_at = VALUES(updated_at);

INSERT INTO safety_kpi_entries
  (id, code, entry_type, period_type, period, department_code, division_code, value, target, unit, notes,
   approval_status, rejection_reason, rejected_by_level, submitted_by_id, submitted_by_name, submitted_by_dept,
   l1_approved_by_id, l1_approved_by_name, l1_approved_at, l2_approved_by_id, l2_approved_by_name, l2_approved_at,
   created_by_name, updated_by_name, created_at, updated_at)
WITH mock_chart_months AS (
  SELECT '2026-01' AS period, '202601' AS period_key, '01/2026' AS month_label, 78 AS score_base, 68 AS checklist_base, 54 AS training_base, 6 AS violation_base, '2026-01-31 17:00:00' AS stamp
  UNION ALL SELECT '2026-02', '202602', '02/2026', 80, 71, 59, 5, '2026-02-28 17:00:00'
  UNION ALL SELECT '2026-03', '202603', '03/2026', 83, 75, 65, 4, '2026-03-31 17:00:00'
  UNION ALL SELECT '2026-04', '202604', '04/2026', 86, 79, 72, 3, '2026-04-30 17:00:00'
  UNION ALL SELECT '2026-05', '202605', '05/2026', 89, 84, 80, 2, '2026-05-31 17:00:00'
  UNION ALL SELECT '2026-06', '202606', '06/2026', 91, 88, 87, 1, '2026-06-06 17:00:00'
),
mock_chart_departments AS (
  SELECT 'PE1' AS department_code, 'PED' AS division_code, 0 AS score_delta, 4 AS checklist_delta, 3 AS training_delta, 3 AS violation_risk, 64 AS headcount
  UNION ALL SELECT 'MP', 'PED', -5, -2, -4, 5, 42
  UNION ALL SELECT 'MT', 'PED', -4, -1, -3, 4, 36
  UNION ALL SELECT 'CM', 'PED', -6, -3, -5, 6, 38
  UNION ALL SELECT 'WM', 'PED', -7, -4, -4, 5, 32
  UNION ALL SELECT 'QA', 'QAD', 4, 5, 4, 1, 28
  UNION ALL SELECT 'GA', 'QAD', -3, 0, -2, 3, 24
  UNION ALL SELECT 'QC', 'QAD', -2, 3, 2, 2, 34
  UNION ALL SELECT 'CS', 'QAD', -1, 2, 0, 2, 20
  UNION ALL SELECT 'EHS', 'QAD', 6, 6, 5, 0, 12
  UNION ALL SELECT 'OS', 'QAD', -4, -1, -2, 3, 18
  UNION ALL SELECT 'MR', 'DD', 2, 1, 1, 2, 26
  UNION ALL SELECT 'RF', 'DD', -5, -2, -3, 5, 30
  UNION ALL SELECT 'DB', 'DD', -6, -4, -4, 6, 34
  UNION ALL SELECT 'DP1', 'DD', -7, -3, -5, 6, 29
  UNION ALL SELECT 'DP2', 'DD', -8, -5, -6, 7, 31
  UNION ALL SELECT 'OK1', 'SD', -1, 2, 1, 2, 26
  UNION ALL SELECT 'OK2', 'SD', -6, -1, -3, 5, 28
  UNION ALL SELECT 'SP1', 'SD', -5, 0, -2, 4, 22
  UNION ALL SELECT 'EBM', 'ED', -7, -4, -3, 5, 18
  UNION ALL SELECT 'ETR', 'ED', -2, 1, 1, 2, 16
  UNION ALL SELECT 'MS1', 'ED', -8, -5, -4, 7, 40
  UNION ALL SELECT 'SA', 'ED', -3, 2, 0, 3, 20
  UNION ALL SELECT 'MS2', 'ED', -9, -6, -5, 8, 44
)
SELECT
  CONCAT('mock-chart-kpi-score-', months.period_key, '-', departments.department_code),
  CONCAT('CHART-KPI-SCORE-', months.period_key, '-', departments.department_code),
  'safety_score_monthly',
  'month',
  months.period,
  departments.department_code,
  departments.division_code,
  LEAST(99, GREATEST(55, months.score_base + departments.score_delta)),
  95,
  'điểm',
  CONCAT('Dữ liệu giả lập v18: điểm an toàn tháng ', months.month_label, ' của ', departments.department_code),
  'approved',
  NULL,
  NULL,
  'mock-chart-user',
  'Mock Chart Seed',
  departments.department_code,
  'mock-l1',
  'Mock L1 Reviewer',
  months.stamp,
  'mock-l2',
  'Mock EHS Reviewer',
  months.stamp,
  'Mock chart seed',
  'Mock chart seed',
  months.stamp,
  months.stamp
FROM mock_chart_months AS months
CROSS JOIN mock_chart_departments AS departments
WHERE 1 = 1
ON DUPLICATE KEY UPDATE
  entry_type = VALUES(entry_type), period_type = VALUES(period_type), period = VALUES(period),
  department_code = VALUES(department_code), division_code = VALUES(division_code), value = VALUES(value),
  target = VALUES(target), unit = VALUES(unit), notes = VALUES(notes), approval_status = VALUES(approval_status),
  l1_approved_by_id = VALUES(l1_approved_by_id), l1_approved_by_name = VALUES(l1_approved_by_name),
  l1_approved_at = VALUES(l1_approved_at), l2_approved_by_id = VALUES(l2_approved_by_id),
  l2_approved_by_name = VALUES(l2_approved_by_name), l2_approved_at = VALUES(l2_approved_at),
  updated_by_name = VALUES(updated_by_name), updated_at = VALUES(updated_at);

INSERT INTO safety_kpi_entries
  (id, code, entry_type, period_type, period, department_code, division_code, value, target, unit, notes,
   approval_status, rejection_reason, rejected_by_level, submitted_by_id, submitted_by_name, submitted_by_dept,
   l1_approved_by_id, l1_approved_by_name, l1_approved_at, l2_approved_by_id, l2_approved_by_name, l2_approved_at,
   created_by_name, updated_by_name, created_at, updated_at)
WITH mock_chart_months AS (
  SELECT '2026-01' AS period, '202601' AS period_key, '01/2026' AS month_label, 78 AS score_base, 68 AS checklist_base, 54 AS training_base, 6 AS violation_base, '2026-01-31 17:00:00' AS stamp
  UNION ALL SELECT '2026-02', '202602', '02/2026', 80, 71, 59, 5, '2026-02-28 17:00:00'
  UNION ALL SELECT '2026-03', '202603', '03/2026', 83, 75, 65, 4, '2026-03-31 17:00:00'
  UNION ALL SELECT '2026-04', '202604', '04/2026', 86, 79, 72, 3, '2026-04-30 17:00:00'
  UNION ALL SELECT '2026-05', '202605', '05/2026', 89, 84, 80, 2, '2026-05-31 17:00:00'
  UNION ALL SELECT '2026-06', '202606', '06/2026', 91, 88, 87, 1, '2026-06-06 17:00:00'
),
mock_chart_departments AS (
  SELECT 'PE1' AS department_code, 'PED' AS division_code, 0 AS score_delta, 4 AS checklist_delta, 3 AS training_delta, 3 AS violation_risk, 64 AS headcount
  UNION ALL SELECT 'MP', 'PED', -5, -2, -4, 5, 42
  UNION ALL SELECT 'MT', 'PED', -4, -1, -3, 4, 36
  UNION ALL SELECT 'CM', 'PED', -6, -3, -5, 6, 38
  UNION ALL SELECT 'WM', 'PED', -7, -4, -4, 5, 32
  UNION ALL SELECT 'QA', 'QAD', 4, 5, 4, 1, 28
  UNION ALL SELECT 'GA', 'QAD', -3, 0, -2, 3, 24
  UNION ALL SELECT 'QC', 'QAD', -2, 3, 2, 2, 34
  UNION ALL SELECT 'CS', 'QAD', -1, 2, 0, 2, 20
  UNION ALL SELECT 'EHS', 'QAD', 6, 6, 5, 0, 12
  UNION ALL SELECT 'OS', 'QAD', -4, -1, -2, 3, 18
  UNION ALL SELECT 'MR', 'DD', 2, 1, 1, 2, 26
  UNION ALL SELECT 'RF', 'DD', -5, -2, -3, 5, 30
  UNION ALL SELECT 'DB', 'DD', -6, -4, -4, 6, 34
  UNION ALL SELECT 'DP1', 'DD', -7, -3, -5, 6, 29
  UNION ALL SELECT 'DP2', 'DD', -8, -5, -6, 7, 31
  UNION ALL SELECT 'OK1', 'SD', -1, 2, 1, 2, 26
  UNION ALL SELECT 'OK2', 'SD', -6, -1, -3, 5, 28
  UNION ALL SELECT 'SP1', 'SD', -5, 0, -2, 4, 22
  UNION ALL SELECT 'EBM', 'ED', -7, -4, -3, 5, 18
  UNION ALL SELECT 'ETR', 'ED', -2, 1, 1, 2, 16
  UNION ALL SELECT 'MS1', 'ED', -8, -5, -4, 7, 40
  UNION ALL SELECT 'SA', 'ED', -3, 2, 0, 3, 20
  UNION ALL SELECT 'MS2', 'ED', -9, -6, -5, 8, 44
)
SELECT
  CONCAT('mock-chart-kpi-checklist-', months.period_key, '-', departments.department_code),
  CONCAT('CHART-KPI-CHECKLIST-', months.period_key, '-', departments.department_code),
  'checklist_daily',
  'month',
  months.period,
  departments.department_code,
  departments.division_code,
  LEAST(100, GREATEST(45, months.checklist_base + departments.checklist_delta)),
  80,
  '%',
  CONCAT('Dữ liệu giả lập v18: hoàn thành checklist 6S tháng ', months.month_label, ' của ', departments.department_code),
  'approved',
  NULL,
  NULL,
  'mock-chart-user',
  'Mock Chart Seed',
  departments.department_code,
  'mock-l1',
  'Mock L1 Reviewer',
  months.stamp,
  'mock-l2',
  'Mock EHS Reviewer',
  months.stamp,
  'Mock chart seed',
  'Mock chart seed',
  months.stamp,
  months.stamp
FROM mock_chart_months AS months
CROSS JOIN mock_chart_departments AS departments
WHERE 1 = 1
ON DUPLICATE KEY UPDATE
  entry_type = VALUES(entry_type), period_type = VALUES(period_type), period = VALUES(period),
  department_code = VALUES(department_code), division_code = VALUES(division_code), value = VALUES(value),
  target = VALUES(target), unit = VALUES(unit), notes = VALUES(notes), approval_status = VALUES(approval_status),
  l1_approved_by_id = VALUES(l1_approved_by_id), l1_approved_by_name = VALUES(l1_approved_by_name),
  l1_approved_at = VALUES(l1_approved_at), l2_approved_by_id = VALUES(l2_approved_by_id),
  l2_approved_by_name = VALUES(l2_approved_by_name), l2_approved_at = VALUES(l2_approved_at),
  updated_by_name = VALUES(updated_by_name), updated_at = VALUES(updated_at);

INSERT INTO safety_kpi_entries
  (id, code, entry_type, period_type, period, department_code, division_code, value, target, unit, notes,
   approval_status, rejection_reason, rejected_by_level, submitted_by_id, submitted_by_name, submitted_by_dept,
   l1_approved_by_id, l1_approved_by_name, l1_approved_at, l2_approved_by_id, l2_approved_by_name, l2_approved_at,
   created_by_name, updated_by_name, created_at, updated_at)
WITH mock_chart_months AS (
  SELECT '2026-01' AS period, '202601' AS period_key, '01/2026' AS month_label, 78 AS score_base, 68 AS checklist_base, 54 AS training_base, 6 AS violation_base, '2026-01-31 17:00:00' AS stamp
  UNION ALL SELECT '2026-02', '202602', '02/2026', 80, 71, 59, 5, '2026-02-28 17:00:00'
  UNION ALL SELECT '2026-03', '202603', '03/2026', 83, 75, 65, 4, '2026-03-31 17:00:00'
  UNION ALL SELECT '2026-04', '202604', '04/2026', 86, 79, 72, 3, '2026-04-30 17:00:00'
  UNION ALL SELECT '2026-05', '202605', '05/2026', 89, 84, 80, 2, '2026-05-31 17:00:00'
  UNION ALL SELECT '2026-06', '202606', '06/2026', 91, 88, 87, 1, '2026-06-06 17:00:00'
),
mock_chart_departments AS (
  SELECT 'PE1' AS department_code, 'PED' AS division_code, 0 AS score_delta, 4 AS checklist_delta, 3 AS training_delta, 3 AS violation_risk, 64 AS headcount
  UNION ALL SELECT 'MP', 'PED', -5, -2, -4, 5, 42
  UNION ALL SELECT 'MT', 'PED', -4, -1, -3, 4, 36
  UNION ALL SELECT 'CM', 'PED', -6, -3, -5, 6, 38
  UNION ALL SELECT 'WM', 'PED', -7, -4, -4, 5, 32
  UNION ALL SELECT 'QA', 'QAD', 4, 5, 4, 1, 28
  UNION ALL SELECT 'GA', 'QAD', -3, 0, -2, 3, 24
  UNION ALL SELECT 'QC', 'QAD', -2, 3, 2, 2, 34
  UNION ALL SELECT 'CS', 'QAD', -1, 2, 0, 2, 20
  UNION ALL SELECT 'EHS', 'QAD', 6, 6, 5, 0, 12
  UNION ALL SELECT 'OS', 'QAD', -4, -1, -2, 3, 18
  UNION ALL SELECT 'MR', 'DD', 2, 1, 1, 2, 26
  UNION ALL SELECT 'RF', 'DD', -5, -2, -3, 5, 30
  UNION ALL SELECT 'DB', 'DD', -6, -4, -4, 6, 34
  UNION ALL SELECT 'DP1', 'DD', -7, -3, -5, 6, 29
  UNION ALL SELECT 'DP2', 'DD', -8, -5, -6, 7, 31
  UNION ALL SELECT 'OK1', 'SD', -1, 2, 1, 2, 26
  UNION ALL SELECT 'OK2', 'SD', -6, -1, -3, 5, 28
  UNION ALL SELECT 'SP1', 'SD', -5, 0, -2, 4, 22
  UNION ALL SELECT 'EBM', 'ED', -7, -4, -3, 5, 18
  UNION ALL SELECT 'ETR', 'ED', -2, 1, 1, 2, 16
  UNION ALL SELECT 'MS1', 'ED', -8, -5, -4, 7, 40
  UNION ALL SELECT 'SA', 'ED', -3, 2, 0, 3, 20
  UNION ALL SELECT 'MS2', 'ED', -9, -6, -5, 8, 44
)
SELECT
  CONCAT('mock-chart-kpi-training-', months.period_key, '-', departments.department_code),
  CONCAT('CHART-KPI-TRAINING-', months.period_key, '-', departments.department_code),
  'training_monthly',
  'month',
  months.period,
  departments.department_code,
  departments.division_code,
  LEAST(100, GREATEST(35, months.training_base + departments.training_delta)),
  100,
  '%',
  CONCAT('Dữ liệu giả lập v18: tỷ lệ đào tạo an toàn tháng ', months.month_label, ' của ', departments.department_code),
  'approved',
  NULL,
  NULL,
  'mock-chart-user',
  'Mock Chart Seed',
  departments.department_code,
  'mock-l1',
  'Mock L1 Reviewer',
  months.stamp,
  'mock-l2',
  'Mock EHS Reviewer',
  months.stamp,
  'Mock chart seed',
  'Mock chart seed',
  months.stamp,
  months.stamp
FROM mock_chart_months AS months
CROSS JOIN mock_chart_departments AS departments
WHERE 1 = 1
ON DUPLICATE KEY UPDATE
  entry_type = VALUES(entry_type), period_type = VALUES(period_type), period = VALUES(period),
  department_code = VALUES(department_code), division_code = VALUES(division_code), value = VALUES(value),
  target = VALUES(target), unit = VALUES(unit), notes = VALUES(notes), approval_status = VALUES(approval_status),
  l1_approved_by_id = VALUES(l1_approved_by_id), l1_approved_by_name = VALUES(l1_approved_by_name),
  l1_approved_at = VALUES(l1_approved_at), l2_approved_by_id = VALUES(l2_approved_by_id),
  l2_approved_by_name = VALUES(l2_approved_by_name), l2_approved_at = VALUES(l2_approved_at),
  updated_by_name = VALUES(updated_by_name), updated_at = VALUES(updated_at);

INSERT INTO safety_kpi_entries
  (id, code, entry_type, period_type, period, department_code, division_code, value, target, unit, notes,
   approval_status, rejection_reason, rejected_by_level, submitted_by_id, submitted_by_name, submitted_by_dept,
   l1_approved_by_id, l1_approved_by_name, l1_approved_at, l2_approved_by_id, l2_approved_by_name, l2_approved_at,
   created_by_name, updated_by_name, created_at, updated_at)
WITH mock_chart_departments AS (
  SELECT 'PE1' AS department_code, 'PED' AS division_code, 0 AS score_delta, 4 AS checklist_delta, 3 AS training_delta, 3 AS violation_risk, 64 AS headcount
  UNION ALL SELECT 'MP', 'PED', -5, -2, -4, 5, 42
  UNION ALL SELECT 'MT', 'PED', -4, -1, -3, 4, 36
  UNION ALL SELECT 'CM', 'PED', -6, -3, -5, 6, 38
  UNION ALL SELECT 'WM', 'PED', -7, -4, -4, 5, 32
  UNION ALL SELECT 'QA', 'QAD', 4, 5, 4, 1, 28
  UNION ALL SELECT 'GA', 'QAD', -3, 0, -2, 3, 24
  UNION ALL SELECT 'QC', 'QAD', -2, 3, 2, 2, 34
  UNION ALL SELECT 'CS', 'QAD', -1, 2, 0, 2, 20
  UNION ALL SELECT 'EHS', 'QAD', 6, 6, 5, 0, 12
  UNION ALL SELECT 'OS', 'QAD', -4, -1, -2, 3, 18
  UNION ALL SELECT 'MR', 'DD', 2, 1, 1, 2, 26
  UNION ALL SELECT 'RF', 'DD', -5, -2, -3, 5, 30
  UNION ALL SELECT 'DB', 'DD', -6, -4, -4, 6, 34
  UNION ALL SELECT 'DP1', 'DD', -7, -3, -5, 6, 29
  UNION ALL SELECT 'DP2', 'DD', -8, -5, -6, 7, 31
  UNION ALL SELECT 'OK1', 'SD', -1, 2, 1, 2, 26
  UNION ALL SELECT 'OK2', 'SD', -6, -1, -3, 5, 28
  UNION ALL SELECT 'SP1', 'SD', -5, 0, -2, 4, 22
  UNION ALL SELECT 'EBM', 'ED', -7, -4, -3, 5, 18
  UNION ALL SELECT 'ETR', 'ED', -2, 1, 1, 2, 16
  UNION ALL SELECT 'MS1', 'ED', -8, -5, -4, 7, 40
  UNION ALL SELECT 'SA', 'ED', -3, 2, 0, 3, 20
  UNION ALL SELECT 'MS2', 'ED', -9, -6, -5, 8, 44
)
SELECT
  CONCAT('mock-chart-kpi-violation-202606-', departments.department_code),
  CONCAT('CHART-KPI-VIOLATION-202606-', departments.department_code),
  'violation_warning',
  'month',
  '2026-06',
  departments.department_code,
  departments.division_code,
  GREATEST(0, departments.violation_risk),
  0,
  'lần',
  CONCAT('Dữ liệu giả lập v18: số vi phạm/cảnh báo tháng 06/2026 của ', departments.department_code),
  'approved',
  NULL,
  NULL,
  'mock-chart-user',
  'Mock Chart Seed',
  departments.department_code,
  'mock-l1',
  'Mock L1 Reviewer',
  '2026-06-06 17:00:00',
  'mock-l2',
  'Mock EHS Reviewer',
  '2026-06-06 17:00:00',
  'Mock chart seed',
  'Mock chart seed',
  '2026-06-06 17:00:00',
  '2026-06-06 17:00:00'
FROM mock_chart_departments AS departments
WHERE 1 = 1
ON DUPLICATE KEY UPDATE
  entry_type = VALUES(entry_type), period_type = VALUES(period_type), period = VALUES(period),
  department_code = VALUES(department_code), division_code = VALUES(division_code), value = VALUES(value),
  target = VALUES(target), unit = VALUES(unit), notes = VALUES(notes), approval_status = VALUES(approval_status),
  updated_by_name = VALUES(updated_by_name), updated_at = VALUES(updated_at);

INSERT IGNORE INTO safety_checklist_submissions
  (department_code, period, item_id, checked, submitted_by_id, submitted_by_name, created_at, updated_at)
WITH mock_chart_months AS (
  SELECT '2026-01' AS period, '202601' AS period_key, '01/2026' AS month_label, 78 AS score_base, 68 AS checklist_base, 54 AS training_base, 6 AS violation_base, '2026-01-31 17:00:00' AS stamp
  UNION ALL SELECT '2026-02', '202602', '02/2026', 80, 71, 59, 5, '2026-02-28 17:00:00'
  UNION ALL SELECT '2026-03', '202603', '03/2026', 83, 75, 65, 4, '2026-03-31 17:00:00'
  UNION ALL SELECT '2026-04', '202604', '04/2026', 86, 79, 72, 3, '2026-04-30 17:00:00'
  UNION ALL SELECT '2026-05', '202605', '05/2026', 89, 84, 80, 2, '2026-05-31 17:00:00'
  UNION ALL SELECT '2026-06', '202606', '06/2026', 91, 88, 87, 1, '2026-06-06 17:00:00'
),
mock_chart_departments AS (
  SELECT 'PE1' AS department_code, 'PED' AS division_code, 0 AS score_delta, 4 AS checklist_delta, 3 AS training_delta, 3 AS violation_risk, 64 AS headcount
  UNION ALL SELECT 'MP', 'PED', -5, -2, -4, 5, 42
  UNION ALL SELECT 'MT', 'PED', -4, -1, -3, 4, 36
  UNION ALL SELECT 'CM', 'PED', -6, -3, -5, 6, 38
  UNION ALL SELECT 'WM', 'PED', -7, -4, -4, 5, 32
  UNION ALL SELECT 'QA', 'QAD', 4, 5, 4, 1, 28
  UNION ALL SELECT 'GA', 'QAD', -3, 0, -2, 3, 24
  UNION ALL SELECT 'QC', 'QAD', -2, 3, 2, 2, 34
  UNION ALL SELECT 'CS', 'QAD', -1, 2, 0, 2, 20
  UNION ALL SELECT 'EHS', 'QAD', 6, 6, 5, 0, 12
  UNION ALL SELECT 'OS', 'QAD', -4, -1, -2, 3, 18
  UNION ALL SELECT 'MR', 'DD', 2, 1, 1, 2, 26
  UNION ALL SELECT 'RF', 'DD', -5, -2, -3, 5, 30
  UNION ALL SELECT 'DB', 'DD', -6, -4, -4, 6, 34
  UNION ALL SELECT 'DP1', 'DD', -7, -3, -5, 6, 29
  UNION ALL SELECT 'DP2', 'DD', -8, -5, -6, 7, 31
  UNION ALL SELECT 'OK1', 'SD', -1, 2, 1, 2, 26
  UNION ALL SELECT 'OK2', 'SD', -6, -1, -3, 5, 28
  UNION ALL SELECT 'SP1', 'SD', -5, 0, -2, 4, 22
  UNION ALL SELECT 'EBM', 'ED', -7, -4, -3, 5, 18
  UNION ALL SELECT 'ETR', 'ED', -2, 1, 1, 2, 16
  UNION ALL SELECT 'MS1', 'ED', -8, -5, -4, 7, 40
  UNION ALL SELECT 'SA', 'ED', -3, 2, 0, 3, 20
  UNION ALL SELECT 'MS2', 'ED', -9, -6, -5, 8, 44
),
mock_chart_items AS (
  SELECT 1 AS item_id
  UNION ALL SELECT 2
  UNION ALL SELECT 3
  UNION ALL SELECT 4
  UNION ALL SELECT 5
  UNION ALL SELECT 6
  UNION ALL SELECT 7
  UNION ALL SELECT 8
  UNION ALL SELECT 9
  UNION ALL SELECT 10
  UNION ALL SELECT 11
  UNION ALL SELECT 12
  UNION ALL SELECT 13
  UNION ALL SELECT 14
  UNION ALL SELECT 15
  UNION ALL SELECT 16
  UNION ALL SELECT 17
  UNION ALL SELECT 18
  UNION ALL SELECT 19
  UNION ALL SELECT 20
)
SELECT
  departments.department_code,
  months.period,
  items.item_id,
  CASE
    WHEN items.item_id <= FLOOR((LEAST(100, GREATEST(45, months.checklist_base + departments.checklist_delta)) / 100) * 20) THEN 1
    ELSE 0
  END,
  'mock-chart-user',
  'Mock Chart Seed',
  months.stamp,
  months.stamp
FROM mock_chart_months AS months
CROSS JOIN mock_chart_departments AS departments
CROSS JOIN mock_chart_items AS items
WHERE departments.department_code IN ('PE1', 'QA', 'MR', 'EHS', 'ETR', 'MS1', 'GA', 'QC');

INSERT INTO safety_reports
  (id, code, title, type, period, department, creator, status, notes, created_by_id, created_by_name, updated_by_name, created_at, updated_at)
WITH mock_chart_months AS (
  SELECT '2026-01' AS period, '202601' AS period_key, '01/2026' AS month_label, 78 AS score_base, 68 AS checklist_base, 54 AS training_base, 6 AS violation_base, '2026-01-31 17:00:00' AS stamp
  UNION ALL SELECT '2026-02', '202602', '02/2026', 80, 71, 59, 5, '2026-02-28 17:00:00'
  UNION ALL SELECT '2026-03', '202603', '03/2026', 83, 75, 65, 4, '2026-03-31 17:00:00'
  UNION ALL SELECT '2026-04', '202604', '04/2026', 86, 79, 72, 3, '2026-04-30 17:00:00'
  UNION ALL SELECT '2026-05', '202605', '05/2026', 89, 84, 80, 2, '2026-05-31 17:00:00'
  UNION ALL SELECT '2026-06', '202606', '06/2026', 91, 88, 87, 1, '2026-06-06 17:00:00'
)
SELECT
  CONCAT('mock-chart-report-', months.period_key, '-', divisions.division_code),
  CONCAT('CHART-RPT-', months.period_key, '-', divisions.division_code),
  CONCAT('Báo cáo Safety - 6S tháng ', months.month_label, ' khối ', divisions.division_code),
  'Tháng',
  months.period,
  divisions.division_code,
  'EHS Officer',
  CASE WHEN months.period = '2026-06' THEN 'Đang lập' ELSE 'Đã phát hành' END,
  CONCAT('Dữ liệu giả lập cho chart báo cáo: cảnh báo, sự cố, checklist và đào tạo khối ', divisions.division_code, '.'),
  'mock-chart-user',
  'Mock Chart Seed',
  'Mock chart seed',
  months.stamp,
  months.stamp
FROM mock_chart_months AS months
CROSS JOIN (
  SELECT 'PED' AS division_code
  UNION ALL SELECT 'QAD'
  UNION ALL SELECT 'DD'
  UNION ALL SELECT 'SD'
  UNION ALL SELECT 'ED'
) AS divisions
WHERE 1 = 1
ON DUPLICATE KEY UPDATE
  title = VALUES(title), type = VALUES(type), period = VALUES(period), department = VALUES(department),
  creator = VALUES(creator), status = VALUES(status), notes = VALUES(notes), updated_by_name = VALUES(updated_by_name),
  updated_at = VALUES(updated_at);

INSERT INTO safety_training_courses
  (id, code, name, category, trainer, duration, department, enrolled, completed, due_date, status, notes,
   created_by_id, created_by_name, updated_by_name, created_at, updated_at)
WITH mock_chart_departments AS (
  SELECT 'PE1' AS department_code, 'PED' AS division_code, 0 AS score_delta, 4 AS checklist_delta, 3 AS training_delta, 3 AS violation_risk, 64 AS headcount
  UNION ALL SELECT 'MP', 'PED', -5, -2, -4, 5, 42
  UNION ALL SELECT 'MT', 'PED', -4, -1, -3, 4, 36
  UNION ALL SELECT 'CM', 'PED', -6, -3, -5, 6, 38
  UNION ALL SELECT 'WM', 'PED', -7, -4, -4, 5, 32
  UNION ALL SELECT 'QA', 'QAD', 4, 5, 4, 1, 28
  UNION ALL SELECT 'GA', 'QAD', -3, 0, -2, 3, 24
  UNION ALL SELECT 'QC', 'QAD', -2, 3, 2, 2, 34
  UNION ALL SELECT 'CS', 'QAD', -1, 2, 0, 2, 20
  UNION ALL SELECT 'EHS', 'QAD', 6, 6, 5, 0, 12
  UNION ALL SELECT 'OS', 'QAD', -4, -1, -2, 3, 18
  UNION ALL SELECT 'MR', 'DD', 2, 1, 1, 2, 26
  UNION ALL SELECT 'RF', 'DD', -5, -2, -3, 5, 30
  UNION ALL SELECT 'DB', 'DD', -6, -4, -4, 6, 34
  UNION ALL SELECT 'DP1', 'DD', -7, -3, -5, 6, 29
  UNION ALL SELECT 'DP2', 'DD', -8, -5, -6, 7, 31
  UNION ALL SELECT 'OK1', 'SD', -1, 2, 1, 2, 26
  UNION ALL SELECT 'OK2', 'SD', -6, -1, -3, 5, 28
  UNION ALL SELECT 'SP1', 'SD', -5, 0, -2, 4, 22
  UNION ALL SELECT 'EBM', 'ED', -7, -4, -3, 5, 18
  UNION ALL SELECT 'ETR', 'ED', -2, 1, 1, 2, 16
  UNION ALL SELECT 'MS1', 'ED', -8, -5, -4, 7, 40
  UNION ALL SELECT 'SA', 'ED', -3, 2, 0, 3, 20
  UNION ALL SELECT 'MS2', 'ED', -9, -6, -5, 8, 44
)
SELECT
  CONCAT('mock-chart-training-202606-', departments.department_code),
  CONCAT('CHART-TRN-202606-', departments.department_code),
  CONCAT('Đào tạo Safety - 6S tháng 06/2026 - ', departments.department_code),
  CASE
    WHEN departments.division_code = 'PED' THEN 'ATVSLĐ'
    WHEN departments.division_code = 'QAD' THEN 'PCCC / Hóa chất'
    WHEN departments.division_code = 'DD' THEN 'LOTO / Thiết bị'
    WHEN departments.division_code = 'SD' THEN '6S hiện trường'
    ELSE 'Máy móc / Điện'
  END,
  CASE WHEN departments.division_code IN ('QAD', 'DD') THEN 'EHS + Leader bộ phận' ELSE 'EHS Officer' END,
  '2 giờ',
  departments.department_code,
  departments.headcount,
  ROUND(departments.headcount * (LEAST(100, GREATEST(35, 87 + departments.training_delta)) / 100)),
  DATE_ADD('2026-06-12', INTERVAL GREATEST(0, departments.violation_risk) DAY),
  CASE
    WHEN LEAST(100, GREATEST(35, 87 + departments.training_delta)) >= 92 THEN 'Hoàn thành'
    WHEN LEAST(100, GREATEST(35, 87 + departments.training_delta)) >= 75 THEN 'Đang diễn ra'
    ELSE 'Quá hạn'
  END,
  CONCAT('Khóa giả lập dùng để kiểm tra tiến độ đào tạo và bộ lọc theo bộ phận ', departments.department_code, '.'),
  'mock-chart-user',
  'Mock Chart Seed',
  'Mock chart seed',
  '2026-06-06 17:30:00',
  '2026-06-06 17:30:00'
FROM mock_chart_departments AS departments
WHERE 1 = 1
ON DUPLICATE KEY UPDATE
  name = VALUES(name), category = VALUES(category), trainer = VALUES(trainer), duration = VALUES(duration),
  department = VALUES(department), enrolled = VALUES(enrolled), completed = VALUES(completed), due_date = VALUES(due_date),
  status = VALUES(status), notes = VALUES(notes), updated_by_name = VALUES(updated_by_name), updated_at = VALUES(updated_at);

COMMIT;
