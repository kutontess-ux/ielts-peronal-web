-- Migration: Multi-user với Google OAuth, phân quyền Admin/Member, AI quota & RLS an toàn
-- Chạy 1 lần trong Supabase > SQL Editor.

-- 1. Bảng hồ sơ & phân quyền người dùng (chỉ Admin mới sửa được role / is_active / daily_ai_limit qua server)
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null,
  full_name      text not null default '',
  avatar_url     text,
  role           text not null default 'member' check (role in ('admin', 'member')),
  is_active      boolean not null default true,
  daily_ai_limit int not null default 10 check (daily_ai_limit >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists profiles_email_idx on public.profiles (email);

alter table public.profiles enable row level security;
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);
-- Lưu ý bảo mật: KHÔNG tạo policy INSERT/UPDATE/DELETE cho client trên public.profiles
-- để user thường không thể tự sửa cột role, is_active, daily_ai_limit từ trình duyệt.

-- 2. Bảng theo dõi lượt gọi AI theo ngày cho từng user
create table if not exists public.ai_usage_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_logs_user_date_idx
  on public.ai_usage_logs (user_id, created_at desc);

alter table public.ai_usage_logs enable row level security;
drop policy if exists "ai_usage_select_own" on public.ai_usage_logs;
create policy "ai_usage_select_own"
  on public.ai_usage_logs for select
  to authenticated
  using (auth.uid() = user_id);

-- 3. Phân tách reviews theo user_id (cho phép NULL tạm thời để giữ dữ liệu cũ)
alter table public.reviews drop constraint if exists reviews_pkey;
alter table public.reviews
  add column if not exists id bigint generated always as identity,
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reviews'::regclass and contype = 'p'
  ) then
    alter table public.reviews add primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reviews'::regclass and conname = 'reviews_user_word_unique'
  ) then
    alter table public.reviews add constraint reviews_user_word_unique unique (user_id, word_id);
  end if;
end $$;

create index if not exists reviews_user_priority_idx
  on public.reviews (user_id, level asc, next_review_at asc);
create index if not exists reviews_user_due_idx
  on public.reviews (user_id, next_review_at);

-- 4. Phân tách user_settings theo user_id (cho phép NULL tạm thời cho dòng id=1 cũ)
alter table public.user_settings drop constraint if exists user_settings_id_check;
alter table public.user_settings drop constraint if exists user_settings_pkey;
alter table public.user_settings
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create sequence if not exists public.user_settings_id_seq;
select setval('public.user_settings_id_seq', coalesce((select max(id) from public.user_settings), 1));
alter table public.user_settings alter column id set default nextval('public.user_settings_id_seq');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_settings'::regclass and contype = 'p'
  ) then
    alter table public.user_settings add primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_settings'::regclass and conname = 'user_settings_user_id_unique'
  ) then
    alter table public.user_settings add constraint user_settings_user_id_unique unique (user_id);
  end if;
end $$;

-- 5. Thêm cột user_id (nullable để tránh lỗi dữ liệu cũ) cho các bảng cá nhân khác
alter table public.study_folders
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists study_folders_user_idx on public.study_folders (user_id);

alter table public.study_sets
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists study_sets_user_idx on public.study_sets (user_id);

alter table public.reading_passages
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists reading_passages_user_idx on public.reading_passages (user_id, studied_at desc);

alter table public.reading_notes
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists reading_notes_user_idx on public.reading_notes (user_id, passage_id);

-- Kho từ chung: ghi nhận người đóng góp (nếu có) nhưng mọi user đều đọc được
alter table public.words
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- 6. RLS cho tất cả bảng dữ liệu cá nhân & kho từ chung
drop policy if exists "words_read_authenticated" on public.words;
create policy "words_read_authenticated"
  on public.words for select
  to authenticated
  using (true);

drop policy if exists "daily_words_read_authenticated" on public.daily_words;
create policy "daily_words_read_authenticated"
  on public.daily_words for select
  to authenticated
  using (true);

drop policy if exists "reviews_own_all" on public.reviews;
create policy "reviews_own_all"
  on public.reviews for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_settings_own_all" on public.user_settings;
create policy "user_settings_own_all"
  on public.user_settings for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "study_folders_own_all" on public.study_folders;
create policy "study_folders_own_all"
  on public.study_folders for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "study_sets_own_all" on public.study_sets;
create policy "study_sets_own_all"
  on public.study_sets for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "reading_passages_own_all" on public.reading_passages;
create policy "reading_passages_own_all"
  on public.reading_passages for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "reading_notes_own_all" on public.reading_notes;
create policy "reading_notes_own_all"
  on public.reading_notes for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
