-- Migration: Thêm lịch tự ôn lại cho từng Học phần (Study Sets)
-- Chạy 1 lần trong Supabase > SQL Editor.

alter table public.study_sets
  add column if not exists last_studied_at timestamptz,
  add column if not exists next_review_at  timestamptz,
  add column if not exists review_level    smallint not null default 0 check (review_level between 0 and 5),
  add column if not exists study_count     int not null default 0,
  add column if not exists last_score      smallint check (last_score is null or (last_score between 0 and 100));

create index if not exists study_sets_last_studied_idx on public.study_sets (last_studied_at desc);
create index if not exists study_sets_next_review_idx  on public.study_sets (next_review_at asc);
