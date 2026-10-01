update public.school_leaving_users
set role='editor', updated_at=now()
where full_name in (
  'MOHD HASRUL ASRAF BIN OTHMAN',
  'NOR FARAHIN BINTI MOHD HALIL',
  'MARDIANA BT SAMSURY',
  'SITI HAJAR BINTI SUBARI'
);
