-- Migration: Phân tách Từ vựng hằng ngày (daily_words) theo từng user_id & Cài đặt ngừng nhận thông báo
-- Chạy 1 lần trong Supabase > SQL Editor.

-- 1. Thêm user_id vào public.daily_words và tách unique constraint theo (user_id, day, word_id)
alter table public.daily_words
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.daily_words drop constraint if exists daily_words_day_word_id_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.daily_words'::regclass
      and conname = 'daily_words_user_day_word_unique'
  ) then
    alter table public.daily_words
      add constraint daily_words_user_day_word_unique unique (user_id, day, word_id);
  end if;
end $$;

create index if not exists daily_words_user_day_idx
  on public.daily_words (user_id, day desc);

-- Cập nhật RLS: mỗi user chỉ đọc/ghi từ hằng ngày của chính mình
drop policy if exists "daily_words_read_authenticated" on public.daily_words;
drop policy if exists "daily_words_own_all" on public.daily_words;
create policy "daily_words_own_all"
  on public.daily_words for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Bổ sung tuỳ chọn nhận thông báo & tìm từ hằng ngày vào public.user_settings
alter table public.user_settings
  add column if not exists notify_daily_vocab boolean not null default true,
  add column if not exists notify_review_due boolean not null default true,
  add column if not exists notify_writing_streak boolean not null default true,
  add column if not exists notify_morning boolean not null default true,
  add column if not exists notify_evening boolean not null default true;

notify pgrst, 'reload schema';
