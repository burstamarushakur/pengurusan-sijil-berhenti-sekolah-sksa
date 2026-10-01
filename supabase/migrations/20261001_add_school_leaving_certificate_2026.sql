create table if not exists public.school_leaving_settings (
  session_year integer primary key,
  school_code text not null default 'JBA5095',
  school_name text not null default 'SEKOLAH KEBANGSAAN SUNGAI ABONG',
  state_name text not null default 'JOHOR',
  leaving_date date not null,
  principal_name text not null default 'SITI ZALEHA BINTI RAMLAN',
  principal_title text not null default 'Guru Besar,',
  principal_school_line text not null default 'SK Sungai Abong',
  serial_prefix text not null default 'jba5095',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_leaving_certificates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  session_year integer not null,
  serial_no integer not null check (serial_no > 0),
  birth_certificate_no text,
  leadership text,
  conduct text not null default 'BAIK',
  status text not null default 'DRAF' check (status in ('DRAF','SELESAI')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, session_year),
  unique (session_year, serial_no)
);

alter table public.school_leaving_settings enable row level security;
alter table public.school_leaving_certificates enable row level security;

create or replace function public.school_leaving_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_school_leaving_settings_updated_at on public.school_leaving_settings;
create trigger trg_school_leaving_settings_updated_at
before update on public.school_leaving_settings
for each row execute function public.school_leaving_touch_updated_at();

drop trigger if exists trg_school_leaving_certificates_updated_at on public.school_leaving_certificates;
create trigger trg_school_leaving_certificates_updated_at
before update on public.school_leaving_certificates
for each row execute function public.school_leaving_touch_updated_at();

insert into public.school_leaving_settings (
  session_year, school_code, school_name, state_name, leaving_date,
  principal_name, principal_title, principal_school_line, serial_prefix
)
values (
  2026, 'JBA5095', 'SEKOLAH KEBANGSAAN SUNGAI ABONG', 'JOHOR', date '2026-12-31',
  'SITI ZALEHA BINTI RAMLAN', 'Guru Besar,', 'SK Sungai Abong', 'jba5095'
)
on conflict (session_year) do update set
  school_code = excluded.school_code,
  school_name = excluded.school_name,
  state_name = excluded.state_name,
  leaving_date = excluded.leaving_date,
  principal_name = excluded.principal_name,
  principal_title = excluded.principal_title,
  principal_school_line = excluded.principal_school_line,
  serial_prefix = excluded.serial_prefix;

with roster as (
  select
    s.id as student_id,
    row_number() over (
      order by
        case c.name
          when '6 IBNU BATTUTAH' then 1
          when '6 IBNU KHALDUN' then 2
          when '6 IBNU SINA' then 3
          else 9
        end,
        s.full_name
    )::integer as serial_no
  from public.student_enrolments se
  join public.academic_sessions a on a.id = se.session_id and a.year = 2026
  join public.classes c on c.id = se.class_id and c.year_level = 6
  join public.students s on s.id = se.student_id and s.active = true
  where se.is_current = true
)
insert into public.school_leaving_certificates (
  student_id, session_year, serial_no, conduct, status
)
select student_id, 2026, serial_no, 'BAIK', 'DRAF'
from roster
on conflict (student_id, session_year) do nothing;
