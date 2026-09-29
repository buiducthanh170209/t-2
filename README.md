# Quản lý Thi đua Tổ trong lớp

Website đơn giản, giao diện tiếng Việt, dùng Supabase để lưu dữ liệu thật.

## Tính năng chính

- Bảng thi đua theo tuần (điểm cộng / điểm trừ / tổng điểm tự động)
- Thêm / sửa / xóa thành viên
- Thêm lỗi vi phạm hoặc điểm cộng (nhiều lần cho 1 người trong tuần)
- Xem chi tiết lỗi khi bấm vào tên
- Tạo tuần mới (giữ danh sách thành viên, điểm về 0)
- Tổng kết tuần + xuất Excel / PDF
- Lịch sử các tuần

## Cách cài đặt (5 phút)

### 1. Tạo dự án Supabase

1. Vào [https://supabase.com](https://supabase.com) → Sign up / Login
2. **New project** → đặt tên → chọn region gần (Singapore) → Create
3. Đợi project sẵn sàng (~1 phút)

### 2. Tạo bảng dữ liệu

1. Trong Supabase Dashboard → **SQL Editor** → New query
2. Mở website → màn hình cấu hình → bấm **Sao chép SQL** (hoặc copy từ file dưới)
3. Dán vào SQL Editor → **Run**

```sql
-- Bảng thành viên
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  stt INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bảng tuần
CREATE TABLE IF NOT EXISTS weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bảng ghi nhận điểm / lỗi
CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cong', 'tru')),
  points INTEGER NOT NULL CHECK (points > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all members" ON members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all weeks" ON weeks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all records" ON records FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_records_week ON records(week_id);
CREATE INDEX IF NOT EXISTS idx_records_member ON records(member_id);
```

### 3. Lấy URL & Key

1. Supabase → **Project Settings** → **API**
2. Copy **Project URL**
3. Copy **anon public** key

### 4. Chạy website

- Mở file `index.html` bằng trình duyệt (Chrome / Edge / Firefox)
- Hoặc upload cả thư mục lên Netlify / Vercel / GitHub Pages
- Dán URL + Key + tên tổ → **Lưu & Bắt đầu**

Cấu hình được lưu trong trình duyệt (localStorage), lần sau không cần nhập lại.

## Cấu trúc file

```
thi-dua-to/
├── index.html    # Giao diện chính
├── styles.css    # CSS đơn giản, responsive
├── app.js        # Logic + kết nối Supabase
└── README.md     # Hướng dẫn này
```

## Ghi chú

- App dùng **anon key** + RLS policy cho phép đọc/ghi (phù hợp lớp học nội bộ).
- Không có đăng nhập — ai có link đều dùng được. Nếu cần bảo mật hơn có thể thêm Auth sau.
- Xuất Excel dùng SheetJS, PDF dùng jsPDF (CDN).
- Tối ưu cho cả điện thoại và máy tính.

Chúc bạn quản lý thi đua tổ hiệu quả! 🏆
