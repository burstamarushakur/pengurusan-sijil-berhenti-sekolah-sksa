import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type,x-app-password',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });

const str = (value: unknown) => String(value ?? '').trim();
const YEAR = 2026;
const YEAR_LEVEL = 6;

type DB = ReturnType<typeof createClient>;

async function getSession(db: DB, year: number) {
  const { data, error } = await db
    .from('academic_sessions')
    .select('id,year,name,is_active')
    .eq('year', year)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Sesi ${year} tidak ditemui.`);
  return data;
}

async function getYear6Context(db: DB, year: number) {
  const session = await getSession(db, year);
  const { data: classes, error: ce } = await db
    .from('classes')
    .select('id,name,code,year_level,class_teacher_name')
    .eq('session_id', session.id)
    .eq('year_level', YEAR_LEVEL)
    .order('name');
  if (ce) throw ce;

  const classIds = (classes || []).map((c: any) => c.id);
  if (!classIds.length) return { session, classes: [], enrolments: [] as any[] };

  const { data: enrolments, error: ee } = await db
    .from('student_enrolments')
    .select('student_id,class_id')
    .eq('session_id', session.id)
    .eq('is_current', true)
    .in('class_id', classIds);
  if (ee) throw ee;
  return { session, classes: classes || [], enrolments: enrolments || [] };
}

async function getMembershipMap(db: DB, sessionId: string, studentIds: string[]) {
  const result = new Map<string, Record<string, string>>();
  if (!studentIds.length) return result;

  const { data: memberships, error: me } = await db
    .from('student_unit_memberships')
    .select('student_id,unit_id,category')
    .eq('session_id', sessionId)
    .eq('is_current', true)
    .in('student_id', studentIds);
  if (me) throw me;

  const unitIds = [...new Set((memberships || []).map((m: any) => m.unit_id))];
  const [{ data: units, error: ue }, { data: committee, error: coe }] = await Promise.all([
    unitIds.length
      ? db.from('units').select('id,name,category').in('id', unitIds)
      : Promise.resolve({ data: [], error: null } as any),
    db
      .from('unit_committee_members')
      .select('student_id,unit_id,position,sort_order')
      .eq('session_id', sessionId)
      .in('student_id', studentIds),
  ]);
  if (ue) throw ue;
  if (coe) throw coe;

  const unitMap = new Map((units || []).map((u: any) => [u.id, u]));
  const positionMap = new Map<string, string>();
  for (const row of committee || []) {
    const key = `${row.student_id}:${row.unit_id}`;
    if (!positionMap.has(key)) positionMap.set(key, str(row.position));
  }

  for (const membership of memberships || []) {
    const unit: any = unitMap.get(membership.unit_id);
    if (!unit) continue;
    const category = str(membership.category || unit.category);
    const position = positionMap.get(`${membership.student_id}:${membership.unit_id}`) || '';
    const label = position ? `${position} ${unit.name}` : unit.name;
    if (!result.has(membership.student_id)) result.set(membership.student_id, {});
    result.get(membership.student_id)![category] = label;
  }
  return result;
}

function isComplete(row: any) {
  return Boolean(
    str(row.full_name) &&
      str(row.date_of_birth) &&
      str(row.identification_no) &&
      str(row.school_entry_date) &&
      str(row.birth_certificate_no) &&
      str(row.leadership) &&
      str(row.koku?.club) &&
      str(row.koku?.sport) &&
      str(row.koku?.uniform)
  );
}

async function buildStudentsForClass(db: DB, year: number, classId: string) {
  const session = await getSession(db, year);
  const { data: classRow, error: ce } = await db
    .from('classes')
    .select('id,name,code,year_level,class_teacher_name')
    .eq('id', classId)
    .eq('session_id', session.id)
    .eq('year_level', YEAR_LEVEL)
    .maybeSingle();
  if (ce) throw ce;
  if (!classRow) throw new Error('Kelas tidak ditemui.');

  const { data: enrolments, error: ee } = await db
    .from('student_enrolments')
    .select('student_id')
    .eq('session_id', session.id)
    .eq('class_id', classId)
    .eq('is_current', true);
  if (ee) throw ee;
  const ids = (enrolments || []).map((e: any) => e.student_id);
  if (!ids.length) return { classInfo: classRow, students: [] };

  const [studentsQ, profilesQ, certsQ] = await Promise.all([
    db.from('students').select('id,full_name,identification_no,date_of_birth,active').in('id', ids),
    db.from('student_master_profiles').select('student_id,school_entry_date').in('student_id', ids),
    db
      .from('school_leaving_certificates')
      .select('student_id,session_year,serial_no,birth_certificate_no,leadership,conduct,status,updated_at')
      .eq('session_year', year)
      .in('student_id', ids),
  ]);
  if (studentsQ.error) throw studentsQ.error;
  if (profilesQ.error) throw profilesQ.error;
  if (certsQ.error) throw certsQ.error;

  const studentMap = new Map((studentsQ.data || []).map((s: any) => [s.id, s]));
  const profileMap = new Map((profilesQ.data || []).map((p: any) => [p.student_id, p]));
  const certMap = new Map((certsQ.data || []).map((c: any) => [c.student_id, c]));
  const kokuMap = await getMembershipMap(db, session.id, ids);

  const students = ids
    .map((id: string) => {
      const s: any = studentMap.get(id) || {};
      const p: any = profileMap.get(id) || {};
      const c: any = certMap.get(id) || {};
      const koku = kokuMap.get(id) || {};
      const row = {
        student_id: id,
        full_name: s.full_name || '',
        identification_no: s.identification_no || '',
        date_of_birth: s.date_of_birth || '',
        school_entry_date: p.school_entry_date || '',
        serial_no: c.serial_no || null,
        birth_certificate_no: c.birth_certificate_no || '',
        leadership: c.leadership || '',
        conduct: c.conduct || 'BAIK',
        stored_status: c.status || 'DRAF',
        updated_at: c.updated_at || null,
        koku: {
          club: koku.club || '',
          sport: koku.sport || '',
          uniform: koku.uniform || '',
        },
      };
      return { ...row, status: isComplete(row) ? 'SELESAI' : 'DRAF' };
    })
    .sort((a: any, b: any) => (a.serial_no ?? 9999) - (b.serial_no ?? 9999) || a.full_name.localeCompare(b.full_name));

  return { classInfo: classRow, students };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  const appPassword = req.headers.get('x-app-password') || '';
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ success: false, error: 'Konfigurasi Supabase belum lengkap.' }, 500);

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: authorized, error: authError } = await db.rpc('segak_bridge_authorized', {
    p_bridge_token: appPassword,
  });
  if (authError || authorized !== true) return json({ success: false, error: 'PASSWORD_TIDAK_SAH' }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const action = str(body.action || 'auth');
    const year = Number(body.year || YEAR);
    if (!Number.isFinite(year)) return json({ success: false, error: 'Tahun tidak sah.' }, 400);

    if (action === 'auth') return json({ success: true });

    if (action === 'getConfig') {
      const { data: settings, error } = await db
        .from('school_leaving_settings')
        .select('*')
        .eq('session_year', year)
        .maybeSingle();
      if (error) throw error;
      return json({ success: true, settings });
    }

    if (action === 'getClasses') {
      const { session, classes, enrolments } = await getYear6Context(db, year);
      const ids = enrolments.map((e: any) => e.student_id);
      if (!ids.length) return json({ success: true, classes: [] });

      const [studentsQ, profilesQ, certsQ, membershipsQ] = await Promise.all([
        db.from('students').select('id,full_name,identification_no,date_of_birth').in('id', ids),
        db.from('student_master_profiles').select('student_id,school_entry_date').in('student_id', ids),
        db
          .from('school_leaving_certificates')
          .select('student_id,birth_certificate_no,leadership')
          .eq('session_year', year)
          .in('student_id', ids),
        db
          .from('student_unit_memberships')
          .select('student_id,category')
          .eq('session_id', session.id)
          .eq('is_current', true)
          .in('student_id', ids),
      ]);
      if (studentsQ.error) throw studentsQ.error;
      if (profilesQ.error) throw profilesQ.error;
      if (certsQ.error) throw certsQ.error;
      if (membershipsQ.error) throw membershipsQ.error;

      const studentMap = new Map((studentsQ.data || []).map((s: any) => [s.id, s]));
      const profileMap = new Map((profilesQ.data || []).map((p: any) => [p.student_id, p]));
      const certMap = new Map((certsQ.data || []).map((c: any) => [c.student_id, c]));
      const categoryMap = new Map<string, Set<string>>();
      for (const m of membershipsQ.data || []) {
        if (!categoryMap.has(m.student_id)) categoryMap.set(m.student_id, new Set());
        categoryMap.get(m.student_id)!.add(str(m.category));
      }

      const classById = new Map(classes.map((c: any) => [c.id, c]));
      const groups = new Map<string, string[]>();
      for (const e of enrolments) {
        if (!groups.has(e.class_id)) groups.set(e.class_id, []);
        groups.get(e.class_id)!.push(e.student_id);
      }

      const output = classes.map((c: any) => {
        const memberIds = groups.get(c.id) || [];
        const completed = memberIds.filter((id: string) => {
          const s: any = studentMap.get(id) || {};
          const p: any = profileMap.get(id) || {};
          const cert: any = certMap.get(id) || {};
          const cats = categoryMap.get(id) || new Set();
          return Boolean(
            str(s.full_name) &&
              str(s.date_of_birth) &&
              str(s.identification_no) &&
              str(p.school_entry_date) &&
              str(cert.birth_certificate_no) &&
              str(cert.leadership) &&
              cats.has('club') &&
              cats.has('sport') &&
              cats.has('uniform')
          );
        }).length;
        return {
          id: c.id,
          name: c.name,
          code: c.code,
          class_teacher_name: c.class_teacher_name,
          total: memberIds.length,
          completed,
          pending: memberIds.length - completed,
        };
      });
      return json({ success: true, classes: output });
    }

    if (action === 'getStudentsByClass') {
      const classId = str(body.classId);
      if (!classId) return json({ success: false, error: 'classId diperlukan.' }, 400);
      const result = await buildStudentsForClass(db, year, classId);
      return json({ success: true, ...result });
    }

    if (action === 'saveStudent') {
      const studentId = str(body.studentId);
      if (!studentId) return json({ success: false, error: 'studentId diperlukan.' }, 400);
      const birthCertificateNo = str(body.birthCertificateNo) || null;
      const leadership = str(body.leadership) || null;

      const { data: existing, error: findError } = await db
        .from('school_leaving_certificates')
        .select('id,serial_no')
        .eq('student_id', studentId)
        .eq('session_year', year)
        .maybeSingle();
      if (findError) throw findError;
      if (!existing) return json({ success: false, error: 'Rekod sijil murid tidak ditemui.' }, 404);

      const { error: updateError } = await db
        .from('school_leaving_certificates')
        .update({ birth_certificate_no: birthCertificateNo, leadership, conduct: 'BAIK' })
        .eq('id', existing.id);
      if (updateError) throw updateError;

      const { session, classes, enrolments } = await getYear6Context(db, year);
      const classId = enrolments.find((e: any) => e.student_id === studentId)?.class_id;
      if (!classId) return json({ success: false, error: 'Murid bukan dalam kelas Tahun 6 semasa.' }, 400);

      const current = await buildStudentsForClass(db, year, classId);
      const row = current.students.find((s: any) => s.student_id === studentId);
      const status = row?.status || 'DRAF';
      const { error: statusError } = await db
        .from('school_leaving_certificates')
        .update({ status })
        .eq('id', existing.id);
      if (statusError) throw statusError;

      return json({ success: true, student: row ? { ...row, status } : null });
    }

    return json({ success: false, error: `Action tidak dikenali: ${action}` }, 400);
  } catch (error) {
    console.error(error);
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
