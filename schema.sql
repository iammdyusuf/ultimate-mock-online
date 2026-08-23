create table if not exists users (
  id bigserial primary key,
  name text not null,
  email text unique not null,
  password_hash text not null,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id bigserial primary key,
  question text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  answer smallint not null check(answer between 0 and 3),
  subject text not null default 'General',
  difficulty text not null default 'Medium',
  explanation text default '',
  created_at timestamptz not null default now()
);

create table if not exists results (
  id bigserial primary key,
  user_id bigint references users(id) on delete cascade,
  exam_title text not null,
  correct int not null,
  wrong int not null,
  unanswered int not null,
  total int not null,
  raw_score numeric not null,
  percentage numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists results_score_idx on results(percentage desc, created_at desc);
create index if not exists questions_subject_idx on questions(subject);

-- Optional: enable Supabase Realtime for results in the Supabase dashboard.
