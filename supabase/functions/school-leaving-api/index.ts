import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type,x-session-token',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
const str = (value: unknown) => String(value ?? '').trim();
const YEAR = 2026;
const YEAR_LEVEL = 6;
const SESSION_HOURS = 12;
const PPKI_SERIAL_START = 80;
const PPKI_PLACEHOLDER_START = 10000;
const PPKI_TEMP_START = 20000;
type DB = ReturnType<typeof createClient>;
type AppUser = { id: string; full_name: string; role: string };
type AppSession = { id: string; user_id: string; expires_at: string };

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function alphaCompare(a: any, b: any) {
  return str(a?.full_name).localeCompare(str(b?.full_name), 'en', { sensitivity: 'base' });
}
async function loginWithIc(db: DB, icValue: unknown) {
  const ic = str(icValue).replace(/\D/g, '');
  if (!/^\d{12}$/.test(ic)) return { ok: false as const, error: 'IC_TIDAK_SAH' };
  const icHash = await sha256Hex(ic);
  const { data: user, error } = await db.from('school_leaving_users').select('id,full_name,role,active').eq('ic_hash', icHash).eq('active', true).maybeSingle();
  if (error) throw error;
  if (!user) return { ok: false as const, error: 'IC_TIDAK_DIBENARKAN' };
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  const { error: se } = await db.from('school_leaving_sessions').insert({ user_id: user.id, token_hash: tokenHash, expires_at: expiresAt });
  if (se) throw se;
  return { ok: true as const, token, expiresAt, user: { id: user.id, full_name: user.full_name, role: user.role } };
}
async function requireSession(db: DB, req: Request) {
  const token = str(req.headers.get('x-session-token'));
  if (!token) return { ok: false as const, error: 'SESI_DIPERLUKAN' };
  const tokenHash = await sha256Hex(token);
  const { data: session, error: se } = await db.from('school_leaving_sessions').select('id,user_id,expires_at').eq('token_hash', tokenHash).maybeSingle();
  if (se) throw se;
  if (!session) return { ok: false as const, error: 'SESI_TIDAK_SAH' };
  if (new Date(session.expires_at).getTime() <= Date.now()) return { ok: false as const, error: 'SESI_TAMAT' };
  const { data: user, error: ue } = await db.from('school_leaving_users').select('id,full_name,role,active').eq('id', session.user_id).eq('active', true).maybeSingle();
  if (ue) throw ue;
  if (!user) return { ok: false as const, error: 'PENGGUNA_TIDAK_AKTIF' };
  return { ok: true as const, session: session as AppSession, user: { id: user.id, full_name: user.full_name, role: user.role } as AppUser };
}
async function getSession(db: DB, year: number) {
  const { data, error } = await db.from('academic_sessions').select('id,year,name,is_active').eq('year', year).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Sesi ${year} tidak ditemui.`);
  return data;
}
async function getYear6Context(db: DB, year: number) {
  const session = await getSession(db, year);
  const { data: classes, error: ce } = await db.from('classes').select('id,name,code,year_level,class_teacher_name').eq('session_id', session.id).eq('year_level', YEAR_LEVEL).order('name');
  if (ce) throw ce;
  const classIds = (classes || []).map((c: any) => c.id);
  if (!classIds.length) return { session, classes: [], enrolments: [] as any[] };
  const { data: enrolments, error: ee } = await db.from('student_enrolments').select('student_id,class_id').eq('session_id', session.id).eq('is_current', true).in('class_id', classIds);
  if (ee) throw ee;
  return { session, classes: classes || [], enrolments: enrolments || [] };
}
async function getPPKIContext(db: DB, year: number) {
  const session = await getSession(db, year);
  const { data: classes, error: ce } = await db.from('classes').select('id,name,code,year_level,class_teacher_name').eq('session_id', session.id).or('name.ilike.%PPKI%,code.ilike.%PPKI%').order('name');
  if (ce) throw ce;
  const classIds = (classes || []).map((c: any) => c.id);
  if (!classIds.length) return { session, classes: [], enrolments: [] as any[] };
  const { data: enrolments, error: ee } = await db.from('student_enrolments').select('student_id,class_id').eq('session_id', session.id).eq('is_current', true).in('class_id', classIds);
  if (ee) throw ee;
  return { session, classes: classes || [], enrolments: enrolments || [] };
}
async function getMembershipMap(db: DB, sessionId: string, studentIds: string[]) {
  const result = new Map<string, Record<string, string>>();
  if (!studentIds.length) return result;
  const { data: memberships, error: me } = await db.from('student_unit_memberships').select('student_id,unit_id,category').eq('session_id', sessionId).eq('is_current', true).in('student_id', studentIds);
  if (me) throw me;
  const unitIds = [...new Set((memberships || []).map((m: any) => m.unit_id))];
  const [{ data: units, error: ue }, { data: committee, error: coe }] = await Promise.all([
    unitIds.length ? db.from('units').select('id,name,category').in('id', unitIds) : Promise.resolve({ data: [], error: null } as any),
    db.from('unit_committee_members').select('student_id,unit_id,position,sort_order').eq('session_id', sessionId).in('student_id', studentIds),
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
  return Boolean(str(row.full_name) && str(row.date_of_birth) && str(row.identification_no) && str(row.school_entry_date) && str(row.birth_certificate_no) && str(row.leadership) && str(row.koku?.club) && str(row.koku?.sport) && str(row.koku?.uniform));
}
async function buildStudentsFromIds(db: DB, year: number, sessionId: string, ids: string[], classNameByStudent = new Map<string, string>()) {
  if (!ids.length) return [];
  const [studentsQ, profilesQ, certsQ] = await Promise.all([
    db.from('students').select('id,full_name,identification_no,date_of_birth,active').in('id', ids),
    db.from('student_master_profiles').select('student_id,school_entry_date').in('student_id', ids),
    db.from('school_leaving_certificates').select('student_id,session_year,serial_no,birth_certificate_no,leadership,conduct,status,updated_at,last_updated_by_name,student_stream,selected_for_certificate').eq('session_year', year).in('student_id', ids),
  ]);
  if (studentsQ.error) throw studentsQ.error;
  if (profilesQ.error) throw profilesQ.error;
  if (certsQ.error) throw certsQ.error;
  const studentMap = new Map((studentsQ.data || []).map((s: any) => [s.id, s]));
  const profileMap = new Map((profilesQ.data || []).map((p: any) => [p.student_id, p]));
  const certMap = new Map((certsQ.data || []).map((c: any) => [c.student_id, c]));
  const kokuMap = await getMembershipMap(db, sessionId, ids);
  return ids.map((id: string) => {
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
      class_name: classNameByStudent.get(id) || '',
      serial_no: c.serial_no || null,
      birth_certificate_no: c.birth_certificate_no || '',
      leadership: c.leadership || '',
      conduct: c.conduct || 'BAIK',
      stored_status: c.status || 'DRAF',
      updated_at: c.updated_at || null,
      last_updated_by_name: c.last_updated_by_name || '',
      student_stream: c.student_stream || 'MAINSTREAM',
      selected_for_certificate: c.selected_for_certificate !== false,
      koku: { club: koku.club || '', sport: koku.sport || '', uniform: koku.uniform || '' },
    };
    return { ...row, status: isComplete(row) ? 'SELESAI' : 'DRAF' };
  });
}
async function buildStudentsForClass(db: DB, year: number, classId: string) {
  const session = await getSession(db, year);
  const { data: classRow, error: ce } = await db.from('classes').select('id,name,code,year_level,class_teacher_name').eq('id', classId).eq('session_id', session.id).eq('year_level', YEAR_LEVEL).maybeSingle();
  if (ce) throw ce;
  if (!classRow) throw new Error('Kelas tidak ditemui.');
  const { data: enrolments, error: ee } = await db.from('student_enrolments').select('student_id').eq('session_id', session.id).eq('class_id', classId).eq('is_current', true);
  if (ee) throw ee;
  const ids = (enrolments || []).map((e: any) => e.student_id);
  const classMap = new Map(ids.map((id: string) => [id, classRow.name]));
  const students = (await buildStudentsFromIds(db, year, session.id, ids, classMap)).sort((a: any, b: any) => (a.serial_no ?? 9999) - (b.serial_no ?? 9999) || alphaCompare(a, b));
  return { classInfo: classRow, students };
}
async function getPPKISelectionRows(db: DB, year: number) {
  const { session, classes, enrolments } = await getPPKIContext(db, year);
  const ids = enrolments.map((e: any) => e.student_id);
  if (!ids.length) return { session, classes, rows: [] as any[] };
  const [studentsQ, certsQ] = await Promise.all([
    db.from('students').select('id,full_name,identification_no,date_of_birth').in('id', ids),
    db.from('school_leaving_certificates').select('student_id,serial_no,status,selected_for_certificate,student_stream').eq('session_year', year).in('student_id', ids),
  ]);
  if (studentsQ.error) throw studentsQ.error;
  if (certsQ.error) throw certsQ.error;
  const classMap = new Map((classes || []).map((c: any) => [c.id, c]));
  const enrolMap = new Map((enrolments || []).map((e: any) => [e.student_id, e.class_id]));
  const studentMap = new Map((studentsQ.data || []).map((s: any) => [s.id, s]));
  const certMap = new Map((certsQ.data || []).map((c: any) => [c.student_id, c]));
  const rows = ids.map((id: string) => {
    const s: any = studentMap.get(id) || {};
    const c: any = certMap.get(id) || {};
    const cls: any = classMap.get(enrolMap.get(id)) || {};
    return {
      student_id: id,
      full_name: s.full_name || '',
      identification_no: s.identification_no || '',
      class_id: cls.id || '',
      class_name: cls.name || '',
      selected: c.student_stream === 'PPKI' && c.selected_for_certificate === true,
      serial_no: c.student_stream === 'PPKI' && c.selected_for_certificate === true ? c.serial_no : null,
      status: c.student_stream === 'PPKI' && c.selected_for_certificate === true ? (c.status || 'DRAF') : 'BELUM_DIPILIH',
    };
  }).sort((a: any, b: any) => a.class_name.localeCompare(b.class_name, 'en', { sensitivity: 'base' }) || alphaCompare(a, b));
  return { session, classes, rows };
}
async function buildSelectedPPKIStudents(db: DB, year: number) {
  const { session, classes, enrolments } = await getPPKIContext(db, year);
  const allIds = enrolments.map((e: any) => e.student_id);
  if (!allIds.length) return { students: [], classInfo: { id: 'PPKI', name: 'PENDIDIKAN KHAS (PPKI)', code: 'PPKI', class_teacher_name: '' } };
  const { data: certs, error } = await db.from('school_leaving_certificates').select('student_id,serial_no').eq('session_year', year).eq('student_stream', 'PPKI').eq('selected_for_certificate', true).in('student_id', allIds).order('serial_no');
  if (error) throw error;
  const selectedIds = (certs || []).map((c: any) => c.student_id);
  const classNameById = new Map((classes || []).map((c: any) => [c.id, c.name]));
  const classNameByStudent = new Map((enrolments || []).map((e: any) => [e.student_id, classNameById.get(e.class_id) || 'PPKI']));
  const rows = await buildStudentsFromIds(db, year, session.id, selectedIds, classNameByStudent);
  rows.sort((a: any, b: any) => (a.serial_no ?? 9999) - (b.serial_no ?? 9999) || alphaCompare(a, b));
  return { students: rows, classInfo: { id: 'PPKI', name: 'PENDIDIKAN KHAS (PPKI)', code: 'PPKI', class_teacher_name: '' } };
}
async function getPPKISummary(db: DB, year: number) {
  const selection = await getPPKISelectionRows(db, year);
  const total = selection.rows.length;
  const selected = selection.rows.filter((r: any) => r.selected).length;
  if (!selected) return { total, selected: 0, completed: 0, pending: 0 };
  const detail = await buildSelectedPPKIStudents(db, year);
  const completed = detail.students.filter((s: any) => s.status === 'SELESAI').length;
  return { total, selected, completed, pending: selected - completed };
}
async function savePPKISelection(db: DB, year: number, selectedInput: unknown, user: AppUser) {
  const chosen = Array.isArray(selectedInput) ? selectedInput.map(str).filter(Boolean) : [];
  const selection = await getPPKISelectionRows(db, year);
  const validIds = new Set(selection.rows.map((r: any) => r.student_id));
  const selectedIds = [...new Set(chosen)].filter((id) => validIds.has(id));
  if (selectedIds.length !== [...new Set(chosen)].length) throw new Error('Ada murid yang bukan dalam senarai PPKI semasa.');

  const alphaAll = [...selection.rows].sort(alphaCompare);
  const alphaSelected = alphaAll.filter((r: any) => selectedIds.includes(r.student_id));
  const allIds = alphaAll.map((r: any) => r.student_id);
  const { data: existing, error: existingError } = allIds.length
    ? await db.from('school_leaving_certificates').select('id,student_id,serial_no,student_stream,selected_for_certificate').eq('session_year', year).in('student_id', allIds)
    : { data: [], error: null } as any;
  if (existingError) throw existingError;
  const existingMap = new Map((existing || []).map((c: any) => [c.student_id, c]));

  // Two-stage move prevents unique(serial_no) collisions while selections change.
  for (let i = 0; i < alphaAll.length; i++) {
    const row: any = alphaAll[i];
    const cert: any = existingMap.get(row.student_id);
    if (!cert || cert.student_stream !== 'PPKI') continue;
    const { error } = await db.from('school_leaving_certificates').update({ serial_no: PPKI_TEMP_START + i + 1 }).eq('id', cert.id);
    if (error) throw error;
  }
  for (let i = 0; i < alphaAll.length; i++) {
    const row: any = alphaAll[i];
    const cert: any = existingMap.get(row.student_id);
    if (!cert || cert.student_stream !== 'PPKI') continue;
    const { error } = await db.from('school_leaving_certificates').update({
      serial_no: PPKI_PLACEHOLDER_START + i + 1,
      selected_for_certificate: false,
      student_stream: 'PPKI',
    }).eq('id', cert.id);
    if (error) throw error;
  }
  for (let i = 0; i < alphaSelected.length; i++) {
    const row: any = alphaSelected[i];
    const serialNo = PPKI_SERIAL_START + i;
    const cert: any = existingMap.get(row.student_id);
    if (cert) {
      const { error } = await db.from('school_leaving_certificates').update({
        serial_no: serialNo,
        selected_for_certificate: true,
        student_stream: 'PPKI',
        conduct: 'BAIK',
        last_updated_by: user.id,
        last_updated_by_name: user.full_name,
      }).eq('id', cert.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await db.from('school_leaving_certificates').insert({
        student_id: row.student_id,
        session_year: year,
        serial_no: serialNo,
        conduct: 'BAIK',
        status: 'DRAF',
        student_stream: 'PPKI',
        selected_for_certificate: true,
        last_updated_by: user.id,
        last_updated_by_name: user.full_name,
      }).select('id,student_id,serial_no,student_stream,selected_for_certificate').single();
      if (error) throw error;
      existingMap.set(row.student_id, inserted);
    }
  }
  const { error: auditError } = await db.from('school_leaving_audit_log').insert({
    user_id: user.id,
    user_name: user.full_name,
    student_id: null,
    session_year: year,
    action: 'SAVE_PPKI_SELECTION',
    changes: { selected_count: alphaSelected.length, selected_student_ids: alphaSelected.map((r: any) => r.student_id) },
  });
  if (auditError) throw auditError;
  return { selected: alphaSelected.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ success: false, error: 'Konfigurasi Supabase belum lengkap.' }, 500);
  const db = createClient(url, key, { auth: { persistSession: false } });
  try {
    const body = await req.json().catch(() => ({}));
    const action = str(body.action || 'auth');
    const year = Number(body.year || YEAR);
    if (!Number.isFinite(year)) return json({ success: false, error: 'Tahun tidak sah.' }, 400);
    if (action === 'login') {
      const result = await loginWithIc(db, body.ic);
      if (!result.ok) return json({ success: false, error: result.error }, 401);
      return json({ success: true, token: result.token, expiresAt: result.expiresAt, user: result.user });
    }
    const auth = await requireSession(db, req);
    if (!auth.ok) return json({ success: false, error: auth.error }, 401);
    const { user, session } = auth;
    if (action === 'auth') return json({ success: true, user });
    if (action === 'logout') {
      const { error } = await db.from('school_leaving_sessions').delete().eq('id', session.id);
      if (error) throw error;
      return json({ success: true });
    }
    if (action === 'getConfig') {
      const { data: settings, error } = await db.from('school_leaving_settings').select('*').eq('session_year', year).maybeSingle();
      if (error) throw error;
      return json({ success: true, settings, user });
    }
    if (action === 'getClasses') {
      const { session: academicSession, classes, enrolments } = await getYear6Context(db, year);
      const ids = enrolments.map((e: any) => e.student_id);
      let output: any[] = [];
      if (ids.length) {
        const [studentsQ, profilesQ, certsQ, membershipsQ] = await Promise.all([
          db.from('students').select('id,full_name,identification_no,date_of_birth').in('id', ids),
          db.from('student_master_profiles').select('student_id,school_entry_date').in('student_id', ids),
          db.from('school_leaving_certificates').select('student_id,birth_certificate_no,leadership').eq('session_year', year).eq('student_stream', 'MAINSTREAM').in('student_id', ids),
          db.from('student_unit_memberships').select('student_id,category').eq('session_id', academicSession.id).eq('is_current', true).in('student_id', ids),
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
        const groups = new Map<string, string[]>();
        for (const e of enrolments) {
          if (!groups.has(e.class_id)) groups.set(e.class_id, []);
          groups.get(e.class_id)!.push(e.student_id);
        }
        output = classes.map((c: any) => {
          const memberIds = groups.get(c.id) || [];
          const completed = memberIds.filter((id: string) => {
            const s: any = studentMap.get(id) || {};
            const p: any = profileMap.get(id) || {};
            const cert: any = certMap.get(id) || {};
            const cats = categoryMap.get(id) || new Set();
            return Boolean(str(s.full_name) && str(s.date_of_birth) && str(s.identification_no) && str(p.school_entry_date) && str(cert.birth_certificate_no) && str(cert.leadership) && cats.has('club') && cats.has('sport') && cats.has('uniform'));
          }).length;
          return { id: c.id, name: c.name, code: c.code, class_teacher_name: c.class_teacher_name, total: memberIds.length, completed, pending: memberIds.length - completed, type: 'MAINSTREAM' };
        });
      }
      const ppki = await getPPKISummary(db, year);
      return json({ success: true, classes: output, ppki });
    }
    if (action === 'getStudentsByClass') {
      const classId = str(body.classId);
      if (!classId) return json({ success: false, error: 'classId diperlukan.' }, 400);
      const result = await buildStudentsForClass(db, year, classId);
      return json({ success: true, ...result });
    }
    if (action === 'getPPKISelection') {
      const result = await getPPKISelectionRows(db, year);
      return json({ success: true, students: result.rows, total: result.rows.length, selected: result.rows.filter((r: any) => r.selected).length });
    }
    if (action === 'savePPKISelection') {
      const result = await savePPKISelection(db, year, body.studentIds, user);
      const detail = await buildSelectedPPKIStudents(db, year);
      return json({ success: true, selected: result.selected, ...detail, savedBy: user.full_name });
    }
    if (action === 'getSelectedPPKIStudents') {
      const result = await buildSelectedPPKIStudents(db, year);
      return json({ success: true, ...result });
    }
    if (action === 'saveStudent') {
      const studentId = str(body.studentId);
      if (!studentId) return json({ success: false, error: 'studentId diperlukan.' }, 400);
      const birthCertificateNo = str(body.birthCertificateNo) || null;
      const leadership = str(body.leadership) || null;
      const { data: existing, error: findError } = await db.from('school_leaving_certificates').select('id,serial_no,birth_certificate_no,leadership,status,last_updated_by_name,student_stream,selected_for_certificate').eq('student_id', studentId).eq('session_year', year).maybeSingle();
      if (findError) throw findError;
      if (!existing) return json({ success: false, error: 'Rekod sijil murid tidak ditemui.' }, 404);
      if (existing.student_stream === 'PPKI' && existing.selected_for_certificate !== true) return json({ success: false, error: 'Murid PPKI ini belum dipilih untuk sijil.' }, 400);
      const { error: updateError } = await db.from('school_leaving_certificates').update({ birth_certificate_no: birthCertificateNo, leadership, conduct: 'BAIK', last_updated_by: user.id, last_updated_by_name: user.full_name }).eq('id', existing.id);
      if (updateError) throw updateError;
      let row: any = null;
      if (existing.student_stream === 'PPKI') {
        const current = await buildSelectedPPKIStudents(db, year);
        row = current.students.find((s: any) => s.student_id === studentId);
      } else {
        const { enrolments } = await getYear6Context(db, year);
        const classId = enrolments.find((e: any) => e.student_id === studentId)?.class_id;
        if (!classId) return json({ success: false, error: 'Murid bukan dalam kelas Tahun 6 semasa.' }, 400);
        const current = await buildStudentsForClass(db, year, classId);
        row = current.students.find((s: any) => s.student_id === studentId);
      }
      const status = row?.status || 'DRAF';
      const { error: statusError } = await db.from('school_leaving_certificates').update({ status, last_updated_by: user.id, last_updated_by_name: user.full_name }).eq('id', existing.id);
      if (statusError) throw statusError;
      const changes = { birth_certificate_no: { before: existing.birth_certificate_no || '', after: birthCertificateNo || '' }, leadership: { before: existing.leadership || '', after: leadership || '' }, status: { before: existing.status || 'DRAF', after: status } };
      const { error: auditError } = await db.from('school_leaving_audit_log').insert({ user_id: user.id, user_name: user.full_name, student_id: studentId, session_year: year, action: 'SAVE_STUDENT', changes });
      if (auditError) throw auditError;
      if (existing.student_stream === 'PPKI') {
        const refreshed = await buildSelectedPPKIStudents(db, year);
        row = refreshed.students.find((s: any) => s.student_id === studentId);
      } else {
        const { enrolments } = await getYear6Context(db, year);
        const classId = enrolments.find((e: any) => e.student_id === studentId)?.class_id;
        if (classId) {
          const refreshed = await buildStudentsForClass(db, year, classId);
          row = refreshed.students.find((s: any) => s.student_id === studentId);
        }
      }
      return json({ success: true, student: row || null, savedBy: user.full_name });
    }
    return json({ success: false, error: `Action tidak dikenali: ${action}` }, 400);
  } catch (error) {
    console.error(error);
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
