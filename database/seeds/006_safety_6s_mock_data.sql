-- MHChub Safety - 6S mock operational data.
-- Generated for dashboard aggregation and chart testing.
-- Import after database/migrations/005_safety_operations_schema.sql.

SET NAMES utf8mb4;
START TRANSACTION;

INSERT INTO safety_warnings
  (id, code, title, category, subcategory, department, area, risk_probability, risk_consequence, risk_score, risk_level,
   description, current_control, proposed_action, responsible_person, deadline, reporter_name, evidence_notes, related_standard,
   status, approval_status, rejection_reason, submitted_by_dept, submitted_by_id, submitted_by_name, created_by_name,
   updated_by_name, created_at, updated_at)
VALUES
  ('mock-warning-001','MOCK-WARN-001','Dây đeo thẻ gần cơ cấu quay tại máy Namashi','6S','An toàn máy','production','PY2 - MS1 Namashi',5,4,20,'Cực kỳ nghiêm trọng','Công nhân vận hành còn đeo dây thẻ dạng cổ khi đứng gần trục quay và pulley hở.','Đã nhắc miệng trong ca nhưng chưa có quy định trực quan tại máy.','Ban hành quy định dây thẻ ngắn hoặc kẹp áo, dán cảnh báo tại máy, xác nhận lại trong họp đầu ca.','Line Leader MS1','2026-06-05','Auditor 6S','Ảnh hiện trường: máy Namashi, thẻ đeo dạng cổ.','S6 Safety / Machine guarding','Mở','Đã duyệt',NULL,'production','mock-user-ehs','EHS Officer','System seed','System seed','2026-06-02 08:00:00','2026-06-02 08:00:00'),
  ('mock-warning-002','MOCK-WARN-002','Pallet che khuất tủ PCCC và bình chữa cháy','PCCC','Lối tiếp cận thiết bị','warehouse','Kho nguyên vật liệu - cửa D2',4,4,16,'Cực kỳ nghiêm trọng','Một cụm pallet rỗng đặt sát tủ PCCC, giảm khả năng tiếp cận khi có báo cháy.','Có vạch đỏ nhưng bị mờ và thiếu biển không che chắn.','Sơn lại vùng cấm, dán biển, kiểm tra cuối mỗi ca và đưa vào checklist kho.','Warehouse Supervisor','2026-06-06','EHS Officer','Ảnh pallet chắn tủ PCCC.','PCCC / S6 Safety','Đang xử lý','Đã duyệt',NULL,'warehouse','mock-user-ehs','EHS Officer','System seed','System seed','2026-06-03 09:10:00','2026-06-03 09:10:00'),
  ('mock-warning-003','MOCK-WARN-003','Tủ điện CR3 thiếu nắp che và hướng dẫn tiếng Việt','An toàn điện','Tủ điện','engineering','CR3 - cạnh thang hàng',4,5,20,'Cực kỳ nghiêm trọng','Tủ điện cạnh thang hàng có điểm đấu nối chưa che kín và thiếu hướng dẫn thao tác an toàn bằng tiếng Việt.','Có khóa tủ nhưng tem cảnh báo đã bong và chưa có hướng dẫn xử lý bất thường.','Bổ sung nắp che, tem cảnh báo, hướng dẫn tiếng Việt và xác nhận ảnh sau cải tiến.','Maintenance Lead','2026-06-10','EHS Officer','Ảnh tủ điện và tem cảnh báo bong.','Electrical safety / S6','Mở','Đã duyệt',NULL,'engineering','mock-user-ehs','EHS Officer','System seed','System seed','2026-06-03 10:00:00','2026-06-03 10:00:00'),
  ('mock-warning-004','MOCK-WARN-004','Dầu rò tại lối đi cạnh máy ép','6S','Sạch sẽ - trượt ngã','production','PY1 - line ép nhựa',4,4,16,'Cực kỳ nghiêm trọng','Dầu thủy lực rò ra mép lối đi, có dấu chân kéo dài sang vùng thao tác.','Đã đặt khăn thấm tạm thời nhưng chưa sửa nguyên nhân rò.','Cô lập khu vực, sửa điểm rò, vệ sinh sàn và thêm kiểm tra đầu ca trong 7 ngày.','Production Supervisor','2026-06-08','Auditor 6S','Ảnh vệt dầu và vết chân.','S3 Shine / S6 Safety','Đang xử lý','Đã duyệt',NULL,'production','mock-user-ehs','Auditor 6S','System seed','System seed','2026-06-04 13:30:00','2026-06-04 13:30:00'),
  ('mock-warning-005','MOCK-WARN-005','Chai hóa chất kiểm tra thiếu nhãn phụ và SDS tại điểm dùng','Hóa chất','Nhãn/SDS','quality','QA Lab - bàn kiểm tra hóa chất',3,5,15,'Nghiêm trọng','Một số chai chiết nhỏ chỉ ghi mã viết tay, thiếu tên hóa chất, nồng độ và tham chiếu SDS.','SDS bản tổng có trong thư mục chung nhưng không có tại điểm dùng.','Chuẩn hóa nhãn phụ, đặt QR SDS tại bàn, kiểm kê chai chiết cuối ngày.','QA Supervisor','2026-06-07','QA Auditor','Danh sách 5 chai chiết cần cập nhật nhãn.','Chemical safety / S1 / S6','Mở','Chờ duyệt',NULL,'quality','mock-user-qa','QA Auditor','System seed','System seed','2026-06-04 15:00:00','2026-06-04 15:00:00'),
  ('mock-warning-006','MOCK-WARN-006','Lối thoát hiểm văn phòng bị thùng tài liệu chắn một phần','Thoát hiểm','Lối đi','office','Office - cửa thoát hiểm phía Tây',3,4,12,'Nghiêm trọng','Thùng tài liệu cũ đặt sát lối thoát hiểm, làm hẹp bề rộng di chuyển.','Có biển exit nhưng không có vùng cấm để đồ.','Di chuyển tài liệu, kẻ vùng cấm, giao Admin kiểm tra mỗi chiều thứ Sáu.','Admin','2026-06-06','EHS Patrol','Ảnh lối thoát hiểm bị chắn.','Emergency exit / S2 / S6','Mở','Đã duyệt',NULL,'office','mock-user-ehs','EHS Patrol','System seed','System seed','2026-06-05 08:20:00','2026-06-05 08:20:00'),
  ('mock-warning-007','MOCK-WARN-007','Pallet hư hỏng vẫn dùng tại tuyến xe nâng','Kho vận','Pallet hỏng','warehouse','Kho thành phẩm - lane F3',3,4,12,'Nghiêm trọng','Pallet nứt cạnh vẫn được sử dụng để xếp hàng, có nguy cơ đổ hàng khi xe nâng quay đầu.','Chưa có khu cách ly pallet hỏng rõ ràng.','Lập vị trí cách ly pallet hỏng, dán nhãn đỏ và ghi nhận trong bàn giao ca.','Warehouse Leader','2026-06-12','Forklift Driver','Ảnh pallet nứt cạnh.','Forklift / S1 / S6','Mở','Đã duyệt',NULL,'warehouse','mock-user-wh','Warehouse Leader','System seed','System seed','2026-05-28 09:00:00','2026-05-28 09:00:00'),
  ('mock-warning-008','MOCK-WARN-008','Cạnh jig sắc chưa có bảo vệ tay','An toàn thao tác','Jig sắc cạnh','production','Line kiểm tra ngoại quan',3,3,9,'Nghiêm trọng','Cạnh jig kiểm tra có ba via, người thao tác phải đưa tay sát cạnh sắc.','Có găng tay nhưng chưa xử lý vật lý tại jig.','Mài cạnh, bọc nẹp bảo vệ và cập nhật tiêu chuẩn kiểm jig sau sửa chữa.','Line Leader QA','2026-06-14','Operator','Ghi chú thao tác và vị trí jig.','Hand injury / S6','Đang xử lý','Đã duyệt',NULL,'production','mock-user-prod','Operator','System seed','System seed','2026-05-24 14:00:00','2026-05-24 14:00:00'),
  ('mock-warning-009','MOCK-WARN-009','Không khóa nguồn khi vệ sinh cảm biến trong máy','LOTO','Bảo trì ngắn','engineering','PY1 - cell đóng gói',4,5,20,'Cực kỳ nghiêm trọng','Kỹ thuật viên vệ sinh cảm biến khi máy ở chế độ chờ, chưa treo thẻ LOTO.','Có nút dừng khẩn nhưng chưa có checklist thao tác bảo trì ngắn.','Dừng vận hành để đào tạo lại LOTO, bổ sung mini checklist trước vệ sinh cảm biến.','Maintenance Lead','2026-06-09','EHS Patrol','Ghi nhận trong tuần tra sáng.','LOTO / S6','Mở','Đã duyệt',NULL,'engineering','mock-user-ehs','EHS Patrol','System seed','System seed','2026-05-26 11:00:00','2026-05-26 11:00:00'),
  ('mock-warning-010','MOCK-WARN-010','Nhãn FIFO không đồng nhất giữa thẻ kệ và tem thùng','6S','FIFO','warehouse','Kho WIP - rack B',3,2,6,'Trung bình','Một số kệ WIP có thẻ vị trí cũ, tem thùng mới không khớp thứ tự xuất.','Có kiểm kê tuần nhưng chưa kiểm tra sau đổi layout.','Cập nhật thẻ kệ, khóa layout trên sơ đồ kho và audit FIFO 2 lần/tuần.','Warehouse Supervisor','2026-05-31','Inventory Staff','Bảng đối chiếu vị trí kệ.','S2 / FIFO','Hoàn thành','Đã duyệt',NULL,'warehouse','mock-user-wh','Inventory Staff','System seed','System seed','2026-05-20 10:20:00','2026-06-01 16:00:00'),
  ('mock-warning-011','MOCK-WARN-011','Biểu mẫu TBM chưa cập nhật tình huống công việc không thường xuyên','Quản trị an toàn','TBM','ehs','EHS Office',2,3,6,'Trung bình','Biểu mẫu TBM hiện tại chưa có ô xác nhận mối nguy phát sinh từ công việc không thường xuyên.','Có file draft nhưng chưa ban hành cho toàn công ty.','Hoàn thiện form, thử nghiệm tại Production và Engineering, ban hành trước 30/06.','EHS Officer','2026-06-29','Safety Chair','Draft TBM v0.3.','S5 Sustain / TBM','Đang xử lý','Đã duyệt',NULL,'ehs','mock-user-ehs','Safety Chair','System seed','System seed','2026-05-22 09:40:00','2026-05-22 09:40:00'),
  ('mock-warning-012','MOCK-WARN-012','Mẫu NG và OK đặt chung khay trên bàn kiểm tra','Chất lượng','Phân loại mẫu','quality','QA/QC - bàn OQC',3,3,9,'Nghiêm trọng','Trong giờ cao điểm có khay mẫu NG đặt cạnh mẫu OK, màu nhãn khó phân biệt.','Có tem đỏ nhưng kích thước nhỏ và không tách khu vực.','Tách khay, dùng màu nền khác nhau và đưa ảnh chuẩn lên bảng thao tác.','QA Supervisor','2026-06-13','OQC Leader','Ảnh bàn OQC ca chiều.','S1 / S2 / Quality gate','Mở','Chờ duyệt',NULL,'quality','mock-user-qa','OQC Leader','System seed','System seed','2026-05-30 15:10:00','2026-05-30 15:10:00'),
  ('mock-warning-013','MOCK-WARN-013','Dụng cụ sau setup để ngoài vị trí quy định','6S','Sắp xếp dụng cụ','production','Line assembly - bàn setup',3,2,6,'Trung bình','Sau setup, cờ lê và dưỡng kiểm để lại trên bàn thao tác, không trả về shadow board.','Có shadow board nhưng thiếu ảnh vị trí chuẩn sau thay đổi dụng cụ.','Cập nhật ảnh shadow board, kiểm tra cuối ca và chấm điểm S2 theo line.','Production Supervisor','2026-06-18','6S Auditor','Ảnh bàn setup sau đổi mã hàng.','S2 Set in order','Mở','Đã duyệt',NULL,'production','mock-user-prod','6S Auditor','System seed','System seed','2026-04-24 13:30:00','2026-04-24 13:30:00'),
  ('mock-warning-014','MOCK-WARN-014','Ổ cắm dưới bàn văn phòng có dấu quá tải','An toàn điện','Điện văn phòng','office','Office - khu Admin',3,4,12,'Nghiêm trọng','Một ổ cắm kéo dài cấp nguồn cho nhiều thiết bị, dây nằm dưới lối chân ghế.','Có dây buộc nhưng chưa tách tải và chưa kiểm tra định mức.','Tách nguồn, cố định dây, dán nhãn tải tối đa và kiểm tra nhiệt sau 2 giờ vận hành.','Admin','2026-06-11','EHS Patrol','Ảnh ổ cắm và dây kéo dài.','Office electrical / S6','Đang xử lý','Đã duyệt',NULL,'office','mock-user-ehs','EHS Patrol','System seed','System seed','2026-04-27 08:30:00','2026-04-27 08:30:00'),
  ('mock-warning-015','MOCK-WARN-015','Dầu bảo trì để ngoài khay chống tràn','Hóa chất/dầu','Chống tràn','engineering','Kho bảo trì - kệ dầu',3,4,12,'Nghiêm trọng','Can dầu bảo trì đặt trực tiếp trên sàn, có vết loang nhỏ gần nắp can.','Có kệ riêng nhưng thiếu khay hứng cho can đang dùng dở.','Bổ sung khay chống tràn, nhãn tình trạng mở nắp và kiểm tra rò rỉ hàng ngày.','Maintenance Lead','2026-06-17','Storekeeper','Ảnh kệ dầu bảo trì.','Spill control / S3 / S6','Mở','Đã duyệt',NULL,'engineering','mock-user-eng','Storekeeper','System seed','System seed','2026-04-18 16:10:00','2026-04-18 16:10:00'),
  ('mock-warning-016','MOCK-WARN-016','Vạch phân luồng xe nâng bị mờ','Giao thông nội bộ','Vạch phân luồng','warehouse','Cửa nhập hàng - giao cắt người đi bộ',3,4,12,'Nghiêm trọng','Vạch phân luồng tại điểm giao cắt xe nâng/người đi bộ bị mờ, khó thấy khi nền bụi.','Có biển cảnh báo nhưng không đủ ở góc khuất.','Sơn lại vạch, thêm gương cầu và đưa điểm giao cắt vào tuần tra PCCC-6S.','Warehouse Supervisor','2026-06-20','EHS Patrol','Ảnh điểm giao cắt.','Traffic / S4 / S6','Mở','Đã duyệt',NULL,'warehouse','mock-user-ehs','EHS Patrol','System seed','System seed','2026-03-26 09:30:00','2026-03-26 09:30:00'),
  ('mock-warning-017','MOCK-WARN-017','Khu vực hố nước mưa thiếu cảnh báo và giới hạn phạm vi làm việc','Công việc không thường xuyên','Hố nước mưa','production','PY1 - sân sau nhà máy',4,4,16,'Cực kỳ nghiêm trọng','Khu vực thao tác nắp hố nước mưa chưa có cảnh báo cố định và rào chắn khi mở nắp.','Có hướng dẫn miệng sau tai nạn nhưng chưa chuẩn hóa thành quy trình.','Lập SOP mở nắp hố, bổ sung rào chắn di động, biển cảnh báo và TBM trước thao tác.','GA/EHS','2026-06-15','Safety Committee','Liên quan bài học TNLĐ hố nước mưa.','Non-routine work / S6','Đang xử lý','Đã duyệt',NULL,'production','mock-user-ehs','Safety Committee','System seed','System seed','2026-02-28 14:30:00','2026-02-28 14:30:00'),
  ('mock-warning-018','MOCK-WARN-018','Chưa đủ bằng chứng phổ biến nội dung họp an toàn tháng','Truyền thông an toàn','Theo dõi bằng chứng','ehs','Toàn công ty',2,3,6,'Trung bình','Một số bộ phận chưa gửi ảnh/hồ sơ phổ biến nội dung họp an toàn tháng 05/2026.','Có danh sách yêu cầu nhưng chưa theo dõi trạng thái theo bộ phận.','Tạo tracker theo bộ phận, yêu cầu ảnh họp đầu ca và xác nhận EHS cuối tháng.','EHS Officer','2026-06-30','Safety Chair','Danh sách bộ phận thiếu bằng chứng.','S5 Sustain / Communication','Mở','Đã duyệt',NULL,'ehs','mock-user-ehs','Safety Chair','System seed','System seed','2026-01-29 08:20:00','2026-01-29 08:20:00')
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
VALUES
  ('mock-incident-001','MOCK-INC-001','Trượt ngã','Trung bình','Đã đóng','production','PY1 - line ép nhựa','Nhân viên trượt chân do nền còn dầu sau vệ sinh máy.', '2026-01-16','09:20','Line Leader',NULL,'Production Supervisor','2 nhân viên cùng ca','["Chân"]',1,'6S - Sạch sẽ','Nền chưa khô hoàn toàn sau vệ sinh, thiếu biển cảnh báo sàn ướt.','Sơ cứu và cô lập khu vực.','Bổ sung biển sàn ướt, kiểm tra điểm rò dầu.','Đưa kiểm tra sàn vào checklist đầu ca.',300000,'Đã duyệt',NULL,'production','mock-user-prod','Line Leader','System seed','System seed','2026-01-16 09:35:00','2026-01-18 15:00:00'),
  ('mock-incident-002','MOCK-INC-002','Cận nguy xe nâng','Nghiêm trọng','Đang theo dõi','warehouse','Kho WIP - giao cắt B2','Xe nâng phanh gấp khi người đi bộ bước vào vùng giao cắt vạch mờ.', '2026-02-20','14:10','Warehouse Leader',NULL,'Warehouse Supervisor','Tài xế xe nâng','[]',0,'Giao thông nội bộ','Vạch phân luồng mờ, góc khuất thiếu gương cầu.','Dừng xe nâng, nhắc nhở người đi bộ.','Sơn lại vạch, lắp gương cầu, đào tạo lại tuyến đi bộ.','Tuần tra điểm giao cắt 2 lần/ngày trong 2 tuần.',0,'Đã duyệt',NULL,'warehouse','mock-user-wh','Warehouse Leader','System seed','System seed','2026-02-20 14:25:00','2026-02-21 10:00:00'),
  ('mock-incident-003','MOCK-INC-003','Cận nguy hóa chất','Nghiêm trọng','Đã đóng','quality','QA Lab','Chai chiết hóa chất bị đổ nhẹ do nắp không kín, không có người bị ảnh hưởng.', '2026-03-27','11:40','QA Auditor',NULL,'QA Supervisor','Nhân viên QA','[]',0,'Hóa chất','Chai chiết thiếu nhãn tình trạng và không kiểm tra nắp cuối ca.','Cô lập chai và vệ sinh theo hướng dẫn SDS.','Chuẩn hóa nhãn chai chiết, thêm khay phụ.','Audit nhãn hóa chất hàng tuần.',120000,'Đã duyệt',NULL,'quality','mock-user-qa','QA Auditor','System seed','System seed','2026-03-27 12:00:00','2026-03-28 09:00:00'),
  ('mock-incident-004','MOCK-INC-004','Kẹp tay','Nghiêm trọng','Đang xử lý','production','PY1 - hố nước mưa sân sau','Nhân viên bị kẹp tay khi đóng nắp hố nước mưa trong công việc không thường xuyên.', '2026-04-29','14:20','GA Staff',NULL,'GA/EHS','1 nhân viên cùng khu vực','["Ngón tay"]',1,'Công việc không thường xuyên','Thiếu cảnh báo, thiếu giới hạn phạm vi làm việc và chưa có TBM trước thao tác.','Sơ cứu, chuyển y tế và cô lập khu vực.','Lập SOP mở nắp hố, bổ sung rào chắn di động.','Đưa công việc không thường xuyên vào TBM bắt buộc.',2500000,'Đã duyệt',NULL,'production','mock-user-ga','GA Staff','System seed','System seed','2026-04-29 14:45:00','2026-05-02 10:00:00'),
  ('mock-incident-005','MOCK-INC-005','Va chạm đầu/tay','Nghiêm trọng','Đang xử lý','production','PY2 - MS1 Namashi','Nhân viên va chạm trong nguyên công tạo rãnh, có vết thương trán và tay.', '2026-05-05','06:10','Line Leader MS1',NULL,'Production Supervisor','2 nhân viên cùng line','["Trán","Tay phải"]',1,'An toàn máy','Điểm thao tác gần cơ cấu chuyển động, hướng dẫn trực quan chưa đủ rõ.','Sơ cứu, chuyển y tế, dừng kiểm tra máy.','Rà soát guard, cập nhật hình ảnh thao tác chuẩn.','Đào tạo lại thao tác an toàn cho toàn bộ ca.',4500000,'Đã duyệt',NULL,'production','mock-user-prod','Line Leader MS1','System seed','System seed','2026-05-05 06:35:00','2026-05-07 16:00:00'),
  ('mock-incident-006','MOCK-INC-006','Bất thường tủ báo cháy','Trung bình','Đã đóng','engineering','Trung tâm báo cháy','Tủ báo cháy ghi nhận tín hiệu bất thường sau mưa lớn, nghi do sét lan truyền.', '2026-05-21','17:30','Maintenance Staff',NULL,'Maintenance Lead','Bảo vệ ca chiều','[]',0,'Điện/PCCC','Chưa có báo cáo đánh giá chung cho thiết bị tương tự.','Kiểm tra nguồn và xác nhận hệ thống hoạt động lại.','Lập báo cáo sét lan truyền và biện pháp chống sét chung.','Kiểm tra tủ tương tự trước mùa mưa.',800000,'Đã duyệt',NULL,'engineering','mock-user-eng','Maintenance Staff','System seed','System seed','2026-05-21 18:00:00','2026-05-22 11:00:00'),
  ('mock-incident-007','MOCK-INC-007','Cận nguy xe nâng','Nghiêm trọng','Đang theo dõi','warehouse','Cửa nhập hàng','Xe nâng đi qua điểm giao cắt khi người đi bộ đứng trong vùng chờ không đúng vị trí.', '2026-06-02','10:05','Forklift Driver',NULL,'Warehouse Supervisor','Nhân viên nhận hàng','[]',0,'Giao thông nội bộ','Vùng chờ người đi bộ chưa rõ và thiếu biển nhìn từ hướng xe nâng.','Dừng thao tác, phân luồng lại tạm thời.','Sơn vùng chờ, thêm biển treo cao và audit camera.','Đưa điểm giao cắt vào họp đầu ca 5 ngày liên tiếp.',0,'Đã duyệt',NULL,'warehouse','mock-user-wh','Forklift Driver','System seed','System seed','2026-06-02 10:20:00','2026-06-03 09:00:00'),
  ('mock-incident-008','MOCK-INC-008','Đứt tay nhẹ','Thấp','Đã đóng','quality','OQC - bàn kiểm tra','Nhân viên bị xước tay nhẹ khi xử lý cạnh sắc của mẫu NG.', '2026-06-04','15:25','OQC Leader',NULL,'QA Supervisor','Nhân viên OQC','["Ngón tay"]',1,'Phân loại mẫu','Mẫu NG cạnh sắc chưa có khay riêng và chưa có cảnh báo trực quan.','Sơ cứu tại chỗ, tách mẫu NG.','Dùng khay đỏ cho mẫu sắc cạnh, bổ sung găng phù hợp.','Đưa tiêu chí cạnh sắc vào điểm kiểm S1.',50000,'Đã duyệt',NULL,'quality','mock-user-qa','OQC Leader','System seed','System seed','2026-06-04 15:40:00','2026-06-05 09:30:00')
