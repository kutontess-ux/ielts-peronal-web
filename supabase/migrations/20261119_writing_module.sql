-- Migration: Module IELTS Writing (Kho đề chờ luyện & Lịch sử chấm chữa / Kỷ luật 3 bước)
-- Chạy 1 lần trong Supabase > SQL Editor.

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
