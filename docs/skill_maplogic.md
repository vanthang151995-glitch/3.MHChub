# Sơ đồ Logic Toàn Hệ Thống (Master Logic Map) - MHChub Safety 6S

Tài liệu này được định nghĩa là **Skill Maplogic** chuẩn của dự án. Mọi thay đổi về cấu trúc dữ liệu, thêm tính năng mới, hoặc sửa đổi luồng dữ liệu đều phải tuân thủ và đối chiếu với bản đồ này để đảm bảo không bị gãy vỡ (break) tính toàn vẹn của hệ thống.

---

## 1. Bản Đồ Liên Kết Đa Phân Hệ (Multi-Module Data Ecosystem)

Hệ thống xoay quanh một lõi xử lý duy nhất là **SAFETY_ACTION** (Hành động khắc phục / Việc cần làm). Mọi vấn đề bất thường từ bất kỳ phân hệ nào đều phải quy về dạng Nhiệm vụ để có người xử lý và đóng (Close).

```mermaid
flowchart TD
    %% INPUTS - Nguồn dữ liệu đầu vào
    subgraph Input_Modules [Nguồn Phát Hiện Vấn Đề]
        W[Cảnh báo an toàn\n(Safety Warnings)]
        I[Sự cố an toàn\n(Safety Incidents)]
        C[Đánh giá định kỳ\n(Checklists & Audits)]
        K[Chương trình đặc biệt\n(KYT, PCCC, Y tế)]
    end

    %% CORE ENGINE - Lõi điều phối
    subgraph Execution_Core [Lõi Thực Thi]
        A{Việc An Toàn\n(SAFETY_ACTION)}
    end

    %% OUTPUTS - Nguồn hiển thị & Báo cáo
    subgraph Output_Modules [Hiển thị & Báo cáo]
        B[Bản tin An toàn\n(Safety Bulletins)]
        Kpi[Chỉ số KPI\n(Dashboards & KPIs)]
        T[Đào tạo\n(Training Records)]
    end

    %% Luồng phát sinh vấn đề -> Action
    W -->|Sinh ra| A
    I -->|Sinh ra| A
    C -->|Mục không đạt (NG) sinh ra| A
    K -->|Nhận diện nguy cơ sinh ra| A

    %% Luồng Action xử lý xong -> Cập nhật ngược lại
    A -.->|Hoàn thành -> Tự động Đóng| W
    A -.->|Hoàn thành -> Tự động Đóng| I
    A -.->|Khắc phục xong| C
    
    %% Luồng đầu ra
    A ==>|Trích xuất dữ liệu làm| B
    W ==>|Trích xuất dữ liệu làm| B
    
    W -->|Tính toán| Kpi
    I -->|Tính toán| Kpi
    A -->|Tính toán| Kpi
    C -->|Tính toán| Kpi
    
    I -->|Sự cố lớn yêu cầu tái đào tạo| T
```

---

## 2. Tiêu chuẩn Thiết kế Data Schema (Quy tắc Database)

Để bản đồ trên hoạt động được, khi thêm mới bất kỳ bảng dữ liệu nào, lập trình viên phải tuân thủ các quy định sau:

### Quy tắc 1: Traceability (Khả năng truy vết)
Tất cả các bảng phát sinh từ phân hệ Input đều phải có khả năng sinh ra `SafetyAction`. Vì vậy bảng `SAFETY_ACTION` luôn phải chứa các Khóa ngoại (Foreign Keys) linh hoạt:
- `source_module`: enum (WARNING, INCIDENT, AUDIT, KYT, PCCC, ...)
- `source_id`: Tham chiếu ID của bản ghi gốc sinh ra nó.

### Quy tắc 2: Single Source of Truth (Nguồn chân lý duy nhất)
- Giao diện Dashboard (Trang tổng quan) **tuyệt đối không lưu cache tĩnh** trạng thái của dữ liệu.
- Thay vào đó, API trả về cho Dashboard phải `JOIN` hoặc truy vấn trực tiếp bảng gốc.
- **Ví dụ:** Khi sửa `Action` thành `DONE`, không cần phải viết hàm update Dashboard, mà lần tải lại trang tiếp theo Dashboard sẽ tự động "thấy" sự thay đổi.

### Quy tắc 3: Localization (Đa ngôn ngữ)
- Mọi trường dữ liệu dạng văn bản do người dùng nhập vào (Title, Description, Notes) phải được lưu dưới dạng chuỗi JSON `{"vi":"", "en":"", "ja":""}` trong cột có hậu tố `_i18n_json`.
- Khi cập nhật cấu trúc bảng (như việc thêm 7 cột vừa rồi), bắt buộc phải có đủ bộ đôi cột (1 cột text gốc và 1 cột i18n_json) để đảm bảo UI không bị vỡ giao diện dịch thuật.

### Quy tắc 4: Aggregation (Tổng hợp bản tin)
- Bảng `SAFETY_BULLETIN` chứa trường `related_entity_ids` (dạng chuỗi JSON array).
- Khi tạo Bản tin mới, thay vì bắt người dùng gõ tay, giao diện phải có công cụ "Nhập tự động" (Import) để kéo `Action` và `Warning` vào bản tin, giúp dữ liệu đồng nhất, tránh sai sót.

---

## 3. Checklist Kiểm Tra "Maplogic" Dành Cho Lập Trình Viên

Mỗi khi có yêu cầu "Thêm chức năng mới", "Thêm cột mới", hoặc "Sửa quy trình", hãy tự đặt 3 câu hỏi sau để đối chiếu với Maplogic:

- `[ ]` **Dữ liệu mới này có sinh ra Việc cần làm (Action) không?** Nếu có, đã cập nhật logic tự động tạo Action cho nó chưa?
- `[ ]` **Khi đổi trạng thái, nó có cần cập nhật chéo không?** (Ví dụ: Đóng Action thì Warning gốc có đóng theo không?).
- `[ ]` **Nó có ảnh hưởng tới KPI và Dashboard không?** Nếu tạo thêm 1 trường trạng thái mới, thuật toán đếm số "Cảnh báo đang mở" ở trang chủ có bị sai lệch không?

> **Lưu ý:** Tài liệu này được lưu vĩnh viễn trong mã nguồn tại `docs/skill_maplogic.md`. Bất kỳ lập trình viên nào tiếp quản dự án đều phải đọc tài liệu này trước khi đụng vào code.
