-- Migration: Cá nhân hoá Kho từ vựng theo từng user (public.user_words)
-- Chỉ giữ phần Bộ sách (words.source LIKE 'book-%') làm tài nguyên cộng đồng dùng chung.
-- Các từ người dùng tự tải lên, đã tra, từ hằng ngày, đã học / ôn tập sẽ thuộc riêng từng user_id.
-- Chạy 1 lần trong Supabase > SQL Editor.

create table if not exists public.user_words (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  word_id    bigint not null references public.words(id) on delete cascade,
  source     text not null default 'import',
  created_at timestamptz not null default now(),
  unique (user_id, word_id)
);

create index if not exists user_words_user_created_idx
  on public.user_words (user_id, created_at desc);

create index if not exists user_words_word_idx
  on public.user_words (word_id);

alter table public.user_words enable row level security;

drop policy if exists "user_words_own_all" on public.user_words;
create policy "user_words_own_all"
  on public.user_words for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Backfill 1: Từ vựng hằng ngày (daily_words) của từng user
insert into public.user_words (user_id, word_id, source)
select distinct dw.user_id, dw.word_id, 'daily-' || dw.kind
from public.daily_words dw
where dw.user_id is not null
on conflict (user_id, word_id) do nothing;

-- Backfill 2: Từ vựng user đã đưa vào Ôn tập ngắt quãng (reviews)
insert into public.user_words (user_id, word_id, source)
select distinct r.user_id, r.word_id, 'review'
from public.reviews r
where r.user_id is not null
on conflict (user_id, word_id) do nothing;

-- Backfill 3: Từ vựng trong Thẻ ghi nhớ cá nhân (study_sets)
insert into public.user_words (user_id, word_id, source)
select distinct ss.user_id, wid, 'study-set'
from public.study_sets ss
cross join lateral unnest(ss.word_ids) as wid
join public.words w on w.id = wid
where ss.user_id is not null
on conflict (user_id, word_id) do nothing;

-- Backfill 4: Từ vựng user đã tự bấm tra trong Reading (không tính các từ auto-highlight chưa bấm)
insert into public.user_words (user_id, word_id, source)
select distinct rn.user_id, w.id, 'reading'
from public.reading_notes rn
join public.words w
  on w.norm_key = coalesce(nullif(rn.result_json->>'norm_key', ''), lower(trim(rn.target_text)))
where rn.user_id is not null
  and rn.kind = 'vocab'
  and coalesce(rn.result_json->>'ai_picked', 'false') <> 'true'
on conflict (user_id, word_id) do nothing;

-- Backfill 5: Từ vựng user đã tạo trước đây (ngoài Bộ sách cộng đồng book-*)
insert into public.user_words (user_id, word_id, source)
select w.created_by, w.id, coalesce(nullif(w.source, ''), 'import')
from public.words w
where w.created_by is not null
  and coalesce(w.source, '') not like 'book-%'
on conflict (user_id, word_id) do nothing;

notify pgrst, 'reload schema';