ON DUPLICATE KEY UPDATE
  type = VALUES(type), severity = VALUES(severity), status = VALUES(status), department = VALUES(department),
  area = VALUES(area), description = VALUES(description), occurred_date = VALUES(occurred_date),
  occurred_time = VALUES(occurred_time), reporter_name = VALUES(reporter_name), handler_name = VALUES(handler_name),
  witnesses = VALUES(witnesses), body_parts_affected_json = VALUES(body_parts_affected_json), first_aid_given = VALUES(first_aid_given),
  root_cause_category = VALUES(root_cause_category), root_cause_detail = VALUES(root_cause_detail),
  immediate_action = VALUES(immediate_action), corrective_action = VALUES(corrective_action),
  preventive_action = VALUES(preventive_action), estimated_cost = VALUES(estimated_cost),
  approval_status = VALUES(approval_status), updated_by_name = VALUES(updated_by_name), updated_at = VALUES(updated_at);

INSERT INTO safety_kpi_entries
  (id, code, entry_type, period_type, period, department_code, division_code, value, target, unit, notes,
   approval_status, rejection_reason, rejected_by_level, submitted_by_id, submitted_by_name, submitted_by_dept,
   created_by_name, updated_by_name, created_at, updated_at)
VALUES
  ('mock-kpi-202601-production','KPI-202601-PRODUCTION-SCORE','safety_score_monthly','month','2026-01','production',NULL,82,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-01-31 17:00:00','2026-01-31 17:00:00'),
  ('mock-kpi-202601-warehouse','KPI-202601-WAREHOUSE-SCORE','safety_score_monthly','month','2026-01','warehouse',NULL,78,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-01-31 17:00:00','2026-01-31 17:00:00'),
  ('mock-kpi-202601-engineering','KPI-202601-ENGINEERING-SCORE','safety_score_monthly','month','2026-01','engineering',NULL,88,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-01-31 17:00:00','2026-01-31 17:00:00'),
  ('mock-kpi-202601-quality','KPI-202601-QUALITY-SCORE','safety_score_monthly','month','2026-01','quality',NULL,90,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-01-31 17:00:00','2026-01-31 17:00:00'),
  ('mock-kpi-202601-office','KPI-202601-OFFICE-SCORE','safety_score_monthly','month','2026-01','office',NULL,86,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-01-31 17:00:00','2026-01-31 17:00:00'),
  ('mock-kpi-202601-ehs','KPI-202601-EHS-SCORE','safety_score_monthly','month','2026-01','ehs',NULL,92,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-01-31 17:00:00','2026-01-31 17:00:00'),
  ('mock-kpi-202602-production','KPI-202602-PRODUCTION-SCORE','safety_score_monthly','month','2026-02','production',NULL,83,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-02-28 17:00:00','2026-02-28 17:00:00'),
  ('mock-kpi-202602-warehouse','KPI-202602-WAREHOUSE-SCORE','safety_score_monthly','month','2026-02','warehouse',NULL,80,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-02-28 17:00:00','2026-02-28 17:00:00'),
  ('mock-kpi-202602-engineering','KPI-202602-ENGINEERING-SCORE','safety_score_monthly','month','2026-02','engineering',NULL,89,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-02-28 17:00:00','2026-02-28 17:00:00'),
  ('mock-kpi-202602-quality','KPI-202602-QUALITY-SCORE','safety_score_monthly','month','2026-02','quality',NULL,91,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-02-28 17:00:00','2026-02-28 17:00:00'),
  ('mock-kpi-202602-office','KPI-202602-OFFICE-SCORE','safety_score_monthly','month','2026-02','office',NULL,87,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-02-28 17:00:00','2026-02-28 17:00:00'),
  ('mock-kpi-202602-ehs','KPI-202602-EHS-SCORE','safety_score_monthly','month','2026-02','ehs',NULL,93,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-02-28 17:00:00','2026-02-28 17:00:00'),
  ('mock-kpi-202603-production','KPI-202603-PRODUCTION-SCORE','safety_score_monthly','month','2026-03','production',NULL,85,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-03-31 17:00:00','2026-03-31 17:00:00'),
  ('mock-kpi-202603-warehouse','KPI-202603-WAREHOUSE-SCORE','safety_score_monthly','month','2026-03','warehouse',NULL,79,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-03-31 17:00:00','2026-03-31 17:00:00'),
  ('mock-kpi-202603-engineering','KPI-202603-ENGINEERING-SCORE','safety_score_monthly','month','2026-03','engineering',NULL,90,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-03-31 17:00:00','2026-03-31 17:00:00'),
  ('mock-kpi-202603-quality','KPI-202603-QUALITY-SCORE','safety_score_monthly','month','2026-03','quality',NULL,92,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-03-31 17:00:00','2026-03-31 17:00:00'),
  ('mock-kpi-202603-office','KPI-202603-OFFICE-SCORE','safety_score_monthly','month','2026-03','office',NULL,88,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-03-31 17:00:00','2026-03-31 17:00:00'),
  ('mock-kpi-202603-ehs','KPI-202603-EHS-SCORE','safety_score_monthly','month','2026-03','ehs',NULL,94,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-03-31 17:00:00','2026-03-31 17:00:00'),
  ('mock-kpi-202604-production','KPI-202604-PRODUCTION-SCORE','safety_score_monthly','month','2026-04','production',NULL,84,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-04-30 17:00:00','2026-04-30 17:00:00'),
  ('mock-kpi-202604-warehouse','KPI-202604-WAREHOUSE-SCORE','safety_score_monthly','month','2026-04','warehouse',NULL,81,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-04-30 17:00:00','2026-04-30 17:00:00'),
  ('mock-kpi-202604-engineering','KPI-202604-ENGINEERING-SCORE','safety_score_monthly','month','2026-04','engineering',NULL,91,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-04-30 17:00:00','2026-04-30 17:00:00'),
  ('mock-kpi-202604-quality','KPI-202604-QUALITY-SCORE','safety_score_monthly','month','2026-04','quality',NULL,93,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-04-30 17:00:00','2026-04-30 17:00:00'),
  ('mock-kpi-202604-office','KPI-202604-OFFICE-SCORE','safety_score_monthly','month','2026-04','office',NULL,88,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-04-30 17:00:00','2026-04-30 17:00:00'),
  ('mock-kpi-202604-ehs','KPI-202604-EHS-SCORE','safety_score_monthly','month','2026-04','ehs',NULL,95,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-04-30 17:00:00','2026-04-30 17:00:00'),
  ('mock-kpi-202605-production','KPI-202605-PRODUCTION-SCORE','safety_score_monthly','month','2026-05','production',NULL,86,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-05-31 17:00:00','2026-05-31 17:00:00'),
  ('mock-kpi-202605-warehouse','KPI-202605-WAREHOUSE-SCORE','safety_score_monthly','month','2026-05','warehouse',NULL,82,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-05-31 17:00:00','2026-05-31 17:00:00'),
  ('mock-kpi-202605-engineering','KPI-202605-ENGINEERING-SCORE','safety_score_monthly','month','2026-05','engineering',NULL,90,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-05-31 17:00:00','2026-05-31 17:00:00'),
  ('mock-kpi-202605-quality','KPI-202605-QUALITY-SCORE','safety_score_monthly','month','2026-05','quality',NULL,94,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-05-31 17:00:00','2026-05-31 17:00:00'),
  ('mock-kpi-202605-office','KPI-202605-OFFICE-SCORE','safety_score_monthly','month','2026-05','office',NULL,89,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-05-31 17:00:00','2026-05-31 17:00:00'),
  ('mock-kpi-202605-ehs','KPI-202605-EHS-SCORE','safety_score_monthly','month','2026-05','ehs',NULL,95,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-05-31 17:00:00','2026-05-31 17:00:00'),
  ('mock-kpi-202606-production','KPI-202606-PRODUCTION-SCORE','safety_score_monthly','month','2026-06','production',NULL,87,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-06-06 17:00:00','2026-06-06 17:00:00'),
  ('mock-kpi-202606-warehouse','KPI-202606-WAREHOUSE-SCORE','safety_score_monthly','month','2026-06','warehouse',NULL,84,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-06-06 17:00:00','2026-06-06 17:00:00'),
  ('mock-kpi-202606-engineering','KPI-202606-ENGINEERING-SCORE','safety_score_monthly','month','2026-06','engineering',NULL,92,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-06-06 17:00:00','2026-06-06 17:00:00'),
  ('mock-kpi-202606-quality','KPI-202606-QUALITY-SCORE','safety_score_monthly','month','2026-06','quality',NULL,94,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-06-06 17:00:00','2026-06-06 17:00:00'),
  ('mock-kpi-202606-office','KPI-202606-OFFICE-SCORE','safety_score_monthly','month','2026-06','office',NULL,90,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-06-06 17:00:00','2026-06-06 17:00:00'),
  ('mock-kpi-202606-ehs','KPI-202606-EHS-SCORE','safety_score_monthly','month','2026-06','ehs',NULL,96,95,'%', 'Mock monthly safety score', 'approved',NULL,NULL,'mock-user-ehs','EHS Officer','ehs','System seed','System seed','2026-06-06 17:00:00','2026-06-06 17:00:00')
ON DUPLICATE KEY UPDATE
  entry_type = VALUES(entry_type), period_type = VALUES(period_type), period = VALUES(period), department_code = VALUES(department_code),
  value = VALUES(value), target = VALUES(target), unit = VALUES(unit), notes = VALUES(notes),
  approval_status = VALUES(approval_status), updated_by_name = VALUES(updated_by_name), updated_at = VALUES(updated_at);

INSERT INTO safety_checklist_submissions
  (department_code, period, item_id, checked, submitted_by_id, submitted_by_name, created_at, updated_at)
VALUES
  ('production','2026-06',1,1,'mock-user-prod','Production Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('production','2026-06',2,1,'mock-user-prod','Production Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('production','2026-06',3,1,'mock-user-prod','Production Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('production','2026-06',4,0,'mock-user-prod','Production Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('production','2026-06',5,1,'mock-user-prod','Production Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('production','2026-06',6,1,'mock-user-prod','Production Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('production','2026-06',7,0,'mock-user-prod','Production Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('production','2026-06',8,1,'mock-user-prod','Production Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('production','2026-06',9,1,'mock-user-prod','Production Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('production','2026-06',10,1,'mock-user-prod','Production Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('production','2026-06',11,0,'mock-user-prod','Production Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('production','2026-06',12,1,'mock-user-prod','Production Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('warehouse','2026-06',1,1,'mock-user-wh','Warehouse Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('warehouse','2026-06',2,1,'mock-user-wh','Warehouse Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('warehouse','2026-06',3,0,'mock-user-wh','Warehouse Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('warehouse','2026-06',4,1,'mock-user-wh','Warehouse Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('warehouse','2026-06',5,1,'mock-user-wh','Warehouse Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('warehouse','2026-06',6,0,'mock-user-wh','Warehouse Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('warehouse','2026-06',7,1,'mock-user-wh','Warehouse Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('warehouse','2026-06',8,1,'mock-user-wh','Warehouse Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('warehouse','2026-06',9,0,'mock-user-wh','Warehouse Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('warehouse','2026-06',10,1,'mock-user-wh','Warehouse Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('warehouse','2026-06',11,1,'mock-user-wh','Warehouse Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('warehouse','2026-06',12,0,'mock-user-wh','Warehouse Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('engineering','2026-06',1,1,'mock-user-eng','Maintenance Lead','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('engineering','2026-06',2,1,'mock-user-eng','Maintenance Lead','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('engineering','2026-06',3,1,'mock-user-eng','Maintenance Lead','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('engineering','2026-06',4,1,'mock-user-eng','Maintenance Lead','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('engineering','2026-06',5,1,'mock-user-eng','Maintenance Lead','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('engineering','2026-06',6,1,'mock-user-eng','Maintenance Lead','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('engineering','2026-06',7,1,'mock-user-eng','Maintenance Lead','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('engineering','2026-06',8,1,'mock-user-eng','Maintenance Lead','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('engineering','2026-06',9,1,'mock-user-eng','Maintenance Lead','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('engineering','2026-06',10,0,'mock-user-eng','Maintenance Lead','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('engineering','2026-06',11,1,'mock-user-eng','Maintenance Lead','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('engineering','2026-06',12,1,'mock-user-eng','Maintenance Lead','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('quality','2026-06',1,1,'mock-user-qa','QA Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('quality','2026-06',2,1,'mock-user-qa','QA Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('quality','2026-06',3,1,'mock-user-qa','QA Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('quality','2026-06',4,1,'mock-user-qa','QA Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('quality','2026-06',5,1,'mock-user-qa','QA Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('quality','2026-06',6,1,'mock-user-qa','QA Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('quality','2026-06',7,1,'mock-user-qa','QA Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('quality','2026-06',8,0,'mock-user-qa','QA Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('quality','2026-06',9,1,'mock-user-qa','QA Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('quality','2026-06',10,1,'mock-user-qa','QA Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('quality','2026-06',11,1,'mock-user-qa','QA Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('quality','2026-06',12,1,'mock-user-qa','QA Supervisor','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('office','2026-06',1,1,'mock-user-admin','Admin','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('office','2026-06',2,1,'mock-user-admin','Admin','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('office','2026-06',3,1,'mock-user-admin','Admin','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('office','2026-06',4,1,'mock-user-admin','Admin','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('office','2026-06',5,1,'mock-user-admin','Admin','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('office','2026-06',6,1,'mock-user-admin','Admin','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('office','2026-06',7,1,'mock-user-admin','Admin','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('office','2026-06',8,1,'mock-user-admin','Admin','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('office','2026-06',9,0,'mock-user-admin','Admin','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('office','2026-06',10,1,'mock-user-admin','Admin','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('office','2026-06',11,1,'mock-user-admin','Admin','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('office','2026-06',12,0,'mock-user-admin','Admin','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('ehs','2026-06',1,1,'mock-user-ehs','EHS Officer','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('ehs','2026-06',2,1,'mock-user-ehs','EHS Officer','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('ehs','2026-06',3,1,'mock-user-ehs','EHS Officer','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('ehs','2026-06',4,1,'mock-user-ehs','EHS Officer','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('ehs','2026-06',5,1,'mock-user-ehs','EHS Officer','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('ehs','2026-06',6,1,'mock-user-ehs','EHS Officer','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('ehs','2026-06',7,1,'mock-user-ehs','EHS Officer','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('ehs','2026-06',8,1,'mock-user-ehs','EHS Officer','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('ehs','2026-06',9,1,'mock-user-ehs','EHS Officer','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('ehs','2026-06',10,1,'mock-user-ehs','EHS Officer','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('ehs','2026-06',11,1,'mock-user-ehs','EHS Officer','2026-06-06 16:00:00','2026-06-06 16:00:00'),
  ('ehs','2026-06',12,1,'mock-user-ehs','EHS Officer','2026-06-06 16:00:00','2026-06-06 16:00:00')
ON DUPLICATE KEY UPDATE
  checked = VALUES(checked), submitted_by_id = VALUES(submitted_by_id), submitted_by_name = VALUES(submitted_by_name),
  updated_at = VALUES(updated_at);

INSERT INTO safety_reports
  (id, code, title, type, period, department, creator, status, notes, created_by_id, created_by_name, updated_by_name, created_at, updated_at)
VALUES
  ('mock-report-202606-company','RPT-202606-COMPANY-6S','Tổng hợp điểm nóng An toàn - 6S tháng 06/2026','AT-PCCC-6S','2026-06','company','EHS Officer','Đã phát hành','Báo cáo giả lập: 18 cảnh báo, 8 sự cố/cận nguy, trọng tâm S6 và PCCC.','mock-user-ehs','EHS Officer','System seed','2026-06-06 17:20:00','2026-06-06 17:20:00'),
  ('mock-report-202606-production','RPT-202606-PRODUCTION-6S','Theo dõi hành động 6S khối Production','6S Action','2026-06','production','Production Supervisor','Đang theo dõi','Tập trung máy Namashi, dầu rò, công việc không thường xuyên.','mock-user-prod','Production Supervisor','System seed','2026-06-06 17:20:00','2026-06-06 17:20:00'),
  ('mock-report-202606-warehouse','RPT-202606-WAREHOUSE-6S','Rà soát giao thông nội bộ và PCCC kho','Inspection','2026-06','warehouse','Warehouse Supervisor','Đang theo dõi','Tập trung pallet, xe nâng, lối tiếp cận PCCC.','mock-user-wh','Warehouse Supervisor','System seed','2026-06-06 17:20:00','2026-06-06 17:20:00'),
  ('mock-report-202606-engineering','RPT-202606-ENGINEERING-6S','Rà soát tủ điện, LOTO và chống tràn bảo trì','Inspection','2026-06','engineering','Maintenance Lead','Đang theo dõi','Tập trung tủ điện CR3, LOTO cảm biến, khay chống tràn dầu.','mock-user-eng','Maintenance Lead','System seed','2026-06-06 17:20:00','2026-06-06 17:20:00')
ON DUPLICATE KEY UPDATE
  title = VALUES(title), type = VALUES(type), period = VALUES(period), department = VALUES(department),
  creator = VALUES(creator), status = VALUES(status), notes = VALUES(notes), updated_by_name = VALUES(updated_by_name),
  updated_at = VALUES(updated_at);

INSERT INTO safety_training_courses
  (id, code, name, category, trainer, duration, department, enrolled, completed, due_date, status, notes,
   created_by_id, created_by_name, updated_by_name, created_at, updated_at)
VALUES
  ('mock-training-prod-loto','TRN-202606-PROD-LOTO','Đào tạo lại LOTO và thao tác gần cơ cấu quay','ATVSLĐ','EHS + Maintenance','2 giờ','production',68,42,'2026-06-20','Đang triển khai','Ưu tiên line Namashi và cell đóng gói.','mock-user-ehs','EHS Officer','System seed','2026-06-06 17:30:00','2026-06-06 17:30:00'),
  ('mock-training-wh-forklift','TRN-202606-WH-FORKLIFT','Phân luồng xe nâng và người đi bộ','Giao thông nội bộ','Warehouse Supervisor','1.5 giờ','warehouse',45,28,'2026-06-18','Đang triển khai','Gắn với điểm giao cắt cửa nhập hàng.','mock-user-wh','Warehouse Supervisor','System seed','2026-06-06 17:30:00','2026-06-06 17:30:00'),
  ('mock-training-qa-chemical','TRN-202606-QA-CHEM','Nhãn hóa chất, SDS và xử lý đổ tràn nhỏ','Hóa chất','QA + EHS','2 giờ','quality',24,18,'2026-06-22','Đang triển khai','Dùng tình huống chai chiết thiếu nhãn tại QA Lab.','mock-user-qa','QA Supervisor','System seed','2026-06-06 17:30:00','2026-06-06 17:30:00'),
  ('mock-training-office-emergency','TRN-202606-OFFICE-EXIT','Lối thoát hiểm và an toàn điện văn phòng','Văn phòng','Admin + EHS','1 giờ','office',36,20,'2026-06-25','Đang triển khai','Tập trung cửa thoát hiểm phía Tây và ổ cắm kéo dài.','mock-user-admin','Admin','System seed','2026-06-06 17:30:00','2026-06-06 17:30:00'),
  ('mock-training-eng-electrical','TRN-202606-ENG-ELECTRICAL','Kiểm tra tủ điện, che chắn và chống sét lan truyền','Điện/PCCC','Maintenance Lead','2 giờ','engineering',18,12,'2026-06-21','Đang triển khai','Gắn với CR3 và tủ báo cháy sau mưa lớn.','mock-user-eng','Maintenance Lead','System seed','2026-06-06 17:30:00','2026-06-06 17:30:00'),
  ('mock-training-ehs-tbm','TRN-202606-EHS-TBM','Chuẩn hóa TBM cho công việc không thường xuyên','Quản trị an toàn','EHS Officer','2 giờ','ehs',12,9,'2026-06-29','Đang triển khai','Chuẩn bị ban hành form TBM toàn công ty.','mock-user-ehs','EHS Officer','System seed','2026-06-06 17:30:00','2026-06-06 17:30:00')
ON DUPLICATE KEY UPDATE
  name = VALUES(name), category = VALUES(category), trainer = VALUES(trainer), duration = VALUES(duration),
  department = VALUES(department), enrolled = VALUES(enrolled), completed = VALUES(completed), due_date = VALUES(due_date),
  status = VALUES(status), notes = VALUES(notes), updated_by_name = VALUES(updated_by_name), updated_at = VALUES(updated_at);

COMMIT;

