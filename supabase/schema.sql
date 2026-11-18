-- IELTS Personal – schema v1 (chạy 1 lần trong Supabase > SQL Editor)

create table if not exists public.words (
  id           bigint generated always as identity primary key,
  lemma        text not null,                 -- dạng gốc, chữ thường: "analyse"
  norm_key     text not null unique,          -- khoá chống trùng (gộp Anh/Mỹ: analyse/analyze)
  ipa          text,
  audio_url    text,
  pos          text,                          -- n | v | adj | adv ...
  meaning_vi   text,
  definition_en text,
  example      text,
  collocations text[] default '{}',
  synonyms     text[] default '{}',
  cefr_level   text check (cefr_level in ('A2','B1','B2','C1','C2')),
  topic        text,
  is_awl       boolean not null default false,
  status       text not null default 'approved' check (status in ('pending','approved')),
  source       text not null default 'import', -- import | daily-news | daily-ielts | seed
  created_at   timestamptz not null default now()
);
create index if not exists words_level_idx on public.words (cefr_level);
create index if not exists words_topic_idx on public.words (topic);
create index if not exists words_status_idx on public.words (status);

-- Lịch sử mỗi lần nạp hàng loạt
create table if not exists public.imports (
  id          bigint generated always as identity primary key,
  total       int not null default 0,
  added       int not null default 0,
  duplicates  int not null default 0,
  invalid     int not null default 0,
  created_at  timestamptz not null default now()
);

-- Từ hằng ngày (riêng cho từng người dùng)
create table if not exists public.daily_words (
  id              bigint generated always as identity primary key,
  user_id         uuid references auth.users(id) on delete cascade,
  day             date not null,
  word_id         bigint not null references public.words(id) on delete cascade,
  kind            text not null check (kind in ('news','ielts')),
  source_sentence text,
  article_title   text,
  article_url     text,
  unique (user_id, day, word_id)
);
create index if not exists daily_day_idx on public.daily_words (day);
create index if not exists daily_words_user_day_idx on public.daily_words (user_id, day desc);

-- Ôn tập ngắt quãng Leitner 5 cấp độ (mỗi từ 1 dòng)
create table if not exists public.reviews (
  word_id          bigint primary key references public.words(id) on delete cascade,
  level            smallint not null default 1 check (level between 1 and 5),
  next_review_at   timestamptz not null default now(),
  level5_streak    int not null default 0,
  lapses           int not null default 0,
  last_reviewed_at timestamptz
);
create index if not exists reviews_priority_idx on public.reviews (level asc, next_review_at asc);
create index if not exists reviews_due_idx on public.reviews (next_review_at);

-- Cài đặt người dùng cho ôn tập ngắt quãng & thông báo
create table if not exists public.user_settings (
  id                    int primary key default 1 check (id = 1),
  daily_review_limit    int not null default 50 check (daily_review_limit between 5 and 500),
  daily_new_limit       int not null default 15 check (daily_new_limit between 0 and 200),
  session_size          int not null default 15 check (session_size between 5 and 50),
  notify_daily_vocab    boolean not null default true,
  notify_review_due     boolean not null default true,
  notify_writing_streak boolean not null default true,
  notify_morning        boolean not null default true,
  notify_evening        boolean not null default true,
  updated_at            timestamptz not null default now()
);
insert into public.user_settings (id) values (1) on conflict (id) do nothing;

-- Bảo mật: bật RLS, không mở quyền công khai. Server dùng Secret key nên vẫn truy cập được.
alter table public.words         enable row level security;
alter table public.imports       enable row level security;
alter table public.daily_words   enable row level security;
alter table public.reviews       enable row level security;
alter table public.user_settings enable row level security;

-- Module Reading: lưu lịch sử bài đã làm + ghi chú phân tích
create table if not exists public.reading_passages (
  id            bigint generated always as identity primary key,
  title         text not null,
  source_name   text,
  topic         text,
  content       text not null,
  score_correct int,
  score_total   int,
  studied_at    date not null default current_date,
  created_at    timestamptz not null default now()
);
create index if not exists reading_passages_studied_idx on public.reading_passages (studied_at desc);

