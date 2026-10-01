create table if not exists public.school_leaving_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null unique,
  ic_hash text not null unique,
  role text not null default 'editor' check (role in ('editor','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_leaving_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.school_leaving_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.school_leaving_audit_log (
  id bigserial primary key,
  user_id uuid references public.school_leaving_users(id) on delete set null,
  user_name text not null,
  student_id uuid references public.students(id) on delete set null,
  session_year integer not null,
  action text not null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.school_leaving_certificates
  add column if not exists last_updated_by uuid references public.school_leaving_users(id) on delete set null,
  add column if not exists last_updated_by_name text;

create index if not exists school_leaving_sessions_token_hash_idx on public.school_leaving_sessions(token_hash);
create index if not exists school_leaving_sessions_expires_at_idx on public.school_leaving_sessions(expires_at);
create index if not exists school_leaving_audit_student_idx on public.school_leaving_audit_log(student_id, session_year, created_at desc);
create index if not exists school_leaving_certificates_last_updated_by_idx on public.school_leaving_certificates(last_updated_by);

alter table public.school_leaving_users enable row level security;
alter table public.school_leaving_sessions enable row level security;
alter table public.school_leaving_audit_log enable row level security;

-- IC sebenar tidak disimpan. Hanya SHA-256 bagi 12 digit IC digunakan untuk login.
insert into public.school_leaving_users (full_name, ic_hash, role, active) values
  ('MOHD HASRUL ASRAF BIN OTHMAN', 'bae7f3215665ce277cf75ee50aecafaa5d1780442be8ab402b4653dfcabc3ceb', 'editor', true),
  ('NOR FARAHIN BINTI MOHD HALIL', 'fc6f836a0527350a0a95fdacf21175a6354175022214dbb621793f22bd414bc7', 'editor', true),
  ('MARDIANA BT SAMSURY', '3a64f7016fb86c8aef02b2663b5a76a9a3fb91671c4f6eac8ef9668917b5d8c1', 'editor', true),
  ('SITI HAJAR BINTI SUBARI', '4898a4c19360e8a5303e87cb9b2300786c72d5492e74170c41373078b2453e6f', 'editor', true)
on conflict (full_name) do update set
  ic_hash = excluded.ic_hash,
  role = excluded.role,
  active = excluded.active,
  updated_at = now();
