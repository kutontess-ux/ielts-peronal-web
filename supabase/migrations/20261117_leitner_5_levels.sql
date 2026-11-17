-- Migration: Nâng cấp SRS từ SM-2 tuyến tính sang Leitner 5 cấp độ + User Settings
-- Chạy 1 lần trong Supabase > SQL Editor nếu database đã tồn tại từ schema v1.

-- 1. Thêm các cột mới cho public.reviews
alter table public.reviews
  add column if not exists level smallint not null default 1 check (level between 1 and 5),
  add column if not exists next_review_at timestamptz not null default now(),
  add column if not exists level5_streak int not null default 0;

-- 2. Migrate dữ liệu cũ (nếu có cột due_at và interval_days từ schema v1)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'due_at'
  ) then
    execute 'update public.reviews set next_review_at = due_at where due_at is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'interval_days'
  ) then
    execute $q$
      update public.reviews
      set level = case
        when interval_days >= 30 then 5
        when interval_days >= 14 then 4
        when interval_days >= 7  then 3
        when interval_days >= 3  then 2
        else 1
      end
    $q$;
  end if;
end $$;

-- 3. Tạo index ưu tiên mới cho truy vấn ORDER BY level ASC, next_review_at ASC
drop index if exists public.reviews_due_idx;
create index if not exists reviews_priority_idx on public.reviews (level asc, next_review_at asc);
create index if not exists reviews_due_idx on public.reviews (next_review_at);

-- 4. Tạo bảng cài đặt người dùng
create table if not exists public.user_settings (
  id                 int primary key default 1 check (id = 1),
  daily_review_limit int not null default 50 check (daily_review_limit between 5 and 500),
  daily_new_limit    int not null default 15 check (daily_new_limit between 0 and 200),
  session_size       int not null default 15 check (session_size between 5 and 50),
  updated_at         timestamptz not null default now()
);

insert into public.user_settings (id) values (1) on conflict (id) do nothing;
alter table public.user_settings enable row level security;