create table if not exists public.reading_notes (
  id          bigint generated always as identity primary key,
  passage_id  bigint not null references public.reading_passages(id) on delete cascade,
  kind        text not null check (kind in ('vocab','sentence','question')),
  target_text text not null,
  result_json jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists reading_notes_passage_idx on public.reading_notes (passage_id);

alter table public.reading_passages enable row level security;
alter table public.reading_notes    enable row level security;

-- Học phần & Thư mục Flashcards (đồng bộ giữa các thiết bị)
create table if not exists public.study_folders (
  id         text primary key,
  name       text not null,
  desc_text  text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.study_sets (
  id              text primary key,
  title           text not null,
  desc_text       text not null default '',
  word_ids        bigint[] not null default '{}',
  folder_id       text references public.study_folders(id) on delete set null,
  last_studied_at timestamptz,
  next_review_at  timestamptz,
  review_level    smallint not null default 0 check (review_level between 0 and 5),
  study_count     int not null default 0,
  last_score      smallint check (last_score is null or (last_score between 0 and 100)),
  created_at      timestamptz not null default now()
);
create index if not exists study_sets_folder_idx       on public.study_sets (folder_id);
create index if not exists study_sets_last_studied_idx on public.study_sets (last_studied_at desc);
create index if not exists study_sets_next_review_idx  on public.study_sets (next_review_at asc);

alter table public.study_folders enable row level security;
alter table public.study_sets    enable row level security;

-- Module Writing: Kho đề chờ luyện & Lịch sử chấm chữa / Kỷ luật 3 bước
create table if not exists public.writing_prompts (
  id                bigint generated always as identity primary key,
  user_id           uuid references auth.users(id) on delete cascade,
  task_type         text not null check (task_type in ('task1', 'task2')),
  sub_type          text not null default 'opinion' check (
    sub_type in (
      'opinion', 'discussion', 'problem_solution', 'two_part',
      'line_graph', 'bar_chart', 'pie_chart', 'table', 'process', 'map', 'mixed'
    )
  ),
  title             text not null,
  source_name       text,
  topic             text default 'Other',
  prompt_text       text not null,
  image_data_url    text,
  chart_notes       text,
  ai_guide_json     jsonb,
  status            text not null default 'queued' check (status in ('queued', 'practiced', 'mastered')),
  times_practiced   int not null default 0,
  last_practiced_at timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists writing_prompts_user_status_idx
  on public.writing_prompts (user_id, status, created_at desc);

create table if not exists public.writing_submissions (
  id                       bigint generated always as identity primary key,
  user_id                  uuid references auth.users(id) on delete cascade,
  prompt_id                bigint references public.writing_prompts(id) on delete set null,
  mode                     text not null default 'daily_drill' check (mode in ('daily_drill', 'full_essay')),
  drill_focus              text not null default 'full' check (
    drill_focus in ('intro_thesis', 'body_peel_1', 'body_peel_2', 'task1_overview', 'task1_body', 'full')
  ),
  task_type                text not null check (task_type in ('task1', 'task2')),
  sub_type                 text not null default 'opinion',
  topic                    text default 'Other',
  prompt_snapshot          text not null,
  image_snapshot           text,
  target_words             text[] not null default '{}',
  used_target_words        text[] not null default '{}',
  step_drafts_json         jsonb not null default '{}'::jsonb,
  content                  text not null default '',
  word_count               int not null default 0,
  duration_seconds         int not null default 0,
  overall_band             numeric(3,1),
  tr_band                  numeric(3,1),
  cc_band                  numeric(3,1),
  lr_band                  numeric(3,1),
  gra_band                 numeric(3,1),
  feedback_json            jsonb,
  rewritten_sentences_json jsonb not null default '{}'::jsonb,
  discipline_completed     boolean not null default false,
  studied_at               date not null default current_date,
  created_at               timestamptz not null default now()
);
create index if not exists writing_submissions_user_studied_idx
  on public.writing_submissions (user_id, studied_at desc, created_at desc);
create index if not exists writing_submissions_prompt_idx
  on public.writing_submissions (prompt_id);

alter table public.writing_prompts     enable row level security;
alter table public.writing_submissions enable row level security;

drop policy if exists "writing_prompts_own_all" on public.writing_prompts;
create policy "writing_prompts_own_all"
  on public.writing_prompts for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "writing_submissions_own_all" on public.writing_submissions;
create policy "writing_submissions_own_all"
  on public.writing_submissions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
