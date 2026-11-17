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

-- Từ hằng ngày
create table if not exists public.daily_words (
  id              bigint generated always as identity primary key,
  day             date not null,
  word_id         bigint not null references public.words(id) on delete cascade,
  kind            text not null check (kind in ('news','ielts')),
  source_sentence text,
  article_title   text,
  article_url     text,
  unique (day, word_id)
);
create index if not exists daily_day_idx on public.daily_words (day);

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

-- Cài đặt người dùng cho ôn tập ngắt quãng
create table if not exists public.user_settings (
  id                 int primary key default 1 check (id = 1),
  daily_review_limit int not null default 50 check (daily_review_limit between 5 and 500),
  daily_new_limit    int not null default 15 check (daily_new_limit between 0 and 200),
  session_size       int not null default 15 check (session_size between 5 and 50),
  updated_at         timestamptz not null default now()
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
