-- Migration: Đồng bộ Thư mục & Học phần (Study Folders & Study Sets) lên Supabase
-- Chạy 1 lần trong Supabase > SQL Editor.

create table if not exists public.study_folders (
  id         text primary key,
  name       text not null,
  desc_text  text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.study_sets (
  id         text primary key,
  title      text not null,
  desc_text  text not null default '',
  word_ids   bigint[] not null default '{}',
  folder_id  text references public.study_folders(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists study_sets_folder_idx on public.study_sets (folder_id);

alter table public.study_folders enable row level security;
alter table public.study_sets    enable row level security;
