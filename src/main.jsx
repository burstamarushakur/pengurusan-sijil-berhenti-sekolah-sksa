import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { api } from './api';
import { downloadBytes, makeClassPdf, makeStudentPdf, previewBytes } from './pdf';
import './styles.css';

const YEAR = 2026;

function sanitizeFilename(name) {
  return String(name || 'SIJIL')
    .replace(/[^a-z0-9\-_. ]/gi, '')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function displayDate(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function Login({ onLogin, busy, error }) {
  const [password, setPassword] = useState('');
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="crest">JBA5095</div>
        <div className="login-icon"><LockKeyhole size={30} /></div>
        <h1>Sistem Sijil Tamat Persekolahan</h1>
        <p>SK Sungai Abong · Tahun 6 · {YEAR}</p>
        <form onSubmit={(e) => { e.preventDefault(); onLogin(password); }}>
          <label>Kata laluan sistem</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Masukkan kata laluan"
            autoFocus
          />
          {error && <div className="error-box">{error}</div>}
          <button className="primary-btn full" disabled={!password || busy}>
            {busy ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
            Masuk
          </button>
        </form>
        <small>Akses dilindungi menggunakan kata laluan sistem Supabase sedia ada.</small>
      </section>
    </main>
  );
}

function StatusPill({ complete }) {
  return complete ? (
    <span className="pill complete"><CheckCircle2 size={14} /> Selesai</span>
  ) : (
    <span className="pill pending"><TriangleAlert size={14} /> Belum lengkap</span>
  );
}

function App() {
  const [password, setPassword] = useState(() => sessionStorage.getItem('sijil-password') || '');
  const [authorized, setAuthorized] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [settings, setSettings] = useState(null);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [students, setStudents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ birth_certificate_no: '', leadership: '' });

  const selectedStudent = students.find((s) => s.student_id === selectedId) || null;

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      s.full_name.toLowerCase().includes(q) || String(s.serial_no || '').includes(q)
    );
  }, [students, search]);

  async function authenticate(value) {
    setLoginBusy(true);
    setLoginError('');
    try {
      await api(value, 'auth');
      sessionStorage.setItem('sijil-password', value);
      setPassword(value);
      setAuthorized(true);
    } catch (err) {
      setLoginError(err.message === 'PASSWORD_TIDAK_SAH' ? 'Kata laluan tidak sah.' : err.message);
      setAuthorized(false);
    } finally {
      setLoginBusy(false);
    }
  }

  useEffect(() => {
    if (password) authenticate(password);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authorized) return;
    loadDashboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  useEffect(() => {
    if (!selectedStudent) return;
    setForm({
      birth_certificate_no: selectedStudent.birth_certificate_no || '',
      leadership: selectedStudent.leadership || '',
    });
  }, [selectedStudent]);

  async function loadDashboard() {
    setLoading(true);
    setMessage('');
    try {
      const [configRes, classRes] = await Promise.all([
        api(password, 'getConfig'),
        api(password, 'getClasses'),
      ]);
      setSettings(configRes.settings);
      setClasses(classRes.classes || []);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function openClass(cls) {
    setSelectedClass(cls);
    setStudents([]);
    setSelectedId(null);
    setSearch('');
    setLoading(true);
    setMessage('');
    try {
      const result = await api(password, 'getStudentsByClass', { classId: cls.id });
      setStudents(result.students || []);
      if (result.students?.length) setSelectedId(result.students[0].student_id);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveCurrent() {
    if (!selectedStudent) return;
    setSaving(true);
    setMessage('');
    try {
      const result = await api(password, 'saveStudent', {
        studentId: selectedStudent.student_id,
        birthCertificateNo: form.birth_certificate_no,
        leadership: form.leadership,
      });
      if (result.student) {
        setStudents((prev) => prev.map((s) => s.student_id === result.student.student_id ? result.student : s));
      }
      setMessage('Maklumat berjaya disimpan.');
      const classRes = await api(password, 'getClasses');
      setClasses(classRes.classes || []);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  function studentWithForm() {
    if (!selectedStudent) return null;
    return {
      ...selectedStudent,
      birth_certificate_no: form.birth_certificate_no.trim(),
      leadership: form.leadership.trim(),
    };
  }

  async function previewCurrent() {
    const student = studentWithForm();
    if (!student) return;
    setPdfBusy(true);
    try {
      const bytes = await makeStudentPdf(student, settings);
      previewBytes(bytes);
    } catch (err) {
      setMessage(`Gagal jana PDF: ${err.message}`);
    } finally {
      setPdfBusy(false);
    }
  }

  async function downloadCurrent() {
    const student = studentWithForm();
    if (!student) return;
    setPdfBusy(true);
    try {
      const bytes = await makeStudentPdf(student, settings);
      downloadBytes(bytes, `${sanitizeFilename(student.full_name)}_SIJIL_TAMAT_${YEAR}.pdf`);
    } catch (err) {
      setMessage(`Gagal jana PDF: ${err.message}`);
    } finally {
      setPdfBusy(false);
    }
  }

  async function downloadClass() {
    if (!selectedClass) return;
    const pending = students.filter((s) => s.status !== 'SELESAI');
    if (pending.length) {
      setMessage(`Belum boleh jana PDF kelas. ${pending.length} murid masih belum lengkap.`);
      return;
    }
    setPdfBusy(true);
    try {
      const bytes = await makeClassPdf(students, settings);
      downloadBytes(bytes, `${sanitizeFilename(selectedClass.name)}_SIJIL_TAMAT_${YEAR}.pdf`);
    } catch (err) {
      setMessage(`Gagal jana PDF kelas: ${err.message}`);
    } finally {
      setPdfBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem('sijil-password');
    setPassword('');
    setAuthorized(false);
    setSettings(null);
    setClasses([]);
    setSelectedClass(null);
    setStudents([]);
  }

  if (!authorized) return <Login onLogin={authenticate} busy={loginBusy} error={loginError} />;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">SEKOLAH KEBANGSAAN SUNGAI ABONG</div>
          <h1>Sijil Tamat Persekolahan Sekolah Rendah</h1>
          <p>Tahun 6 · Sesi {YEAR}</p>
        </div>
        <div className="top-actions">
          <button className="ghost-btn" onClick={loadDashboard}><RefreshCw size={17} /> Segar semula</button>
          <button className="ghost-btn" onClick={logout}><LogOut size={17} /> Keluar</button>
        </div>
      </header>

      <main className="content">
        {message && <div className="message-box">{message}</div>}

        {!selectedClass ? (
          <section>
            <div className="section-heading">
              <div>
                <h2>Dashboard Tahun 6</h2>
                <p>Pilih kelas untuk melengkapkan sijil murid.</p>
              </div>
              <div className="date-chip">Tarikh keluar: <strong>{displayDate(settings?.leaving_date || '2026-12-31')}</strong></div>
            </div>

            {loading ? <div className="center-loader"><Loader2 className="spin" /> Memuatkan data...</div> : (
              <div className="class-grid">
                {classes.map((cls) => {
                  const pct = cls.total ? Math.round((cls.completed / cls.total) * 100) : 0;
                  return (
                    <button className="class-card" key={cls.id} onClick={() => openClass(cls)}>
                      <div className="class-icon"><Users size={24} /></div>
                      <div className="class-title">{cls.name}</div>
                      <div className="teacher">Guru kelas: {cls.class_teacher_name || '-'}</div>
                      <div className="progress"><span style={{ width: `${pct}%` }} /></div>
                      <div className="class-stats">
                        <span><b>{cls.completed}</b> selesai</span>
                        <span><b>{cls.pending}</b> belum</span>
                        <span><b>{cls.total}</b> murid</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <section>
            <div className="class-header">
              <button className="ghost-btn" onClick={() => { setSelectedClass(null); setStudents([]); setSelectedId(null); loadDashboard(); }}>
                <ArrowLeft size={18} /> Kembali
              </button>
              <div className="class-header-title">
                <h2>{selectedClass.name}</h2>
                <p>{selectedClass.class_teacher_name || 'Guru kelas belum ditetapkan'}</p>
              </div>
              <button className="primary-btn" onClick={downloadClass} disabled={pdfBusy || students.some((s) => s.status !== 'SELESAI')}>
                {pdfBusy ? <Loader2 className="spin" size={18} /> : <Download size={18} />}
                PDF Semua Kelas
              </button>
            </div>

            {loading ? <div className="center-loader"><Loader2 className="spin" /> Memuatkan murid...</div> : (
              <div className="workspace">
                <aside className="student-list-panel">
                  <div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama murid..." /></div>
                  <div className="student-list">
                    {filteredStudents.map((student) => (
                      <button
                        key={student.student_id}
                        className={`student-row ${selectedId === student.student_id ? 'active' : ''}`}
                        onClick={() => setSelectedId(student.student_id)}
                      >
                        <div className="serial-mini">{String(student.serial_no || 0).padStart(3, '0')}</div>
                        <div className="student-row-main">
                          <strong>{student.full_name}</strong>
                          <span>{student.status === 'SELESAI' ? 'Selesai' : 'Belum lengkap'}</span>
                        </div>
                        {student.status === 'SELESAI' ? <CheckCircle2 className="ok-icon" size={18} /> : <TriangleAlert className="warn-icon" size={18} />}
                      </button>
                    ))}
                  </div>
                </aside>

                <div className="form-panel">
                  {!selectedStudent ? <div className="empty-state">Pilih murid.</div> : (
                    <>
                      <div className="student-form-header">
                        <div>
                          <div className="serial-label">NO. SIRI</div>
                          <div className="serial-value">{settings?.serial_prefix || 'jba5095'}/{YEAR}/{String(selectedStudent.serial_no || 0).padStart(3, '0')}</div>
                        </div>
                        <StatusPill complete={selectedStudent.status === 'SELESAI'} />
                      </div>

                      <div className="form-grid">
                        <Field label="Nama Penuh" value={selectedStudent.full_name} readOnly wide />
                        <Field label="Tarikh Lahir" value={displayDate(selectedStudent.date_of_birth)} readOnly />
                        <Field label="Nombor Kad Pengenalan" value={selectedStudent.identification_no || ''} readOnly />
                        <Field label="Nombor Sijil Lahir" value={form.birth_certificate_no} onChange={(v) => setForm((f) => ({ ...f, birth_certificate_no: v.toUpperCase() }))} placeholder="Isi jika belum ada" />
                        <Field label="Tarikh Masuk Sekolah" value={displayDate(selectedStudent.school_entry_date)} readOnly />
                        <Field label="Tarikh Keluar Sekolah" value={displayDate(settings?.leaving_date || '2026-12-31')} readOnly />
                        <Field label="Kelakuan" value="BAIK" readOnly />
                        <Field label="Kepimpinan" value={form.leadership} onChange={(v) => setForm((f) => ({ ...f, leadership: v.toUpperCase() }))} placeholder="Contoh: PENGAWAS ICT / KETUA KELAS / TIADA" wide />
                      </div>

                      <div className="koku-card">
                        <div className="koku-title"><FileText size={18} /> Aktiviti Kokurikulum (auto dari Portal KOKU)</div>
                        <KokuRow label="Kelab / Persatuan" value={selectedStudent.koku?.club} />
                        <KokuRow label="Sukan / Permainan" value={selectedStudent.koku?.sport} />
                        <KokuRow label="Unit Beruniform" value={selectedStudent.koku?.uniform} />
                      </div>

                      {(!selectedStudent.koku?.club || !selectedStudent.koku?.sport || !selectedStudent.koku?.uniform) && (
                        <div className="warning-box"><TriangleAlert size={18} /> Data KOKU murid ini belum lengkap dalam Portal KOKU. Betulkan data di portal supaya sijil tidak tersalah.</div>
                      )}

                      <div className="form-actions">
                        <button className="primary-btn" onClick={saveCurrent} disabled={saving}>
                          {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />} Simpan
                        </button>
                        <button className="secondary-btn" onClick={previewCurrent} disabled={pdfBusy}>
                          {pdfBusy ? <Loader2 className="spin" size={18} /> : <Eye size={18} />} Preview PDF
                        </button>
                        <button className="secondary-btn" onClick={downloadCurrent} disabled={pdfBusy}>
                          <Download size={18} /> Download PDF
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function Field({ label, value, onChange, readOnly, placeholder, wide }) {
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      <input
        value={value ?? ''}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        readOnly={readOnly}
        placeholder={placeholder}
        className={readOnly ? 'readonly' : ''}
      />
    </label>
  );
}

function KokuRow({ label, value }) {
  return (
    <div className="koku-row">
      <span>{label}</span>
      <strong className={!value ? 'missing' : ''}>{value || 'DATA BELUM ADA'}</strong>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
