import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  LogOut,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { api, login } from './api';
import { downloadBytes, makeClassPdf, makeStudentPdf, previewBytes } from './pdf';
import './styles.css';

const YEAR = 2026;

const LEADERSHIP_OPTIONS = [
  ['KETUA KELAS', 'Ketua Kelas'],
  ['KETUA PENGAWAS SEKOLAH', 'Ketua Pengawas Sekolah'],
  ['KETUA PENGAWAS ICT', 'Ketua Pengawas ICT'],
  ['KETUA PENGAWAS PUSAT SUMBER', 'Ketua Pengawas Pusat Sumber'],
  ['PENGAWAS SEKOLAH', 'Pengawas Sekolah'],
  ['PENGAWAS PUSAT SUMBER', 'Pengawas Pusat Sumber'],
  ['PENGAWAS SPBT', 'Pengawas SPBT'],
  ['PENOLONG KETUA KELAS', 'Penolong Ketua Kelas'],
  ['PENOLONG KETUA PENGAWAS SEKOLAH', 'Penolong Ketua Pengawas Sekolah'],
  ['PENOLONG KETUA PENGAWAS ICT', 'Penolong Ketua Pengawas ICT'],
  ['PENGAWAS ICT', 'Pengawas ICT'],
  ['KETUA PENGAWAS SPBT', 'Ketua Pengawas SPBT'],
  ['PENOLONG KETUA PENGAWAS SPBT', 'Penolong Ketua Pengawas SPBT'],
  ['PENOLONG KETUA PENGAWAS PUSAT SUMBER', 'Penolong Ketua Pengawas Pusat Sumber'],
];

function normalizeAjkLabel(value) {
  return String(value || '').replace(/^AJK\s+\d+\b/i, 'AJK').replace(/\s+/g, ' ').trim();
}

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
  const [ic, setIc] = useState('');
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="crest">JBA5095</div>
        <div className="login-logo-wrap"><img className="login-logo" src="https://i.postimg.cc/3RF9M05N/Logo-SKSA.png" alt="Logo SK Sungai Abong" /></div>
        <h1>Sistem Sijil Tamat Persekolahan</h1>
        <p>SK Sungai Abong · Tahun 6 · {YEAR}</p>
        <form onSubmit={(e) => { e.preventDefault(); onLogin(ic); }}>
          <label>No. Kad Pengenalan</label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={12}
            value={ic}
            onChange={(e) => setIc(e.target.value.replace(/\D/g, '').slice(0, 12))}
            placeholder="Contoh: 850101011234"
            autoFocus
          />
          {error && <div className="error-box">{error}</div>}
          <button className="primary-btn full" disabled={ic.length !== 12 || busy}>
            {busy ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
            Log Masuk
          </button>
        </form>
        <small>Masukkan nombor kad pengenalan 12 digit. Hanya pengguna yang dibenarkan boleh masuk.</small>
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
  const [token, setToken] = useState(() => sessionStorage.getItem('sijil-token') || '');
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('sijil-user') || 'null'); } catch { return null; }
  });
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

  function clearSession() {
    sessionStorage.removeItem('sijil-token');
    sessionStorage.removeItem('sijil-user');
    setToken('');
    setUser(null);
    setAuthorized(false);
  }

  async function authenticate(ic) {
    setLoginBusy(true);
    setLoginError('');
    try {
      const result = await login(ic);
      sessionStorage.setItem('sijil-token', result.token);
      sessionStorage.setItem('sijil-user', JSON.stringify(result.user));
      setToken(result.token);
      setUser(result.user);
      setAuthorized(true);
    } catch (err) {
      const code = err.code || err.message;
      const friendly = code === 'IC_TIDAK_DIBENARKAN'
        ? 'No. kad pengenalan ini tidak dibenarkan masuk.'
        : code === 'IC_TIDAK_SAH'
          ? 'Masukkan no. kad pengenalan 12 digit yang sah.'
          : err.message;
      setLoginError(friendly);
      clearSession();
    } finally {
      setLoginBusy(false);
    }
  }

  async function restoreSession(value) {
    try {
      const result = await api(value, 'auth');
      setUser(result.user);
      sessionStorage.setItem('sijil-user', JSON.stringify(result.user));
      setAuthorized(true);
    } catch {
      clearSession();
    }
  }

  useEffect(() => {
    if (token) restoreSession(token);
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
        api(token, 'getConfig'),
        api(token, 'getClasses'),
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
      const result = await api(token, 'getStudentsByClass', { classId: cls.id });
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
      const result = await api(token, 'saveStudent', {
        studentId: selectedStudent.student_id,
        birthCertificateNo: form.birth_certificate_no,
        leadership: form.leadership,
      });
      if (result.student) {
        setStudents((prev) => prev.map((s) => s.student_id === result.student.student_id ? result.student : s));
      }
      setMessage(`Maklumat berjaya disimpan oleh ${result.savedBy || user?.full_name || 'pengguna'}.`);
      const classRes = await api(token, 'getClasses');
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

  async function logout() {
    try {
      if (token) await api(token, 'logout');
    } catch {
      // Sesi mungkin sudah tamat; tetap bersihkan sesi tempatan.
    }
    clearSession();
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
          <div className="user-chip"><span>Log masuk</span><strong>{user?.full_name || '-'}</strong></div>
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
                        <SelectField label="Kepimpinan" value={form.leadership} onChange={(v) => setForm((f) => ({ ...f, leadership: v }))} options={LEADERSHIP_OPTIONS} wide />
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

                      {selectedStudent.last_updated_by_name && (
                        <div className="audit-note">
                          Kemaskini terakhir oleh <strong>{selectedStudent.last_updated_by_name}</strong>
                          {selectedStudent.updated_at ? <> · {new Date(selectedStudent.updated_at).toLocaleString('ms-MY')}</> : null}
                        </div>
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

function SelectField({ label, value, onChange, options, wide }) {
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Pilih jawatan...</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function KokuRow({ label, value }) {
  return (
    <div className="koku-row">
      <span>{label}</span>
      <strong className={!value ? 'missing' : ''}>{value ? normalizeAjkLabel(value) : 'DATA BELUM ADA'}</strong>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
