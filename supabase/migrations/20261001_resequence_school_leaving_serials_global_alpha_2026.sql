-- Production migration already applied on 2026-10-01.
-- Reassign 2026 certificate serial numbers globally by pupil full name,
-- across all Year 6 classes, instead of restarting/continuing by class.

update public.school_leaving_certificates
set serial_no = serial_no + 1000
where session_year = 2026;

with ranked as (
  select c.id,
         row_number() over (
           order by upper(trim(s.full_name)), s.full_name, c.student_id
         )::integer as new_serial
  from public.school_leaving_certificates c
  join public.students s on s.id = c.student_id
  where c.session_year = 2026
)
update public.school_leaving_certificates c
set serial_no = r.new_serial
from ranked r
where c.id = r.id;
