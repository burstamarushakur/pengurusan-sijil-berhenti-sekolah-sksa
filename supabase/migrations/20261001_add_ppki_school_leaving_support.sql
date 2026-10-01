-- Applied to production on 2026-10-01.
-- Adds PPKI selection support and authorizes the PPKI teacher login.

alter table public.school_leaving_certificates
  add column if not exists student_stream text not null default 'MAINSTREAM',
  add column if not exists selected_for_certificate boolean not null default true;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname='school_leaving_certificates_student_stream_check'
  ) then
    alter table public.school_leaving_certificates
      add constraint school_leaving_certificates_student_stream_check
      check (student_stream in ('MAINSTREAM','PPKI'));
  end if;
end $$;

create index if not exists school_leaving_certificates_stream_selected_idx
  on public.school_leaving_certificates(session_year,student_stream,selected_for_certificate);

-- Cikgu Hidayah. Only the SHA-256 of the 12-digit IC is stored.
insert into public.school_leaving_users (full_name, ic_hash, role, active)
values ('NOOR HIDAYAH BT JAMAL','5810bec9df19cea75dbe77c4653cbb3d7105e42a16153601d9f29b01dd460da6','editor',true)
on conflict (full_name) do update set
  ic_hash=excluded.ic_hash,
  role=excluded.role,
  active=true,
  updated_at=now();
