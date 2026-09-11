import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  LayoutDashboard, Users, CalendarClock, BedDouble, Syringe,
  Settings, LogOut, Eye, EyeOff, ShieldCheck, Stethoscope, ClipboardList,
  Clock, CheckCircle2, ChevronRight, Search, Phone,
  FileText, X, UserPlus, Weight, Ruler, CircleDot, HeartPulse, Wind,
  Thermometer, Droplet, AlertTriangle, User, Activity, History as HistoryIcon,
  Calendar, Printer, UserPlus2, Plus,
  Building2, MapPin, Mail, Globe, Pencil, Check, FlaskConical, Pill,
  MessageSquareText, AlertCircle, Settings2, RefreshCw
} from "lucide-react";

/* ============================================================================
   ACCOUNTS / NAV
   ========================================================================== */
// Staff accounts now come from Supabase (`profiles` table, tied to real Auth
// users) — see App()'s loadAccounts/loadSessionFromUser. No more mock data.
// NOTE: doctor list is now derived live from `accounts` (role === "doctor") wherever needed,
// instead of a hardcoded array — so adding/removing a doctor in Settings → Staff Accounts
// automatically updates every doctor picker (consultations, IPD admission, appointments).

const navConfig = {
  admin: [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "patients", label: "Patients", icon: Users },
    { key: "ipd", label: "IPD", icon: BedDouble },
    { key: "settings", label: "Settings", icon: Settings },
  ],
  doctor: [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "patients", label: "Patients", icon: Users },
    { key: "ipd", label: "IPD", icon: BedDouble },
  ],
  receptionist: [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "patients", label: "Patients", icon: Users },
    { key: "ipd", label: "IPD", icon: BedDouble },
  ],
  appointment: [
    { key: "appointments", label: "Appointments", icon: CalendarClock },
    { key: "patients", label: "Patients", icon: Users },
  ],
};
const roleLabel = { admin: "Admin", doctor: "Doctor", receptionist: "Receptionist", appointment: "Appointment Desk" };
const roleIcon = { admin: ShieldCheck, doctor: Stethoscope, receptionist: ClipboardList, appointment: CalendarClock };


const INDIA_TIME_ZONE = "Asia/Kolkata";
function indiaNow() { return new Date(new Date().toLocaleString("en-US", { timeZone: INDIA_TIME_ZONE })); }
function indiaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: INDIA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return { year: get("year"), month: get("month"), day: get("day") };
}
function indiaDateISO(date = new Date()) { const p = indiaDateParts(date); return `${p.year}-${p.month}-${p.day}`; }
function indiaDateLabel(date = new Date()) { return date.toLocaleDateString("en-IN", { timeZone: INDIA_TIME_ZONE, day: "2-digit", month: "short", year: "numeric" }); }
function indiaDateTimeLabel(date = new Date()) { return date.toLocaleString("en-IN", { timeZone: INDIA_TIME_ZONE, day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }); }
function isPastIndiaSlot(dateISO, hour, minute) {
  if (!dateISO || hour == null || minute == null || dateISO !== indiaDateISO()) return false;
  const now = indiaNow();
  return hour * 60 + minute < now.getHours() * 60 + now.getMinutes();
}
function minutesAgo(mins) { return new Date(Date.now() - mins * 60000); }
function toDDMMYY(isoDate) {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getFullYear()).slice(-2)}`;
}
function calcAge(dob) {
  const d = new Date(dob); const today = new Date();
  let years = today.getFullYear() - d.getFullYear();
  let months = today.getMonth() - d.getMonth();
  if (today.getDate() < d.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  return `${years} yr${years === 1 ? "" : "s"}${months > 0 ? `, ${months} mo` : ""}`;
}
function isSameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
function calcBMI(weightObj, heightObj) {
  const w = parseFloat(weightObj?.value), h = parseFloat(heightObj?.value);
  if (!w || !h) return null;
  const heightM = h / 100, value = w / (heightM * heightM);
  return !isFinite(value) || value <= 0 ? null : value.toFixed(1);
}
function bmiCategory(bmi) {
  if (!bmi) return null;
  const v = parseFloat(bmi);
  if (v < 18.5) return { label: "Underweight", color: "#B7791F" };
  if (v < 25) return { label: "Normal", color: "#2F7D5C" };
  if (v < 30) return { label: "Overweight", color: "#B7791F" };
  return { label: "Obese", color: "#9B2C2C" };
}

/* ============================================================================
   APPOINTMENT TYPES / ADMIN DATA BACKUP
   ========================================================================== */
const DEFAULT_APPOINTMENT_TYPES = ["New Consultation", "Follow-up", "Vaccination", "Emergency"];

function downloadTextFile(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DataExportBackupPanel({ backupData }) {
  const [message, setMessage] = useState("");
  function exportBackup() {
    const payload = { exportedAt: new Date().toISOString(), app: "Niramaya Clinical Records System", data: backupData };
    downloadTextFile(`niramaya-backup-${todayISO()}.json`, JSON.stringify(payload, null, 2));
    setMessage("Full JSON backup downloaded.");
  }
  function exportPatientsCSV() {
    const patients = backupData.allPatients || [];
    const rows = [["Patient ID", "Name", "Phone", "DOB", "Sex"], ...patients.map(p => [p.id, p.name, p.phone, p.dob, p.sex])];
    downloadTextFile(`niramaya-patients-${todayISO()}.csv`, rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv;charset=utf-8");
    setMessage("Patient CSV downloaded.");
  }
  return (
    <div style={{ padding: 4 }}>
      <div style={settingsStyles.header}>
        <div style={settingsStyles.iconBadge}><ShieldCheck size={20} color="#0B3B36" /></div>
        <div><div style={settingsStyles.eyebrow}>ADMIN · DATA EXPORT / BACKUP</div><h1 style={settingsStyles.h1}>Export & backup</h1><p style={settingsStyles.sub}>Download a portable backup of the current clinic data, or export the patient register as CSV.</p></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button style={settingsStyles.editBtn} onClick={exportBackup}>Download full JSON backup</button>
        <button style={{ ...settingsStyles.editBtn, background: "#fff", color: "#0B3B36", border: "1px solid #0B3B36" }} onClick={exportPatientsCSV}>Export patient register (CSV)</button>
      </div>
      {message && <div style={{ ...settingsStyles.successBox, marginTop: 16 }}><Check size={14} style={{ marginRight: 6 }} />{message}</div>}
      <div style={{ fontSize: 11.5, color: "#8A928F", marginTop: 14, lineHeight: 1.5 }}>The JSON backup includes patients, appointments, reception check-ins, vitals, consultation history, vaccination records, clinic settings, staff accounts, rooms, appointment types and print settings.</div>
    </div>
  );
}

function AppointmentTypesPanel({ appointmentTypes, setAppointmentTypes }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  function addType() {
    const name = value.trim(); if (!name) return;
    if (appointmentTypes.some(t => t.toLowerCase() === name.toLowerCase())) { setError("This appointment type already exists."); return; }
    setAppointmentTypes(prev => [...prev, name]); setValue(""); setError("");
    supabase.from("appointment_types").insert({ name }).then(({ error }) => { if (error) console.error("Failed to save appointment type", error); });
  }
  function removeType(type) {
    if (appointmentTypes.length <= 1) { setError("Keep at least one appointment type."); return; }
    setAppointmentTypes(prev => prev.filter(t => t !== type));
    supabase.from("appointment_types").delete().eq("name", type).then(({ error }) => { if (error) console.error("Failed to remove appointment type", error); });
  }
  return (
    <div style={{ padding: 4 }}>
      <div style={settingsStyles.header}>
        <div style={settingsStyles.iconBadge}><CalendarClock size={20} color="#0B3B36" /></div>
        <div><div style={settingsStyles.eyebrow}>ADMIN · APPOINTMENT SETTINGS</div><h1 style={settingsStyles.h1}>Appointment types</h1><p style={settingsStyles.sub}>Create the appointment-type options that appear when the Appointment Desk books a patient.</p></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input style={{ ...settingsStyles.input, flex: 1 }} value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addType(); }} placeholder="e.g. Review consultation" />
        <button style={{ ...settingsStyles.saveBtn, width: "auto", padding: "10px 14px" }} onClick={addType}>Add</button>
      </div>
      {error && <div style={{ fontSize: 12, color: "#9B2C2C", marginBottom: 10 }}>{error}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {appointmentTypes.map(type => <div key={type} style={settingsStyles.roomChip}><span>{type}</span><button style={settingsStyles.roomChipRemove} onClick={() => removeType(type)}>✕</button></div>)}
      </div>
    </div>
  );
}

/* ============================================================================
   APP ROOT / LOGIN
   ========================================================================== */
export default function App() {
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false); // avoids a login-screen flash while we check for an existing session
  const [accounts, setAccounts] = useState([]); // populated live from `profiles` once logged in — see loadAccounts below
  const [rooms, setRooms] = useState(initialRooms);
  const [clinicDetails, setClinicDetails] = useState({ name: "Niramaya Clinic", address: "12 MG Road, Delhi", phone: "+91 98765 43210", email: "", website: "" });
  const [quickPickLists, setQuickPickLists] = useState(initialLists);
  const [appointmentTypes, setAppointmentTypes] = useState(DEFAULT_APPOINTMENT_TYPES);
  const [printSettings, setPrintSettings] = useState({
    marginTop: 15, marginBottom: 15, marginLeft: 15, marginRight: 15,
    includeClinicHeader: true,
    includeComplaints: true, includeFindings: true, includeDiagnosis: true,
    includeMedications: true, includeInvestigations: true, includeInstructions: true,
    includeVaccination: true, includeFollowUp: true, includeGrowthChart: true,
  });

  // Turn a Supabase Auth user into the { id, username, name, role } shape the rest
  // of the app already expects (unchanged from the old MOCK_ACCOUNTS days) by
  // reading the matching row in `profiles`.
  async function loadSessionFromUser(user) {
    const { data, error } = await supabase.from("profiles").select("id, username, name, role").eq("id", user.id).single();
    if (error || !data) {
      // Logged in to Supabase Auth but no matching profiles row — this means the
      // account was created in Auth but never given a role. Sign back out rather
      // than let them into an app with an undefined role.
      await supabase.auth.signOut();
      setSession(null);
      return null;
    }
    setSession(data);
    return data;
  }

  async function loadAccounts() {
    const { data } = await supabase.from("profiles").select("id, username, name, role");
    if (data) setAccounts(data);
  }

  // Reference/settings data — loaded once per login. Each has a small number of
  // rows (rooms, a handful of settings), so a full fetch on login is simplest;
  // mutations write straight back to Supabase from wherever they happen (the
  // panels that edit them), keeping this fetch-once-then-optimistic-write pattern
  // consistent with how patients/appointments/clinical records work below in Shell.
  async function loadReferenceData() {
    const [roomsRes, clinicRes, listsRes, typesRes, printRes] = await Promise.all([
      supabase.from("rooms").select("*"),
      supabase.from("clinic_details").select("*").eq("id", true).single(),
      supabase.from("quick_pick_lists").select("*"),
      supabase.from("appointment_types").select("name"),
      supabase.from("print_settings").select("*").eq("id", true).single(),
    ]);
    if (roomsRes.data) setRooms(roomsRes.data.map(roomFromDb));
    if (clinicRes.data) setClinicDetails(clinicDetailsFromDb(clinicRes.data));
    if (listsRes.data) setQuickPickLists({ ...initialLists, ...Object.fromEntries(listsRes.data.map((r) => [r.field, r.items])) });
    if (typesRes.data) setAppointmentTypes(typesRes.data.map((r) => r.name));
    if (printRes.data) setPrintSettings(printSettingsFromDb(printRes.data));
  }

  // On first load: check whether a session already exists (e.g. user refreshed
  // the page) so they aren't kicked back to the login screen every time.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: authSession } }) => {
      if (authSession?.user) loadSessionFromUser(authSession.user).finally(() => setAuthChecked(true));
      else setAuthChecked(true);
    });
    // Keep in sync if the session changes elsewhere (token refresh, sign-out in another tab).
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setSession(null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) { loadAccounts(); loadReferenceData(); } }, [session?.id]);

  async function handleLogout() {
    await waitForPendingWrites();
    await supabase.auth.signOut();
    setSession(null);
  }

  if (!authChecked) return <div style={styles.loginPage} />; // brief blank beat while session-restore check runs, avoids a login-screen flash
  if (!session) return <LoginScreen onLogin={loadSessionFromUser} />;
  return (
    <Shell
      session={session}
      onLogout={handleLogout}
      accounts={accounts}
      setAccounts={setAccounts}
      refreshAccounts={loadAccounts}
      rooms={rooms}
      setRooms={setRooms}
      clinicDetails={clinicDetails}
      setClinicDetails={setClinicDetails}
      quickPickLists={quickPickLists}
      setQuickPickLists={setQuickPickLists}
      appointmentTypes={appointmentTypes}
      setAppointmentTypes={setAppointmentTypes}
      printSettings={printSettings}
      setPrintSettings={setPrintSettings}
    />
  );
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) {
      setError(authError.message === "Invalid login credentials" ? "Incorrect email or password." : authError.message);
      setSubmitting(false);
      return;
    }
    const result = await onLogin(data.user);
    if (!result) setError("Your login is valid, but no staff profile is set up for this account. Contact an admin.");
    setSubmitting(false);
  }

  return (
    <div style={styles.loginPage}>
      <div style={styles.loginCard}>
        <div style={styles.brandRow}>
          <div style={styles.brandMark}><Stethoscope size={20} color="#0B3B36" /></div>
          <div><div style={styles.brandTitle}>NIRAMAYA</div><div style={styles.brandSub}>Clinical Records System</div></div>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Email
            <input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@clinic.com" autoComplete="username" />
          </label>
          <label style={styles.label}>Password
            <div style={styles.passwordWrap}>
              <input style={{ ...styles.input, paddingRight: 40 }} type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
              <button type="button" style={styles.eyeBtn} onClick={() => setShowPassword((s) => !s)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </label>
          {error && <div style={styles.errorBox}>{error}</div>}
          <button type="submit" style={styles.submitBtn} disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
   SHELL
   ========================================================================== */
function Shell({ session, onLogout, accounts, setAccounts, refreshAccounts, rooms, setRooms, clinicDetails, setClinicDetails, quickPickLists, setQuickPickLists, appointmentTypes, setAppointmentTypes, printSettings, setPrintSettings }) {
  const [activeTab, setActiveTab] = useState(navConfig[session.role][0].key);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [appointmentPatient, setAppointmentPatient] = useState(null);
  // SINGLE source of truth for every appointment — booked (Appointment Desk), walk-in,
  // and emergency (Reception). One array, shared by all three screens via props, so a
  // booking, reschedule, cancellation, walk-in add, or check-in updates state at this
  // level and every screen re-renders live from the same data — nothing to sync manually.
  const [appointments, setAppointments] = useState([]);
  const [vaccinationRecords, setVaccinationRecords] = useState({}); // { [patientId]: scheduleArray }
  const [vitalsRecords, setVitalsRecords] = useState({}); // { [patientId]: vitalsObject }
  const [patientHistoryRecords, setPatientHistoryRecords] = useState({}); // { [patientId]: [OPD/IPD entries] }
  const [dataLoaded, setDataLoaded] = useState(false); // avoids briefly showing "no patients" before the initial fetch lands
  const navItems = navConfig[session.role];
  const RoleIcon = roleIcon[session.role];
  // Live doctor list, derived from actual staff accounts — not a hardcoded array.
  const doctorNames = accounts.filter((a) => a.role === "doctor").map((a) => a.name);

  const [allPatients, setAllPatients] = useState([]);
  const backupData = { allPatients, appointments, vaccinationRecords, vitalsRecords, patientHistoryRecords, accounts, rooms, clinicDetails, appointmentTypes, printSettings };

  // Single clinic-data refresh used both on first load and by every Refresh button.
  // This intentionally reloads patients too, so a patient created from another login
  // appears immediately without a full browser reload.
  async function refreshClinicData({ initial = false } = {}) {
    if (initial) setDataLoaded(false);
    const [patientsRes, apptsRes, vitalsRes, consultRes, vaxRes] = await Promise.all([
      supabase.from("patients").select("*"),
      supabase.from("appointments").select("*"),
      supabase.from("vitals").select("*"),
      supabase.from("consultations").select("*"),
      supabase.from("vaccination_records").select("*"),
    ]);
    const firstError = [patientsRes, apptsRes, vitalsRes, consultRes, vaxRes].map((r) => r.error).find(Boolean);
    if (firstError) throw firstError;
    setAllPatients((patientsRes.data || []).map(patientFromDb));
    setAppointments((apptsRes.data || []).map(appointmentFromDb));
    const groupedVitals = groupByPatient(vitalsRes.data || [], vitalsFromDb, "dateISO");
    Object.keys(groupedVitals).forEach((pid) => {
      const byDate = new Map();
      groupedVitals[pid].forEach((v) => {
        const key = v.dateLabel || indiaDateLabel(new Date(v.dateISO));
        const current = byDate.get(key);
        if (!current || new Date(v.dateISO) >= new Date(current.dateISO)) byDate.set(key, v);
      });
      groupedVitals[pid] = [...byDate.values()].sort((a,b) => new Date(b.dateISO) - new Date(a.dateISO));
    });
    setVitalsRecords(groupedVitals);
    setPatientHistoryRecords(groupByPatient(consultRes.data || [], consultationFromDb, null));
    setVaccinationRecords(Object.fromEntries((vaxRes.data || []).map((r) => [r.patient_id, r.schedule])));
    setDataLoaded(true);
    return true;
  }

  useEffect(() => {
    let cancelled = false;
    refreshClinicData({ initial: true }).catch((error) => {
      if (!cancelled) { console.error("Initial clinic data load failed", error); setDataLoaded(true); }
    });
    return () => { cancelled = true; };
  }, []);

  async function addPatient(newPatient) {
    setAllPatients((prev) => [...prev, newPatient]); // optimistic
    const { error } = await supabase.from("patients").insert(patientToDb(newPatient));
    if (error) console.error("Failed to save patient", error);
  }
  async function updatePatient(id, updates) {
    setAllPatients((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    const { error } = await supabase.from("patients").update(patientToDb({ id, ...updates })).eq("id", id);
    if (error) console.error("Failed to update patient", error);
  }
  function openPatient(id) {
    const found = allPatients.find((p) => p.id === id);
    setSelectedPatient(found || { id, name: "Unknown" });
  }
  function bookAppointmentFromProfile(patient) {
    if (session.role !== "appointment") return;
    setAppointmentPatient(patient);
    setSelectedPatient(null);
    setActiveTab("appointments");
  }

  return (
    <div style={styles.shellPage}>
      <div style={styles.topBar} className="no-print">
        <div style={styles.topBarBrand}><Stethoscope size={17} color="#0B3B36" /><span style={styles.topBarBrandText}>NIRAMAYA</span></div>
        <div style={styles.topBarUser}>
          <div style={styles.userBadge}><RoleIcon size={13} /><span>{roleLabel[session.role]}</span></div>
          <span style={styles.userName}>{session.name}</span>
          <button style={styles.logoutBtn} onClick={onLogout}><LogOut size={14} /></button>
        </div>
      </div>

      <div className="shell-body">
      <div style={styles.content} className="shell-content">
        {!dataLoaded ? (
          <div style={{ padding: 40, textAlign: "center", color: "#8A928F", fontSize: 13 }}>Loading clinic data…</div>
        ) : selectedPatient ? (
          <PatientProfileScreen
            patient={buildMockPatientFor(selectedPatient)}
            onClose={() => setSelectedPatient(null)}
            session={session}
            printSettings={printSettings}
            vaccinationRecords={vaccinationRecords}
            setVaccinationRecords={setVaccinationRecords}
            vitalsRecords={vitalsRecords}
            setVitalsRecords={setVitalsRecords}
            patientHistoryRecords={patientHistoryRecords}
            setPatientHistoryRecords={setPatientHistoryRecords}
            doctorNames={doctorNames}
            clinicDetails={clinicDetails}
            quickPickLists={quickPickLists}
            setQuickPickLists={setQuickPickLists}
            onUpdatePatient={updatePatient}
            onBookAppointment={session.role === "appointment" ? () => bookAppointmentFromProfile(selectedPatient) : null}
          />
        ) : activeTab === "dashboard" ? (
          session.role === "receptionist"
            ? <ReceptionDashboardScreen onSelectPatient={openPatient} allPatients={allPatients} appointments={appointments} setAppointments={setAppointments} vaccinationRecords={vaccinationRecords} setVitalsRecords={setVitalsRecords} rooms={rooms} session={session} patientHistoryRecords={patientHistoryRecords} setPatientHistoryRecords={setPatientHistoryRecords} doctorNames={doctorNames} onRefreshData={refreshClinicData} />
            : <DoctorDashboardScreen onSelectPatient={openPatient} allPatients={allPatients} session={session} vaccinationRecords={vaccinationRecords} rooms={rooms} appointments={appointments} setAppointments={setAppointments} patientHistoryRecords={patientHistoryRecords} setPatientHistoryRecords={setPatientHistoryRecords} onRefreshData={refreshClinicData} />
        ) : activeTab === "patients" ? (
          <PatientsTab onSelectPatient={openPatient} patients={allPatients} onAddPatient={addPatient} />
        ) : activeTab === "appointments" ? (
          <AppointmentBookingScreen allPatients={allPatients} appointments={appointments} setAppointments={setAppointments} doctorNames={doctorNames} appointmentTypes={appointmentTypes} patientHistoryRecords={patientHistoryRecords} setPatientHistoryRecords={setPatientHistoryRecords} onRefreshData={refreshClinicData} initialPatient={appointmentPatient} onInitialPatientConsumed={() => setAppointmentPatient(null)} />
        ) : activeTab === "ipd" ? (
          <IPDRoomDashboardScreen allPatients={allPatients} rooms={rooms} setRooms={setRooms} isAdmin={session.role === "admin"} setPatientHistoryRecords={setPatientHistoryRecords} doctorNames={doctorNames} />
        ) : activeTab === "settings" && session.role === "admin" ? (
          <ClinicSettings accounts={accounts} setAccounts={setAccounts} refreshAccounts={refreshAccounts} session={session} printSettings={printSettings} setPrintSettings={setPrintSettings} rooms={rooms} setRooms={setRooms} clinicDetails={clinicDetails} setClinicDetails={setClinicDetails} appointmentTypes={appointmentTypes} setAppointmentTypes={setAppointmentTypes} quickPickLists={quickPickLists} setQuickPickLists={setQuickPickLists} backupData={backupData} />
        ) : (
          <ComingSoon tabKey={activeTab} navItems={navItems} />
        )}
      </div>

      {!selectedPatient && (
        <div style={styles.bottomNav} className="bottom-nav no-print">
          {navItems.map((item) => {
            const Icon = item.icon, active = activeTab === item.key;
            return (
              <button key={item.key} onClick={() => setActiveTab(item.key)} style={{ ...styles.navBtn, ...(active ? styles.navBtnActive : {}) }} className="nav-btn">
                <Icon size={19} /><span style={styles.navLabel} className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
      </div>

      {/* Desktop (>=900px): nav moves from a bottom bar to a left sidebar.
          Mobile is untouched — same bottom bar, same tabs, just layout. */}
      <style>{`
        .shell-body { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        @media (min-width: 900px) {
          .shell-body { flex-direction: row-reverse; }
          .bottom-nav {
            position: static !important;
            flex-direction: column !important;
            width: 220px;
            min-width: 220px;
            height: auto !important;
            border-top: none !important;
            border-right: 1px solid #E8E6DF;
            padding: 16px 10px !important;
            gap: 4px;
          }
          .bottom-nav .nav-btn {
            flex-direction: row !important;
            justify-content: flex-start !important;
            width: 100%;
            padding: 10px 12px !important;
            border-radius: 8px;
            gap: 10px !important;
          }
          .bottom-nav .nav-label { font-size: 13px !important; }
          .shell-content { padding-bottom: 24px !important; }
        }
      `}</style>
    </div>
  );
}

function ComingSoon({ tabKey, navItems }) {
  const item = navItems.find((n) => n.key === tabKey);
  if (!item) return null;
  const Icon = item.icon;
  return (
    <div style={styles.comingSoonWrap}>
      <div style={styles.comingSoonIcon}><Icon size={26} color="#B0B5B1" /></div>
      <div style={styles.comingSoonTitle}>{item.label}</div>
      <div style={styles.comingSoonText}>Not built yet in this shell.</div>
    </div>
  );
}

const searchTabs = [{ key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "id", label: "ID" }, { key: "dob", label: "DOB" }];

function DoctorDashboardScreen({ onSelectPatient, allPatients, session, vaccinationRecords, rooms, appointments, setAppointments, patientHistoryRecords, setPatientHistoryRecords, onRefreshData }) {
  const [searchTab, setSearchTab] = useState("name");
  const [query, setQuery] = useState("");
  const [rowTab, setRowTab] = useState("live");
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (onRefreshData) await onRefreshData();
      else {
        const [apptsRes, consultRes] = await Promise.all([
          supabase.from("appointments").select("*"),
          supabase.from("consultations").select("*"),
        ]);
        if (apptsRes.error) throw apptsRes.error;
        if (consultRes.error) throw consultRes.error;
        setAppointments((apptsRes.data || []).map(appointmentFromDb));
        if (setPatientHistoryRecords) setPatientHistoryRecords(groupByPatient(consultRes.data || [], consultationFromDb, null));
      }
    } catch (error) {
      console.error("Refresh failed", error);
      window.alert(`Refresh failed: ${error?.message || "Please check your connection and database permissions."}`);
    } finally {
      setRefreshing(false);
    }
  }

  function matches(p) {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase(), qDigits = query.replace(/[^\d]/g, "");
    if (searchTab === "name") return p.name.toLowerCase().includes(q);
    if (searchTab === "phone") return p.phone.includes(q);
    if (searchTab === "id") return p.id.toLowerCase().includes(q);
    if (searchTab === "dob") return qDigits.length > 0 && toDDMMYY(p.dob).startsWith(qDigits);
    return true;
  }

  function patientDob(id) { const p = allPatients.find((p) => p.id === id); return p ? p.dob : ""; }
  const todayLabel = indiaDateLabel();
  // Checked in today = live off the single shared appointments store (booked, walk-in,
  // or emergency — doesn't matter which desk it came from), filtered to today's date.
  const checkedInToday = (appointments || []).filter((a) => a.checkedIn && a.dateISO === todayISO());
  // Live queue = checked in, no consultation recorded yet today.
  // Checked out = checked in, AND a prescription/consultation was recorded for them today —
  // this is real interconnection with Reception's check-in and the doctor's own consultations.
  const liveQueueReal = checkedInToday
    .filter((a) => !(patientHistoryRecords?.[a.patientId] || []).some((h) => h.date === todayLabel))
    // A doctor's Live queue must contain only patients assigned to that logged-in doctor.
    // "All patients" below remains intentionally unfiltered.
    .filter((a) => String(a.doctor || "").trim().toLowerCase() === String(session.name || "").trim().toLowerCase())
    .map((a) => ({ ...a, name: a.name || a.patientName, dob: patientDob(a.patientId) }));
  const checkedOutMap = new Map();
  checkedInToday
    .filter((a) => (patientHistoryRecords?.[a.patientId] || []).some((h) => h.date === todayLabel))
    .forEach((a) => {
      const todaysEntry = (patientHistoryRecords?.[a.patientId] || []).find((h) => h.date === todayLabel);
      if (!checkedOutMap.has(a.patientId)) checkedOutMap.set(a.patientId, { ...a, name: a.name || a.patientName, dob: patientDob(a.patientId), todaysEntry });
    });
  // A prescription can be created directly from a patient's profile without reception
  // check-in. Those completed consultations must still appear once in Checked out.
  (allPatients || []).forEach((patient) => {
    const todaysEntry = (patientHistoryRecords?.[patient.id] || []).find((h) => h.date === todayLabel);
    if (todaysEntry && !checkedOutMap.has(patient.id)) {
      const matchingAppt = (appointments || []).find((a) => a.patientId === patient.id && a.dateISO === todayISO() && a.status !== "cancelled");
      checkedOutMap.set(patient.id, { ...(matchingAppt || {}), id: matchingAppt?.id || `checkout-${patient.id}`, patientId: patient.id, name: patient.name, patientName: patient.name, phone: patient.phone, dob: patient.dob, doctor: matchingAppt?.doctor || todaysEntry.consultingDoctor || todaysEntry.doctor || "—", todaysEntry });
    }
  });
  const checkedOutReal = [...checkedOutMap.values()];

  const filteredLiveQueue = useMemo(() => liveQueueReal.filter(matches), [query, searchTab, appointments, patientHistoryRecords]);
  const filteredCheckedOut = useMemo(() => checkedOutReal.filter(matches), [query, searchTab, appointments, patientHistoryRecords]);
  const filteredAllPatients = useMemo(() => allPatients.filter(matches), [query, searchTab, allPatients]);
  const sortedQueue = [...filteredLiveQueue].sort((a, b) => {
    if (a.entrySource === "emergency" && b.entrySource !== "emergency") return -1;
    if (b.entrySource === "emergency" && a.entrySource !== "emergency") return 1;
    return (a.checkInAt || 0) - (b.checkInAt || 0);
  });

  function waitingLabel(t) { const m = Math.max(0, Math.round((Date.now() - t.getTime()) / 60000)); return m < 1 ? "Just checked in" : `Waiting ${m} min`; }
  function waitingSeverity(t) { const m = Math.round((Date.now() - t.getTime()) / 60000); return m >= 30 ? "high" : m >= 15 ? "medium" : "low"; }
  // Undo an accidental or no-longer-relevant check-in (patient left, wrong tap, etc.) —
  // reverts the appointment back to "not checked in" so it drops off the live queue.
  // Vitals already recorded stay in their history; this only reverses the queue status.
  function removeFromQueue(apptId) {
    if (!setAppointments) return;
    setAppointments((prev) => prev.map((a) => (a.id === apptId ? { ...a, checkedIn: false, checkInAt: null } : a)));
    supabase.from("appointments").update({ checked_in: false, check_in_at: null }).eq("id", apptId).then(({ error }) => { if (error) console.error("Failed to remove from queue", error); });
  }

  return (
    <div style={ddStyles.page}>
      <div style={ddStyles.container}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div><div style={ddStyles.eyebrow}>DOCTOR · {session.name}</div><h1 style={ddStyles.h1}>Today's patients</h1></div>
          <button style={rdStyles.refreshBtn} onClick={handleRefresh} disabled={refreshing} title="Refresh"><RefreshCw size={14} style={{ opacity: refreshing ? 0.4 : 1 }} /></button>
        </div>

        <div style={ddStyles.searchBlock}>
          <div style={ddStyles.searchInputWrap}>
            <Search size={15} color="#8A928F" />
            <input style={ddStyles.searchInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchTab === "dob" ? "Search by DOB — e.g. 120490" : `Search by ${searchTabs.find((t) => t.key === searchTab).label.toLowerCase()}…`} />
          </div>
          <div style={ddStyles.searchTabRow}>
            {searchTabs.map((t) => <button key={t.key} onClick={() => setSearchTab(t.key)} style={{ ...ddStyles.searchTabBtn, ...(searchTab === t.key ? ddStyles.searchTabBtnActive : {}) }}>{t.label}</button>)}
          </div>
        </div>

        <div style={ddStyles.rowTabBar}>
          <button onClick={() => setRowTab("live")} style={{ ...ddStyles.rowTabBtn, ...(rowTab === "live" ? ddStyles.rowTabBtnActive : {}) }}><Clock size={14} />Live queue<span style={ddStyles.rowTabCount}>{sortedQueue.length}</span></button>
          <button onClick={() => setRowTab("checkedout")} style={{ ...ddStyles.rowTabBtn, ...(rowTab === "checkedout" ? ddStyles.rowTabBtnActive : {}) }}><CheckCircle2 size={14} />Checked out<span style={ddStyles.rowTabCount}>{filteredCheckedOut.length}</span></button>
          <button onClick={() => setRowTab("all")} style={{ ...ddStyles.rowTabBtn, ...(rowTab === "all" ? ddStyles.rowTabBtnActive : {}) }}><Users size={14} />All patients<span style={ddStyles.rowTabCount}>{filteredAllPatients.length}</span></button>
        </div>

        {rowTab === "live" && (
          <div style={ddStyles.rowList}>
            {sortedQueue.length === 0 && <div style={ddStyles.emptyNote}>No one currently waiting.</div>}
            {sortedQueue.map((p) => {
              const sev = waitingSeverity(p.checkInAt);
              return (
                <div key={p.id} style={ddStyles.patientRow}>
                  <div style={ddStyles.avatarSmall} onClick={() => onSelectPatient(p.patientId, p.name)}>{p.name.charAt(0)}</div>
                  <div style={ddStyles.patientMain} onClick={() => onSelectPatient(p.patientId, p.name)} role="button" tabIndex={0}>
                    <div style={ddStyles.patientName}>{p.name} <span style={ddStyles.patientId}>{p.patientId}</span>{p.entrySource === "emergency" && <span style={ddStyles.emergencyTag}>EMERGENCY</span>}{p.entrySource === "walk-in" && <span style={ddStyles.walkinTag}>WALK-IN</span>}</div>
                    <div style={ddStyles.patientMeta}>{p.phone} · DOB {p.dob}</div>
                  </div>
                  <span style={{ ...ddStyles.waitingTag, ...(sev === "high" ? ddStyles.waitingHigh : sev === "medium" ? ddStyles.waitingMedium : ddStyles.waitingLow) }}>{waitingLabel(p.checkInAt)}</span>
                  <button style={ddStyles.removeQueueBtn} title="Remove from queue" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Remove ${p.name} from the live queue?`)) removeFromQueue(p.id); }}><X size={13} /></button>
                  <ChevronRight size={15} color="#B0B5B1" onClick={() => onSelectPatient(p.patientId, p.name)} style={{ cursor: "pointer" }} />
                </div>
              );
            })}
          </div>
        )}
        {rowTab === "checkedout" && (
          <div style={ddStyles.rowList}>
            {filteredCheckedOut.map((p) => (
              <div key={p.id} style={ddStyles.patientRow} onClick={() => onSelectPatient(p.patientId, p.name)} role="button" tabIndex={0}>
                <div style={ddStyles.avatarSmall}>{p.name.charAt(0)}</div>
                <div style={ddStyles.patientMain}><div style={ddStyles.patientName}>{p.name} <span style={ddStyles.patientId}>{p.patientId}</span></div><div style={ddStyles.patientMeta}>{p.phone} · DOB {p.dob}</div></div>
                <span style={ddStyles.doneTag}>{p.todaysEntry?.diagnosis || "Consultation done"} · {p.todaysEntry?.hasPrescription ? "Typed" : "Handwritten"}</span>
                <ChevronRight size={15} color="#B0B5B1" />
              </div>
            ))}
          </div>
        )}
        {rowTab === "all" && (
          <div style={ddStyles.rowList}>
            {filteredAllPatients.map((p) => (
              <div key={p.id} style={ddStyles.patientRow} onClick={() => onSelectPatient(p.id, p.name)} role="button" tabIndex={0}>
                <div style={ddStyles.avatarSmall}>{p.name.charAt(0)}</div>
                <div style={ddStyles.patientMain}><div style={ddStyles.patientName}>{p.name} <span style={ddStyles.patientId}>{p.id}</span></div><div style={ddStyles.patientMeta}>{p.phone} · DOB {p.dob}</div></div>
                <ChevronRight size={15} color="#B0B5B1" />
              </div>
            ))}
          </div>
        )}

        <RoomsAndVaccinesSection vaccinationRecords={vaccinationRecords} allPatients={allPatients} rooms={rooms} />
      </div>
    </div>
  );
}

const ddStyles = {
  page: { minHeight: "100vh", background: "#F6F5F1", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", padding: "28px 16px", boxSizing: "border-box" },
  container: { maxWidth: 620, margin: "0 auto" },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#0B3B36", marginBottom: 4 },
  h1: { fontSize: 21, fontWeight: 700, color: "#1B2320", margin: "0 0 18px" },
  removeQueueBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.05)", color: "#9B2C2C", cursor: "pointer", padding: 0, marginLeft: 4 },
  searchBlock: { marginBottom: 22 },
  searchInputWrap: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #DCD9D0", borderRadius: 10, padding: "10px 12px", marginBottom: 8, boxSizing: "border-box" },
  searchInput: { flex: 1, border: "none", outline: "none", fontSize: 14, fontFamily: "inherit", background: "transparent" },
  searchTabRow: { display: "flex", gap: 6 },
  searchTabBtn: { fontSize: 12, fontWeight: 600, color: "#5B635F", background: "#fff", border: "1px solid #E8E6DF", borderRadius: 20, padding: "6px 13px", cursor: "pointer" },
  searchTabBtnActive: { background: "#0B3B36", border: "1px solid #0B3B36", color: "#fff" },
  rowTabBar: { display: "flex", gap: 6, marginBottom: 16 },
  rowTabBtn: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#5B635F", background: "#fff", border: "1px solid #E8E6DF", borderRadius: 20, padding: "7px 13px", cursor: "pointer" },
  rowTabBtnActive: { background: "#0B3B36", border: "1px solid #0B3B36", color: "#fff" },
  rowTabCount: { fontSize: 10.5, fontWeight: 700, background: "#F1F1EF", color: "#5B635F", borderRadius: 20, padding: "1px 6px", minWidth: 16, textAlign: "center" },
  rowList: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 },
  patientRow: { display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #E8E6DF", borderRadius: 10, padding: "11px 12px", cursor: "pointer" },
  avatarSmall: { width: 34, height: 34, borderRadius: "50%", background: "#0B3B36", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13.5, fontWeight: 700, flexShrink: 0 },
  patientMain: { flex: 1, minWidth: 0 },
  patientName: { fontSize: 13.5, fontWeight: 600, color: "#1B2320", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" },
  patientId: { fontSize: 11.5, color: "#8A928F", fontWeight: 500 },
  patientMeta: { fontSize: 12, color: "#7A8380", marginTop: 2 },
  emergencyTag: { fontSize: 9.5, fontWeight: 700, color: "#9B2C2C", background: "#FDECEC", padding: "2px 6px", borderRadius: 4 },
  walkinTag: { fontSize: 9.5, fontWeight: 700, color: "#5B635F", background: "#F0EFEA", padding: "2px 6px", borderRadius: 4 },
  waitingTag: { fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", padding: "4px 9px", borderRadius: 20 },
  waitingLow: { color: "#5B635F", background: "#F1F1EF" },
  waitingMedium: { color: "#8A6D3B", background: "#FDF6E3" },
  waitingHigh: { color: "#9B2C2C", background: "#FDECEC" },
  doneTag: { fontSize: 11.5, fontWeight: 600, color: "#1E6B45", whiteSpace: "nowrap", background: "#EAF5EF", padding: "4px 9px", borderRadius: 20 },
  emptyNote: { fontSize: 12.5, color: "#8A928F", fontStyle: "italic", padding: "6px 2px" },
};

/* ============================================================================
   RECEPTION DASHBOARD
   ========================================================================== */
function todayAt(hour, minute) { const d = indiaNow(); d.setHours(hour, minute, 0, 0); return d; }

function ReceptionDashboardScreen({ onSelectPatient, allPatients, appointments, setAppointments, vaccinationRecords, setVitalsRecords, rooms, session, patientHistoryRecords, setPatientHistoryRecords, doctorNames = [], onRefreshData }) {
  const [checkInFor, setCheckInFor] = useState(null);
  const [entryPickerType, setEntryPickerType] = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [viewTab, setViewTab] = useState("appointments");
  const [refreshing, setRefreshing] = useState(false);
  const isToday = selectedDate === todayISO();

  // Appointments update from other logins too (a booking made at the Appointment Desk,
  // a doctor finishing a consultation) — this pulls the latest appointments + today's
  // consultations so this screen reflects that without needing a full page reload.
  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (onRefreshData) await onRefreshData();
      else {
        const [apptsRes, consultRes] = await Promise.all([
          supabase.from("appointments").select("*"),
          supabase.from("consultations").select("*"),
        ]);
        if (apptsRes.error) throw apptsRes.error;
        if (consultRes.error) throw consultRes.error;
        setAppointments((apptsRes.data || []).map(appointmentFromDb));
        if (setPatientHistoryRecords) setPatientHistoryRecords(groupByPatient(consultRes.data || [], consultationFromDb, null));
      }
    } catch (error) {
      console.error("Refresh failed", error);
      window.alert(`Refresh failed: ${error?.message || "Please check your connection and database permissions."}`);
    } finally {
      setRefreshing(false);
    }
  }

  function shiftDate(days) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split("T")[0]);
  }

  function formatSlotTime(d) { return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }); }
  function isLate(d) { return Date.now() > d.getTime(); }
  function waitingLabel(t) { const m = Math.max(0, Math.round((Date.now() - t.getTime()) / 60000)); return m < 1 ? "Just checked in" : `Waiting ${m} min`; }
  async function completeCheckIn(id, vitals) {
    const checkInAt = new Date();
    // Single array, single write — every screen reading `appointments` sees this instantly.
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, checkedIn: true, checkInAt, vitals } : a)));
    const appt = appointments.find((a) => a.id === id);
    const { error: apptErr } = await supabase.from("appointments").update({ checked_in: true, check_in_at: checkInAt.toISOString(), vitals }).eq("id", id);
    if (apptErr) console.error("Failed to save check-in", apptErr);
    if (setVitalsRecords && appt) {
      const now = new Date();
      const recordedOnStr = indiaDateTimeLabel(now);
      const dateLabel = indiaDateLabel(now);
      const newEntry = { ...vitals, recordedOn: recordedOnStr, dateLabel, dateISO: indiaDateISO(now) };
      const patientId = appt.patientId;
      let existingToday = null;
      setVitalsRecords((recs) => {
        const prevHistory = recs[patientId] || [];
        existingToday = prevHistory.find((row) => row.dateISO === newEntry.dateISO || row.dateLabel === dateLabel || indiaDateLabel(new Date(row.dateISO)) === dateLabel);
        const existingTodayIndex = prevHistory.findIndex((row) => row.dateISO === newEntry.dateISO || row.dateLabel === dateLabel || indiaDateLabel(new Date(row.dateISO)) === dateLabel);
        const nextHistory = existingTodayIndex >= 0
          ? prevHistory.map((row, i) => (i === existingTodayIndex ? newEntry : row))
          : [newEntry, ...prevHistory];
        return { ...recs, [patientId]: nextHistory };
      });
      beginWrite();
      try {
        const { error } = await supabase
          .from("vitals")
          .upsert(vitalsToDb(newEntry, patientId, session?.id), { onConflict: "patient_id,recorded_date" });
        if (error) console.error("Failed to save vitals", error);
      } finally {
        endWrite();
      }
    }
    setCheckInFor(null);
  }
  // Same undo as the Doctor Dashboard has — reception can also pull someone back
  // out of the live queue (checked in by mistake, patient left before being seen, etc.).
  function removeFromQueue(apptId) {
    setAppointments((prev) => prev.map((a) => (a.id === apptId ? { ...a, checkedIn: false, checkInAt: null } : a)));
    supabase.from("appointments").update({ checked_in: false, check_in_at: null }).eq("id", apptId).then(({ error }) => { if (error) console.error("Failed to remove from queue", error); });
  }
  function assignDoctor(apptId, doctor) {
    if (!doctor) return;
    setAppointments((prev) => prev.map((a) => a.id === apptId ? { ...a, doctor } : a));
    supabase.from("appointments").update({ doctor_name: doctor }).eq("id", apptId).then(({ error }) => { if (error) console.error("Failed to assign doctor", error); });
  }
  function selectEntry(patient) {
    const already = appointments.some((a) => a.patientId === patient.id && a.dateISO === todayISO() && a.status !== "cancelled");
    const entry = already
      ? appointments.find((a) => a.patientId === patient.id && a.dateISO === todayISO() && a.status !== "cancelled")
      : {
          id: nextApptId(), patientId: patient.id, patientName: patient.name, phone: patient.phone,
          doctor: "Not yet assigned", dateISO: todayISO(), hour: null, minute: null, status: "confirmed",
          appointmentType: entryPickerType === "emergency" ? "Emergency" : "Walk-in",
          entrySource: entryPickerType, checkedIn: false, checkInAt: null,
        };
    if (!already) {
      setAppointments((prev) => [...prev, entry]);
      supabase.from("appointments").insert(appointmentToDb(entry)).then(({ error }) => { if (error) console.error("Failed to save walk-in", error); });
    }
    setEntryPickerType(null);
    setCheckInFor(entry);
  }

  // Everything below is derived live from the single shared `appointments` array —
  // Appointment Desk bookings, walk-ins, and emergencies all live in it together, so
  // a booking, reschedule, or cancel made on the Appointment Desk shows up here instantly.
  // Defaults to today but selectedDate lets reception look at any other day too.
  const todayList = (appointments || [])
    .filter((a) => a.dateISO === selectedDate && a.status !== "cancelled")
    .map((a) => ({
      ...a,
      name: a.name || a.patientName,
      slotTime: a.hour != null ? todayAt(a.hour, a.minute) : null,
      isEmergency: a.entrySource === "emergency",
      isWalkIn: a.entrySource === "walk-in",
    }));

  const sorted = [...todayList].sort((a, b) => {
    if (a.isEmergency && !b.isEmergency) return -1;
    if (b.isEmergency && !a.isEmergency) return 1;
    if (a.checkedIn && !b.checkedIn) return -1;
    if (!a.checkedIn && b.checkedIn) return 1;
    if (a.checkedIn && b.checkedIn) return a.checkInAt - b.checkInAt;
    if (a.slotTime && !b.slotTime) return 1;
    if (!a.slotTime && b.slotTime) return -1;
    if (a.slotTime && b.slotTime) return a.slotTime - b.slotTime;
    return 0;
  });

  // Live queue: checked in today, waiting to be seen (no consultation recorded yet
  // today) — same definition the Doctor Dashboard uses, so both sides agree on who's
  // actually still waiting.
  const todayLabel = indiaDateLabel();
  const liveQueueList = (appointments || [])
    .filter((a) => a.checkedIn && a.dateISO === todayISO() && !(patientHistoryRecords?.[a.patientId] || []).some((h) => h.date === todayLabel))
    .map((a) => ({ ...a, name: a.name || a.patientName, isEmergency: a.entrySource === "emergency" }))
    .sort((a, b) => {
      if (a.isEmergency && !b.isEmergency) return -1;
      if (b.isEmergency && !a.isEmergency) return 1;
      return (a.checkInAt || 0) - (b.checkInAt || 0);
    });

  return (
    <div style={rdStyles.page}>
      <div style={rdStyles.container}>
        <div style={rdStyles.headerRow}>
          <div><div style={rdStyles.eyebrow}>RECEPTION · DASHBOARD</div><h1 style={rdStyles.h1}>{viewTab === "livequeue" ? "Live queue" : isToday ? "Today's appointments" : `Appointments — ${fmtDate(selectedDate)}`}</h1></div>
          <div style={rdStyles.headerBtnRow}>
            <button style={rdStyles.refreshBtn} onClick={handleRefresh} disabled={refreshing} title="Refresh"><RefreshCw size={14} style={{ opacity: refreshing ? 0.4 : 1 }} /></button>
            <button style={rdStyles.addWalkInBtn} onClick={() => setEntryPickerType("walk-in")}><UserPlus size={15} />Add walk-in</button>
            <button style={rdStyles.addEmergencyBtn} onClick={() => setEntryPickerType("emergency")}><AlertTriangle size={15} />Add emergency</button>
          </div>
        </div>
        <div style={rdStyles.tabRow}>
          <button style={{ ...rdStyles.tabBtn, ...(viewTab === "appointments" ? rdStyles.tabBtnActive : {}) }} onClick={() => setViewTab("appointments")}>Appointments</button>
          <button style={{ ...rdStyles.tabBtn, ...(viewTab === "livequeue" ? rdStyles.tabBtnActive : {}) }} onClick={() => setViewTab("livequeue")}>Live queue{liveQueueList.length > 0 ? ` (${liveQueueList.length})` : ""}</button>
        </div>
        {viewTab === "appointments" ? (
          <>
            <div style={rdStyles.dateNavRow}>
              <button style={rdStyles.dateNavBtn} onClick={() => shiftDate(-1)}>← Prev day</button>
              <input type="date" style={rdStyles.dateNavInput} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
              {!isToday && <button style={rdStyles.dateNavBtn} onClick={() => setSelectedDate(todayISO())}>Today</button>}
              <button style={rdStyles.dateNavBtn} onClick={() => shiftDate(1)}>Next day →</button>
            </div>
            <div style={rdStyles.rowList}>
              {sorted.length === 0 && <div style={rdStyles.emptyNote}>No appointments for this date.</div>}
              {sorted.map((a) => {
                const selectedDateLabel = formatDateLabel(selectedDate);
                const seenToday = (patientHistoryRecords?.[a.patientId] || []).some((h) => h.date === selectedDateLabel);
                return (
                <div key={a.id} style={{ ...rdStyles.patientRow, ...(a.isEmergency && !a.checkedIn ? rdStyles.patientRowEmergency : {}) }}>
                  <div style={rdStyles.avatarSmall} onClick={() => onSelectPatient(a.patientId, a.name)}>{a.name.charAt(0)}</div>
                  <div style={rdStyles.patientMain} onClick={() => onSelectPatient(a.patientId, a.name)} role="button" tabIndex={0}>
                    <div style={rdStyles.patientName}>{a.name} <span style={rdStyles.patientId}>{a.patientId}</span>{a.isEmergency && <span style={rdStyles.emergencyNameTag}>EMERGENCY</span>}</div>
                    <div style={rdStyles.patientMeta}>{a.phone} · {a.doctor || "Not yet assigned"}{a.entrySource ? "" : ` · ${a.appointmentType || "New Consultation"}`}</div>
                    {(a.doctor === "Not yet assigned" || !a.doctor) && doctorNames.length > 0 && (
                      <select value="" onClick={(e) => e.stopPropagation()} onChange={(e) => { assignDoctor(a.id, e.target.value); e.target.value = ""; }} style={{ marginTop: 5, fontSize: 11, padding: "4px 6px", borderRadius: 5, border: "1px solid #D6DBD8", background: "#fff" }}>
                        <option value="">Assign doctor…</option>
                        {doctorNames.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    )}
                  </div>
                  {seenToday ? (
                    <span style={rdStyles.seenTag}><CheckCircle2 size={12} style={{ marginRight: 4, verticalAlign: -2 }} />Seen</span>
                  ) : a.checkedIn ? (
                    <span style={rdStyles.waitingTag}><CheckCircle2 size={12} style={{ marginRight: 4, verticalAlign: -2 }} />{waitingLabel(a.checkInAt)}</span>
                  ) : a.slotTime ? (
                    <><span style={{ ...rdStyles.slotTag, ...(isLate(a.slotTime) ? rdStyles.slotTagLate : {}) }}><Clock size={12} style={{ marginRight: 4, verticalAlign: -2 }} />{formatSlotTime(a.slotTime)}{isLate(a.slotTime) && " (Late)"}</span>
                    {isToday && <button style={rdStyles.checkInBtn} onClick={() => setCheckInFor(a)}>Check in</button>}</>
                  ) : (
                    <><span style={a.isEmergency ? rdStyles.emergencyTag : rdStyles.walkinTag}>{a.isEmergency ? "Emergency" : "Walk-in"}</span>
                    {isToday && <button style={rdStyles.checkInBtn} onClick={() => setCheckInFor(a)}>Check in</button>}</>
                  )}
                </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={rdStyles.rowList}>
            {liveQueueList.length === 0 && <div style={rdStyles.emptyNote}>No one is currently waiting to be seen.</div>}
            {liveQueueList.map((a) => (
              <div key={a.id} style={{ ...rdStyles.patientRow, ...(a.isEmergency ? rdStyles.patientRowEmergency : {}) }}>
                <div style={rdStyles.avatarSmall} onClick={() => onSelectPatient(a.patientId, a.name)}>{a.name.charAt(0)}</div>
                <div style={rdStyles.patientMain} onClick={() => onSelectPatient(a.patientId, a.name)} role="button" tabIndex={0}>
                  <div style={rdStyles.patientName}>{a.name} <span style={rdStyles.patientId}>{a.patientId}</span>{a.isEmergency && <span style={rdStyles.emergencyNameTag}>EMERGENCY</span>}</div>
                  <div style={rdStyles.patientMeta}>{a.phone} · {a.doctor}</div>
                </div>
                <span style={rdStyles.waitingTag}><CheckCircle2 size={12} style={{ marginRight: 4, verticalAlign: -2 }} />{waitingLabel(a.checkInAt)}</span>
                <button style={rdStyles.removeQueueBtn} title="Remove from queue" onClick={() => { if (window.confirm(`Remove ${a.name} from the live queue?`)) removeFromQueue(a.id); }}><X size={13} /></button>
              </div>
            ))}
          </div>
        )}
        <RoomsAndVaccinesSection vaccinationRecords={vaccinationRecords} allPatients={allPatients} rooms={rooms} />
      </div>
      {entryPickerType && <WalkInPicker title={entryPickerType === "emergency" ? "Add emergency patient" : "Add walk-in"} patients={allPatients} onCancel={() => setEntryPickerType(null)} onSelect={selectEntry} />}
      {checkInFor && <VitalsModal patient={checkInFor} onCancel={() => setCheckInFor(null)} onSubmit={(vitals, doctor) => { if (doctor) assignDoctor(checkInFor.id, doctor); completeCheckIn(checkInFor.id, vitals); }} doctorNames={doctorNames} />}
    </div>
  );
}

function WalkInPicker({ title, patients, onCancel, onSelect }) {
  const [query, setQuery] = useState("");
  const results = patients.filter((p) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase(), qDigits = query.replace(/[^\d]/g, "");
    return p.name.toLowerCase().includes(q) || p.phone.includes(q) || p.id.toLowerCase().includes(q) || (qDigits.length > 0 && toDDMMYY(p.dob).startsWith(qDigits));
  });
  return (
    <div style={rdStyles.modalOverlay} onClick={onCancel}>
      <div style={rdStyles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={rdStyles.modalHeader}>
          <div><div style={rdStyles.modalPatientName}>{title}</div><div style={rdStyles.modalPatientMeta}>Search an existing patient</div></div>
          <button style={rdStyles.modalCloseBtn} onClick={onCancel}><X size={15} /></button>
        </div>
        <div style={rdStyles.searchInputWrap}><Search size={15} color="#8A928F" /><input style={rdStyles.searchInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, phone, ID, or DOB…" autoFocus /></div>
        <div style={rdStyles.walkinResultsList}>
          {results.length === 0 && <div style={rdStyles.emptyNote}>No matching patient found.</div>}
          {results.map((p) => (
            <div key={p.id} style={rdStyles.walkinResultRow} onClick={() => onSelect(p)}>
              <div style={rdStyles.avatarSmall}>{p.name.charAt(0)}</div>
              <div><div style={rdStyles.patientName}>{p.name} <span style={rdStyles.patientId}>{p.id}</span></div><div style={rdStyles.patientMeta}>{p.phone} · DOB {p.dob}</div></div>
              <ChevronRight size={15} color="#B0B5B1" style={{ marginLeft: "auto" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VitalsModal({ patient, onCancel, onSubmit, doctorNames = [] }) {
  const [vitals, setVitals] = useState({ weight: "", height: "", headCirc: "", pr: "", rr: "", temp: "", spo2: "" });
  const [assignedDoctor, setAssignedDoctor] = useState(patient.doctor && patient.doctor !== "Not yet assigned" ? patient.doctor : "");
  const fields = [
    { key: "weight", icon: <Weight size={14} />, label: "Weight", unit: "kg" },
    { key: "height", icon: <Ruler size={14} />, label: "Height", unit: "cm" },
    { key: "headCirc", icon: <CircleDot size={14} />, label: "Head circumference", unit: "cm" },
    { key: "pr", icon: <HeartPulse size={14} />, label: "Pulse rate (PR)", unit: "bpm" },
    { key: "rr", icon: <Wind size={14} />, label: "Respiratory rate (RR)", unit: "/min" },
    { key: "temp", icon: <Thermometer size={14} />, label: "Temperature", unit: "°F" },
    { key: "spo2", icon: <Droplet size={14} />, label: "SpO2", unit: "%" },
  ];
  function update(k, v) { setVitals((s) => ({ ...s, [k]: v })); }
  function handleSubmit() { const shaped = {}; fields.forEach((f) => { shaped[f.key] = { value: vitals[f.key], unit: f.unit }; }); onSubmit(shaped, assignedDoctor); }
  return (
    <div style={rdStyles.modalOverlay} onClick={onCancel}>
      <div style={rdStyles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={rdStyles.modalHeader}>
          <div><div style={rdStyles.modalPatientName}>{patient.name}</div><div style={rdStyles.modalPatientMeta}>{patient.id} · Check-in vitals</div></div>
          <button style={rdStyles.modalCloseBtn} onClick={onCancel}><X size={15} /></button>
        </div>
        {doctorNames.length > 0 && <label style={{ ...rdStyles.vitalLabel, marginBottom: 14 }}><span style={rdStyles.vitalLabelText}>Assigned doctor</span><select style={rdStyles.vitalInput} value={assignedDoctor} onChange={(e) => setAssignedDoctor(e.target.value)}><option value="">Assign doctor…</option>{doctorNames.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>}
        <div style={rdStyles.vitalsGrid}>
          {fields.map((f) => (
            <label key={f.key} style={rdStyles.vitalLabel}>
              <span style={rdStyles.vitalLabelText}>{f.icon} {f.label} <span style={rdStyles.unitHint}>({f.unit})</span></span>
              <input style={rdStyles.vitalInput} type="text" inputMode="decimal" value={vitals[f.key]} onChange={(e) => update(f.key, e.target.value)} />
            </label>
          ))}
        </div>
        <div style={rdStyles.modalActions}>
          <button style={rdStyles.submitBtn} onClick={handleSubmit}>Complete check-in</button>
          <button style={rdStyles.cancelBtn} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const rdStyles = {
  page: { minHeight: "100vh", background: "#F6F5F1", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", padding: "28px 16px", boxSizing: "border-box" },
  container: { maxWidth: 600, margin: "0 auto" },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#0B3B36", marginBottom: 4 },
  h1: { fontSize: 21, fontWeight: 700, color: "#1B2320", margin: "0 0 18px" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, gap: 10, flexWrap: "wrap" },
  headerBtnRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  addWalkInBtn: { display: "flex", alignItems: "center", gap: 6, background: "#0B3B36", color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  addEmergencyBtn: { display: "flex", alignItems: "center", gap: 6, background: "#9B2C2C", color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  tabRow: { display: "flex", gap: 4, borderBottom: "1px solid #E8E6DF", marginBottom: 14 },
  tabBtn: { padding: "9px 12px", fontSize: 13, fontWeight: 600, color: "#8A928F", background: "none", border: "none", borderBottom: "2px solid transparent", cursor: "pointer", whiteSpace: "nowrap" },
  tabBtnActive: { color: "#0B3B36", borderBottom: "2px solid #0B3B36" },
  removeQueueBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.05)", color: "#9B2C2C", cursor: "pointer", padding: 0, marginLeft: 6, flexShrink: 0 },
  dateNavRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  dateNavBtn: { fontSize: 12, fontWeight: 600, color: "#0B3B36", background: "#fff", border: "1px solid #DCD9D0", borderRadius: 8, padding: "7px 12px", cursor: "pointer" },
  dateNavInput: { fontSize: 12.5, fontWeight: 600, color: "#1B2320", background: "#fff", border: "1px solid #DCD9D0", borderRadius: 8, padding: "7px 10px" },
  emptyNote: { fontSize: 13, color: "#8A928F", padding: "20px 4px", textAlign: "center" },
  patientRowEmergency: { border: "1px solid #F5C6C6", background: "#FFFAFA" },
  emergencyNameTag: { fontSize: 9.5, fontWeight: 700, color: "#9B2C2C", background: "#FDECEC", padding: "2px 6px", borderRadius: 4, marginLeft: 6 },
  emergencyTag: { fontSize: 11.5, fontWeight: 700, color: "#9B2C2C", background: "#FDECEC", padding: "4px 9px", borderRadius: 20 },
  walkinTag: { fontSize: 11.5, fontWeight: 700, color: "#5B635F", background: "#F0EFEA", padding: "4px 9px", borderRadius: 20 },
  searchInputWrap: { display: "flex", alignItems: "center", gap: 8, background: "#F6F5F1", border: "1px solid #DCD9D0", borderRadius: 10, padding: "10px 12px", marginBottom: 14, boxSizing: "border-box" },
  searchInput: { flex: 1, border: "none", outline: "none", fontSize: 14, fontFamily: "inherit", background: "transparent" },
  walkinResultsList: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" },
  walkinResultRow: { display: "flex", alignItems: "center", gap: 12, background: "#F6F5F1", border: "1px solid #EEECE5", borderRadius: 10, padding: "10px 12px", cursor: "pointer" },
  emptyNote: { fontSize: 12.5, color: "#8A928F", fontStyle: "italic", lineHeight: 1.5, padding: "6px 2px" },
  rowList: { display: "flex", flexDirection: "column", gap: 8 },
  patientRow: { display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #E8E6DF", borderRadius: 10, padding: "11px 12px", flexWrap: "wrap" },
  avatarSmall: { width: 36, height: 36, borderRadius: "50%", background: "#0B3B36", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0, cursor: "pointer" },
  patientMain: { flex: 1, minWidth: 140, cursor: "pointer" },
  patientName: { fontSize: 13.5, fontWeight: 600, color: "#1B2320" },
  patientId: { fontSize: 11.5, color: "#8A928F", fontWeight: 500, marginLeft: 6 },
  patientMeta: { fontSize: 12, color: "#7A8380", marginTop: 2 },
  slotTag: { fontSize: 11.5, fontWeight: 700, color: "#5B635F", background: "#F1F1EF", padding: "4px 9px", borderRadius: 20 },
  slotTagLate: { color: "#9B2C2C", background: "#FDECEC" },
  waitingTag: { fontSize: 11.5, fontWeight: 700, color: "#1E6B45", background: "#EAF5EF", padding: "4px 9px", borderRadius: 20 },
  seenTag: { fontSize: 11.5, fontWeight: 700, color: "#5B635F", background: "#F1F1EF", padding: "4px 9px", borderRadius: 20 },
  refreshBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, border: "1px solid #DCD9D0", background: "#fff", color: "#0B3B36", cursor: "pointer" },
  checkInBtn: { background: "#0B3B36", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(20,24,22,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 },
  modalCard: { background: "#fff", borderRadius: 14, padding: 22, width: "100%", maxWidth: 460, boxSizing: "border-box", maxHeight: "85vh", overflowY: "auto" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  modalPatientName: { fontSize: 16, fontWeight: 700, color: "#1B2320" },
  modalPatientMeta: { fontSize: 12, color: "#8A928F", marginTop: 2 },
  modalCloseBtn: { background: "#F6F5F1", border: "none", borderRadius: 7, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5B635F", flexShrink: 0 },
  vitalsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 },
  vitalLabel: { display: "flex", flexDirection: "column", fontSize: 12, fontWeight: 600, color: "#3C4441", gap: 6 },
  vitalLabelText: { display: "flex", alignItems: "center", gap: 5 },
  unitHint: { fontSize: 10.5, color: "#8A928F", fontWeight: 500 },
  vitalInput: { fontSize: 14, padding: "8px 10px", borderRadius: 7, border: "1px solid #DCD9D0", fontFamily: "inherit", boxSizing: "border-box", width: "100%" },
  modalActions: { display: "flex", gap: 10 },
  submitBtn: { flex: 1, background: "#0B3B36", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  cancelBtn: { background: "#fff", color: "#5B635F", border: "1px solid #DCD9D0", borderRadius: 8, padding: "11px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
};

/* ============================================================================
   APPOINTMENT DESK — 48 half-hour slots/day, booking counts, reschedule/cancel.
   Reads and writes the same shared `appointments` array as Reception and the
   Doctor dashboard, so bookings, reschedules, and cancellations here show up
   live everywhere else — no manual syncing needed.
   ========================================================================== */
function formatSlotLabel(hour, minute) {
  const d = new Date(); d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}
function generateDaySlots() {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) slots.push({ hour: h, minute: m, key: `${h}:${m}`, label: formatSlotLabel(h, m) });
  }
  return slots; // exactly 48 slots
}
const DAY_SLOTS = generateDaySlots();
function todayISO() { return indiaDateISO(); }

/* ============================================================================
   SUPABASE DATA MAPPING — camelCase (app) <-> snake_case (DB) for every
   entity. Kept in one place so the shape contract between the client and
   Postgres is explicit and easy to audit.
   ========================================================================== */
const patientFromDb = (r) => ({ id: r.id, name: r.name, dob: r.dob, sex: r.sex, phone: r.phone, fatherName: r.father_name, motherName: r.mother_name, address: r.address });
const patientToDb = (p) => ({ id: p.id, name: p.name, dob: p.dob || null, sex: p.sex, phone: p.phone, father_name: p.fatherName || null, mother_name: p.motherName || null, address: p.address || null });

const appointmentFromDb = (r) => ({
  id: r.id, patientId: r.patient_id, patientName: r.patient_name, phone: r.phone,
  doctor: r.doctor_name, dateISO: r.date_iso, hour: r.hour, minute: r.minute,
  status: r.status, appointmentType: r.appointment_type, entrySource: r.entry_source,
  cancelReason: r.cancel_reason, checkedIn: r.checked_in,
  checkInAt: r.check_in_at ? new Date(r.check_in_at) : null, vitals: r.vitals || null,
});
const appointmentToDb = (a) => ({
  id: a.id, patient_id: a.patientId, patient_name: a.patientName || null, phone: a.phone || null,
  doctor_name: a.doctor || null, date_iso: a.dateISO, hour: a.hour ?? null, minute: a.minute ?? null,
  status: a.status || "confirmed", appointment_type: a.appointmentType || "New Consultation",
  entry_source: a.entrySource || "appointment-desk", cancel_reason: a.cancelReason || null,
  checked_in: !!a.checkedIn, check_in_at: a.checkInAt ? new Date(a.checkInAt).toISOString() : null,
  vitals: a.vitals || null,
});

const VITALS_UNITS = { weight: "kg", height: "cm", headCirc: "cm", pr: "bpm", rr: "/min", temp: "°F", spo2: "%" };
const vitalsFromDb = (r) => ({
  dbId: r.id,
  weight: { value: r.weight ?? "", unit: VITALS_UNITS.weight },
  height: { value: r.height ?? "", unit: VITALS_UNITS.height },
  headCirc: { value: r.head_circ ?? "", unit: VITALS_UNITS.headCirc },
  pr: { value: r.pr ?? "", unit: VITALS_UNITS.pr },
  rr: { value: r.rr ?? "", unit: VITALS_UNITS.rr },
  temp: { value: r.temp ?? "", unit: VITALS_UNITS.temp },
  spo2: { value: r.spo2 ?? "", unit: VITALS_UNITS.spo2 },
  dateLabel: r.date_label, dateISO: r.recorded_at,
  recordedOn: indiaDateTimeLabel(new Date(r.recorded_at)),
});
// Vitals fields arrive shaped as { value, unit } (from the entry forms) — pull out
// the numeric value before sending to Postgres numeric columns, which reject objects.
const numVal = (f) => {
  const raw = f && typeof f === "object" ? f.value : f;
  if (raw === "" || raw === undefined || raw === null) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
};
const vitalsToDb = (v, patientId, recordedBy) => ({
  patient_id: patientId, recorded_by: recordedBy || null, date_label: v.dateLabel,
  recorded_date: v.dateISO || null,
  weight: numVal(v.weight), height: numVal(v.height), head_circ: numVal(v.headCirc),
  pr: numVal(v.pr), rr: numVal(v.rr), temp: numVal(v.temp), spo2: numVal(v.spo2),
});

// Consultations cover both OPD (has a `prescription` sub-object) and IPD (admit/discharge) —
// two shapes, one table, distinguished by `type`.
function consultationFromDb(r) {
  if (r.type === "IPD") {
    return { dbId: r.id, type: "IPD", admitDate: r.admit_date, dischargeDate: r.discharge_date, doctor: r.consulting_doctor, room: r.room_number, fileNumber: r.file_number, summary: r.findings };
  }
  const base = { dbId: r.id, type: "OPD", date: r.date_label, doctor: r.consulting_doctor, diagnosis: r.diagnosis, hasPrescription: r.has_prescription, bookedDoctor: r.booked_doctor, consultingDoctor: r.consulting_doctor };
  if (!r.has_prescription) return base;
  return { ...base, prescription: { date: r.date_label, bookedDoctor: r.booked_doctor, consultingDoctor: r.consulting_doctor, pastHistory: r.past_history || "", complaints: r.complaints, findings: r.findings, diagnosis: r.diagnosis, medications: r.medications || [], investigations: r.investigations, instructions: r.instructions, followUp: r.follow_up } };
}
function consultationToDb(h, patientId) {
  if (h.type === "IPD") {
    return { patient_id: patientId, type: "IPD", date_label: h.admitDate || todayISO(), admit_date: h.admitDate || null, discharge_date: h.dischargeDate || null, consulting_doctor: h.doctor || "—", room_number: h.room || null, file_number: h.fileNumber || null, findings: h.summary || null, has_prescription: false };
  }
  const rx = h.prescription || {};
  return {
    patient_id: patientId, type: "OPD", date_label: h.date, booked_doctor: h.bookedDoctor || null, consulting_doctor: h.consultingDoctor || h.doctor,
    diagnosis: h.diagnosis || null, has_prescription: !!h.hasPrescription,
    past_history: rx.pastHistory || null, complaints: rx.complaints || null, findings: rx.findings || null, medications: rx.medications || null,
    investigations: rx.investigations || null, instructions: rx.instructions || null, follow_up: rx.followUp || null,
  };
}

// Tracks in-flight Supabase writes so logout can wait for them instead of
// racing the network request (was causing vitals entered right before
// logout to silently not save).
let pendingWriteCount = 0;
function beginWrite() { pendingWriteCount++; }
function endWrite() { pendingWriteCount = Math.max(0, pendingWriteCount - 1); }
async function waitForPendingWrites() {
  while (pendingWriteCount > 0) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

const roomFromDb = (r) => ({ number: r.number, type: r.type, status: r.status, patient: r.patient_name, patientId: r.patient_id, doctor: r.doctor, fileNumber: r.file_number, admitDate: r.admit_date });
const roomToDb = (r) => ({ number: r.number, type: r.type, status: r.status, patient_name: r.patient || null, patient_id: r.patientId || null, doctor: r.doctor || null, file_number: r.fileNumber || null, admit_date: r.admitDate || null });

const clinicDetailsFromDb = (r) => ({ name: r.name, address: r.address, phone: r.phone, email: r.email || "", website: r.website || "" });
const clinicDetailsToDb = (c) => ({ name: c.name, address: c.address, phone: c.phone, email: c.email || "", website: c.website || "" });

const printSettingsFromDb = (r) => ({
  marginTop: r.margin_top, marginBottom: r.margin_bottom, marginLeft: r.margin_left, marginRight: r.margin_right,
  includeClinicHeader: r.include_clinic_header, includeComplaints: r.include_complaints, includeFindings: r.include_findings,
  includeDiagnosis: r.include_diagnosis, includeMedications: r.include_medications, includeInvestigations: r.include_investigations,
  includeInstructions: r.include_instructions, includeVaccination: r.include_vaccination, includeFollowUp: r.include_follow_up, includeGrowthChart: r.include_growth_chart,
});
const printSettingsToDb = (p) => ({
  margin_top: p.marginTop, margin_bottom: p.marginBottom, margin_left: p.marginLeft, margin_right: p.marginRight,
  include_clinic_header: p.includeClinicHeader, include_complaints: p.includeComplaints, include_findings: p.includeFindings,
  include_diagnosis: p.includeDiagnosis, include_medications: p.includeMedications, include_investigations: p.includeInvestigations,
  include_instructions: p.includeInstructions, include_vaccination: p.includeVaccination, include_follow_up: p.includeFollowUp, include_growth_chart: p.includeGrowthChart,
});

// Groups a flat list of rows into { [patientId]: [...] }, newest first — the
// shape vitalsRecords/patientHistoryRecords have always used locally.
function groupByPatient(rows, mapFn, sortKey) {
  const grouped = {};
  for (const row of rows) {
    const mapped = mapFn(row);
    const pid = row.patient_id;
    if (!grouped[pid]) grouped[pid] = [];
    grouped[pid].push(mapped);
  }
  if (sortKey) for (const pid in grouped) grouped[pid].sort((a, b) => new Date(b[sortKey]) - new Date(a[sortKey]));
  return grouped;
}


function formatDateLabel(dateISO) { return new Date(dateISO + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }

function nextApptId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `A-${crypto.randomUUID()}`;
  return `A-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const seedScheduledAppointments = [];

function AppointmentBookingScreen({ allPatients, appointments, setAppointments, doctorNames, appointmentTypes, patientHistoryRecords, setPatientHistoryRecords, onRefreshData, initialPatient, onInitialPatientConsumed }) {
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [showBookModal, setShowBookModal] = useState(false);
  const [prefillSlot, setPrefillSlot] = useState(null);
  const [rescheduling, setRescheduling] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const dayAppointments = appointments.filter((a) => a.dateISO === selectedDate);
  const activeDayAppointments = Array.from(
    dayAppointments.filter((a) => a.status !== "cancelled").reduce((map, a) => {
      const existing = map.get(a.patientId);
      if (!existing || (!!a.checkedIn && !existing.checkedIn) || ((a.checkInAt || 0) > (existing.checkInAt || 0))) map.set(a.patientId, a);
      return map;
    }, new Map()).values()
  ).sort((a, b) => ((a.hour ?? 24) * 60 + (a.minute ?? 0)) - ((b.hour ?? 24) * 60 + (b.minute ?? 0)));
  const cancelledDayAppointments = dayAppointments.filter((a) => a.status === "cancelled");
  const todayLabel = indiaDateLabel();

  function countForSlot(dateISO, hour, minute, excludeId) {
    return appointments.filter((a) => a.dateISO === dateISO && a.hour === hour && a.minute === minute && a.status !== "cancelled" && a.id !== excludeId).length;
  }

  // Bookings, reschedules, and cancellations can come from Reception or another
  // Appointment Desk session too — refresh pulls the latest state (and today's
  // consultations, so "Seen" status stays accurate) without a full page reload.
  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (onRefreshData) await onRefreshData();
      else {
        const [apptsRes, consultRes] = await Promise.all([
          supabase.from("appointments").select("*"),
          supabase.from("consultations").select("*"),
        ]);
        if (apptsRes.error) throw apptsRes.error;
        if (consultRes.error) throw consultRes.error;
        setAppointments((apptsRes.data || []).map(appointmentFromDb));
        if (setPatientHistoryRecords) setPatientHistoryRecords(groupByPatient(consultRes.data || [], consultationFromDb, null));
      }
    } catch (error) {
      console.error("Refresh failed", error);
      window.alert(`Refresh failed: ${error?.message || "Please check your connection and database permissions."}`);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleBook({ patient, doctor, hour, minute, dateISO, appointmentType }) {
    if (isPastIndiaSlot(dateISO, hour, minute)) { window.alert("Cannot book an appointment in a time that has already passed."); return; }
    const existingSamePatient = appointments.find((a) => a.patientId === patient.id && a.dateISO === dateISO && a.status !== "cancelled");
    if (existingSamePatient) { window.alert("This patient already has an active appointment for the selected date."); return; }
    const entry = { id: nextApptId(), patientId: patient.id, patientName: patient.name, phone: patient.phone, doctor, dateISO, hour, minute, status: "confirmed", appointmentType, entrySource: "appointment-desk", checkedIn: false, checkInAt: null };
    setAppointments((prev) => [...prev, entry]);
    setSelectedDate(dateISO);
    setShowBookModal(false);
    setPrefillSlot(null);

    const { data, error } = await supabase.from("appointments").insert(appointmentToDb(entry)).select().single();
    if (error) {
      console.error("Failed to save appointment", error);
      setAppointments((prev) => prev.filter((a) => a.id !== entry.id));
      window.alert(`Appointment could not be saved: ${error.message}`);
      return;
    }
    if (data) {
      const saved = appointmentFromDb(data);
      setAppointments((prev) => prev.map((a) => a.id === entry.id ? saved : a));
    }
  }
  function handleReschedule(apptId, dateISO, hour, minute) {
    if (isPastIndiaSlot(dateISO, hour, minute)) { window.alert("Cannot book or reschedule an appointment to a time that has already passed."); return; }
    setAppointments((prev) => prev.map((a) => (a.id === apptId ? { ...a, dateISO, hour, minute, status: "confirmed" } : a)));
    setSelectedDate(dateISO);
    setRescheduling(null);
    supabase.from("appointments").update({ date_iso: dateISO, hour, minute, status: "confirmed" }).eq("id", apptId).then(({ error }) => { if (error) console.error("Failed to reschedule appointment", error); });
  }
  function handleCancel(apptId, reason) {
    const appt = appointments.find((a) => a.id === apptId);
    const seenToday = appt && (patientHistoryRecords?.[appt.patientId] || []).some((h) => h.date === indiaDateLabel());
    if (seenToday) { window.alert("This patient has already been seen and cannot be cancelled."); setCancelling(null); return; }
    setAppointments((prev) => prev.map((a) => (a.id === apptId ? { ...a, status: "cancelled", cancelReason: reason } : a)));
    setCancelling(null);
    supabase.from("appointments").update({ status: "cancelled", cancel_reason: reason }).eq("id", apptId).then(({ error }) => { if (error) console.error("Failed to cancel appointment", error); });
  }

  return (
    <div style={apptStyles.page}>
      <div style={apptStyles.container}>
        <div style={apptStyles.headerRow}>
          <div><div style={apptStyles.eyebrow}>APPOINTMENT DESK</div><h1 style={apptStyles.h1}>Appointments</h1></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={rdStyles.refreshBtn} onClick={handleRefresh} disabled={refreshing} title="Refresh"><RefreshCw size={14} style={{ opacity: refreshing ? 0.4 : 1 }} /></button>
            <button style={apptStyles.bookBtn} onClick={() => { setPrefillSlot(null); setShowBookModal(true); }}><Plus size={16} />Book appointment</button>
          </div>
        </div>

        <label style={apptStyles.dateLabel}>
          Date
          <input type="date" style={apptStyles.dateInput} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        </label>

        <div style={apptStyles.slotsHeading}>48 half-hour slots · {formatDateLabel(selectedDate)}</div>
        <div style={apptStyles.slotGrid}>
          {DAY_SLOTS.map((s) => {
            const count = countForSlot(selectedDate, s.hour, s.minute);
            const isPast = isPastIndiaSlot(selectedDate, s.hour, s.minute);
            return (
              <button key={s.key} type="button" disabled={isPast} style={{ ...apptStyles.slotChip, ...(count > 0 ? apptStyles.slotChipBooked : {}), ...(isPast ? { opacity: 0.35, cursor: "not-allowed" } : {}) }} onClick={() => { if (!isPast) { setPrefillSlot(s); setShowBookModal(true); } }}>
                <span>{s.label}</span>
                {count > 0 && <span style={apptStyles.slotCountBadge}>{count}</span>}
              </button>
            );
          })}
        </div>

        <div style={apptStyles.listHeading}>Booked for this date ({activeDayAppointments.length})</div>
        <div style={apptStyles.rowList}>
          {activeDayAppointments.length === 0 && <div style={apptStyles.emptyNote}>No appointments booked for this date yet.</div>}
          {activeDayAppointments.map((a) => {
            const isReception = a.hour == null; // walk-in / emergency added from Reception, no fixed slot
            const seenToday = selectedDate === todayISO() && (patientHistoryRecords?.[a.patientId] || []).some((h) => h.date === todayLabel);
            return (
              <div key={a.id} style={apptStyles.apptRow}>
                <div style={apptStyles.avatarSmall}>{a.patientName.charAt(0)}</div>
                <div style={apptStyles.apptMain}>
                  <div style={apptStyles.apptName}>{a.patientName} <span style={apptStyles.apptId}>{a.patientId}</span>{isReception && <span style={{ ...apptStyles.apptId, marginLeft: 6, color: a.entrySource === "emergency" ? "#9B2C2C" : "#8A928F" }}>· {a.entrySource === "emergency" ? "EMERGENCY (reception)" : "WALK-IN (reception)"}</span>}{seenToday && <span style={{ ...apptStyles.apptId, marginLeft: 6, color: "#1E6B45" }}>· SEEN</span>}</div>
                  <div style={apptStyles.apptMeta}>{isReception ? (a.checkedIn ? "Checked in" : "Not yet checked in") : formatSlotLabel(a.hour, a.minute)} · {a.doctor} · {a.appointmentType || "New Consultation"} · {a.phone}</div>
                </div>
                {!seenToday && (
                  <div style={apptStyles.apptActions}>
                    {!isReception && <button style={apptStyles.rescheduleBtn} onClick={() => setRescheduling(a)}>Reschedule</button>}
                    <button style={apptStyles.cancelBtnSmall} onClick={() => setCancelling(a)}>Cancel</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {cancelledDayAppointments.length > 0 && (
          <>
            <div style={apptStyles.listHeading}>Cancelled</div>
            <div style={apptStyles.rowList}>
              {cancelledDayAppointments.map((a) => (
                <div key={a.id} style={{ ...apptStyles.apptRow, opacity: 0.6 }}>
                  <div style={apptStyles.avatarSmall}>{a.patientName.charAt(0)}</div>
                  <div style={apptStyles.apptMain}>
                    <div style={apptStyles.apptName}>{a.patientName} <span style={apptStyles.apptId}>{a.patientId}</span></div>
                    <div style={apptStyles.apptMeta}>Was: {a.hour != null ? formatSlotLabel(a.hour, a.minute) : (a.entrySource === "emergency" ? "Emergency (reception)" : "Walk-in (reception)")} · {a.doctor}{a.cancelReason ? ` · ${a.cancelReason}` : ""}</div>
                  </div>
                  <span style={apptStyles.cancelledTag}>Cancelled</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showBookModal && (
        <BookAppointmentModal
          allPatients={allPatients}
          initialPatient={initialPatient}
          onInitialPatientConsumed={onInitialPatientConsumed}
          initialDate={selectedDate}
          initialSlot={prefillSlot}
          countForSlot={countForSlot}
          onCancel={() => { setShowBookModal(false); setPrefillSlot(null); }}
          onConfirm={handleBook}
          doctorNames={doctorNames}
          appointmentTypes={appointmentTypes}
        />
      )}
      {rescheduling && (
        <RescheduleApptModal
          appt={rescheduling}
          countForSlot={countForSlot}
          onCancel={() => setRescheduling(null)}
          onConfirm={(dateISO, hour, minute) => handleReschedule(rescheduling.id, dateISO, hour, minute)}
        />
      )}
      {cancelling && (
        <CancelApptModal appt={cancelling} onCancel={() => setCancelling(null)} onConfirm={(reason) => handleCancel(cancelling.id, reason)} />
      )}
    </div>
  );
}

function BookAppointmentModal({ allPatients, initialPatient, onInitialPatientConsumed, initialDate, initialSlot, countForSlot, onCancel, onConfirm, doctorNames, appointmentTypes }) {
  const [date, setDate] = useState(initialDate);
  const [query, setQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(initialPatient || null);
  const [doctor, setDoctor] = useState((doctorNames && doctorNames[0]) || "");
  const [appointmentType, setAppointmentType] = useState((appointmentTypes && appointmentTypes[0]) || "New Consultation");
  const [slot, setSlot] = useState(initialSlot || DAY_SLOTS[20]);

  useEffect(() => {
    if (initialPatient) {
      setSelectedPatient(initialPatient);
      if (onInitialPatientConsumed) onInitialPatientConsumed();
    }
  }, [initialPatient]);

  const results = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const qDigits = query.replace(/[^\d]/g, "");
    return allPatients.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      String(p.phone || "").includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (qDigits.length > 0 && toDDMMYY(p.dob).startsWith(qDigits))
    );
  })();

  function handleSubmit() {
    if (!selectedPatient) return;
    onConfirm({ patient: selectedPatient, doctor, hour: slot.hour, minute: slot.minute, dateISO: date, appointmentType });
  }

  return (
    <div style={apptStyles.modalOverlay} onClick={onCancel}>
      <div style={apptStyles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={apptStyles.modalHeader}>
          <div style={apptStyles.modalTitle}>Book appointment</div>
          <button style={apptStyles.modalCloseBtn} onClick={onCancel}><X size={15} /></button>
        </div>

        <label style={apptStyles.modalLabel}>Date</label>
        <input type="date" style={apptStyles.modalInput} value={date} onChange={(e) => setDate(e.target.value)} min={todayISO()} />

        <label style={apptStyles.modalLabel}>Patient</label>
        {selectedPatient ? (
          <div style={apptStyles.selectedPatientRow}><span>{selectedPatient.name} <span style={apptStyles.idTagSmall}>{selectedPatient.id}</span></span><button style={apptStyles.changeBtn} onClick={() => setSelectedPatient(null)}>Change</button></div>
        ) : (
          <>
            <input style={apptStyles.modalInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, phone, ID, or DOB (ddmmyy)…" />
            <div style={apptStyles.patientResultsList}>
              {results.map((p) => <div key={p.id} style={apptStyles.patientResultRow} onClick={() => setSelectedPatient(p)}>{p.name} <span style={apptStyles.idTagSmall}>{p.id}</span></div>)}
            </div>
          </>
        )}

        <label style={apptStyles.modalLabel}>Doctor</label>
        <select style={apptStyles.modalInput} value={doctor} onChange={(e) => setDoctor(e.target.value)}>{(doctorNames || []).map((d) => <option key={d} value={d}>{d}</option>)}</select>

        <label style={apptStyles.modalLabel}>Appointment type</label>
        <select style={apptStyles.modalInput} value={appointmentType} onChange={(e) => setAppointmentType(e.target.value)}>
          {(appointmentTypes || DEFAULT_APPOINTMENT_TYPES).map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <label style={apptStyles.modalLabel}>Time slot <span style={apptStyles.selectedSlotHint}>Selected: {slot.label}</span></label>
        <div style={apptStyles.modalSlotGrid}>
          {DAY_SLOTS.map((s) => {
            const count = countForSlot(date, s.hour, s.minute);
            const isSelected = slot.hour === s.hour && slot.minute === s.minute;
            const isPast = isPastIndiaSlot(date, s.hour, s.minute);
            return (
              <button key={s.key} type="button" disabled={isPast} onClick={() => !isPast && setSlot(s)} style={{ ...apptStyles.modalSlotChip, ...(isSelected ? apptStyles.modalSlotChipActive : {}), ...(isPast ? { opacity: 0.35, cursor: "not-allowed" } : {}) }}>
                {s.label}{count > 0 && <span style={{ ...apptStyles.modalSlotCount, ...(isSelected ? apptStyles.modalSlotCountActive : {}) }}>{count}</span>}
              </button>
            );
          })}
        </div>

        <div style={apptStyles.modalActions}>
          <button style={apptStyles.submitBtn} disabled={!selectedPatient} onClick={handleSubmit}>Confirm booking</button>
          <button style={apptStyles.cancelModalBtn} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function RescheduleApptModal({ appt, countForSlot, onCancel, onConfirm }) {
  const [date, setDate] = useState(appt.dateISO);
  const [slot, setSlot] = useState({ hour: appt.hour, minute: appt.minute, key: `${appt.hour}:${appt.minute}`, label: formatSlotLabel(appt.hour, appt.minute) });

  return (
    <div style={apptStyles.modalOverlay} onClick={onCancel}>
      <div style={apptStyles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={apptStyles.modalHeader}>
          <div style={apptStyles.modalTitle}>Reschedule appointment</div>
          <button style={apptStyles.modalCloseBtn} onClick={onCancel}><X size={15} /></button>
        </div>
        <div style={apptStyles.modalSub}>{appt.patientName} <span style={apptStyles.idTagSmall}>{appt.patientId}</span> · {appt.doctor}</div>
        <div style={apptStyles.currentSlotNote}>Currently: {formatDateLabel(appt.dateISO)} · {formatSlotLabel(appt.hour, appt.minute)}</div>

        <label style={apptStyles.modalLabel}>New date</label>
        <input type="date" style={apptStyles.modalInput} value={date} onChange={(e) => setDate(e.target.value)} min={todayISO()} />

        <label style={apptStyles.modalLabel}>New time slot <span style={apptStyles.selectedSlotHint}>Selected: {slot.label}</span></label>
        <div style={apptStyles.modalSlotGrid}>
          {DAY_SLOTS.map((s) => {
            const count = countForSlot(date, s.hour, s.minute, appt.id);
            const isSelected = slot.hour === s.hour && slot.minute === s.minute;
            const isPast = isPastIndiaSlot(date, s.hour, s.minute);
            return (
              <button key={s.key} type="button" disabled={isPast} onClick={() => !isPast && setSlot(s)} style={{ ...apptStyles.modalSlotChip, ...(isSelected ? apptStyles.modalSlotChipActive : {}), ...(isPast ? { opacity: 0.35, cursor: "not-allowed" } : {}) }}>
                {s.label}{count > 0 && <span style={{ ...apptStyles.modalSlotCount, ...(isSelected ? apptStyles.modalSlotCountActive : {}) }}>{count}</span>}
              </button>
            );
          })}
        </div>

        <div style={apptStyles.modalActions}>
          <button style={apptStyles.submitBtn} onClick={() => onConfirm(date, slot.hour, slot.minute)}>Confirm new slot</button>
          <button style={apptStyles.cancelModalBtn} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function CancelApptModal({ appt, onCancel, onConfirm }) {
  const [reason, setReason] = useState("");
  return (
    <div style={apptStyles.modalOverlay} onClick={onCancel}>
      <div style={apptStyles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={apptStyles.modalIconRow}><AlertTriangle size={18} color="#9B2C2C" /><div style={apptStyles.modalTitle}>Cancel appointment?</div></div>
        <div style={apptStyles.modalSub}>{appt.patientName} · {formatDateLabel(appt.dateISO)} · {formatSlotLabel(appt.hour, appt.minute)}</div>
        <label style={apptStyles.modalLabel}>Reason <span style={apptStyles.optionalTagSmall}>optional</span></label>
        <input style={apptStyles.modalInput} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Patient called to cancel" />
        <div style={apptStyles.modalActions}>
          <button style={apptStyles.confirmCancelBtn} onClick={() => onConfirm(reason.trim() || null)}>Yes, cancel</button>
          <button style={apptStyles.cancelModalBtn} onClick={onCancel}>Go back</button>
        </div>
      </div>
    </div>
  );
}

const apptStyles = {
  page: { minHeight: "100vh", background: "#F6F5F1", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", padding: "28px 16px", boxSizing: "border-box" },
  container: { maxWidth: 640, margin: "0 auto" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, gap: 10, flexWrap: "wrap" },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#0B3B36", marginBottom: 4 },
  h1: { fontSize: 21, fontWeight: 700, color: "#1B2320", margin: 0 },
  bookBtn: { display: "flex", alignItems: "center", gap: 6, background: "#0B3B36", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  dateLabel: { display: "flex", flexDirection: "column", fontSize: 12, fontWeight: 700, color: "#3C4441", gap: 6, marginBottom: 18, maxWidth: 220 },
  dateInput: { fontSize: 14, padding: "9px 11px", borderRadius: 8, border: "1px solid #DCD9D0", fontFamily: "inherit", boxSizing: "border-box" },
  slotsHeading: { fontSize: 12, fontWeight: 700, color: "#5B635F", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.03em" },
  slotGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 6, marginBottom: 22, maxHeight: 260, overflowY: "auto", padding: 2 },
  slotChip: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 600, color: "#5B635F", background: "#fff", border: "1px solid #E8E6DF", borderRadius: 8, padding: "7px 4px", cursor: "pointer" },
  slotChipBooked: { background: "#E7EFEC", borderColor: "#BEE3CD", color: "#0B3B36" },
  slotCountBadge: { fontSize: 9.5, fontWeight: 700, background: "#0B3B36", color: "#fff", borderRadius: 20, padding: "0px 6px", minWidth: 14, textAlign: "center" },
  listHeading: { fontSize: 12.5, fontWeight: 700, color: "#1B2320", margin: "18px 0 10px" },
  rowList: { display: "flex", flexDirection: "column", gap: 8 },
  emptyNote: { fontSize: 12.5, color: "#8A928F", fontStyle: "italic" },
  apptRow: { display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #E8E6DF", borderRadius: 10, padding: "11px 12px", flexWrap: "wrap" },
  avatarSmall: { width: 36, height: 36, borderRadius: "50%", background: "#0B3B36", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 },
  apptMain: { flex: 1, minWidth: 160 },
  apptName: { fontSize: 13.5, fontWeight: 600, color: "#1B2320" },
  apptId: { fontSize: 11.5, color: "#8A928F", fontWeight: 500, marginLeft: 6 },
  apptMeta: { fontSize: 12, color: "#7A8380", marginTop: 2 },
  apptActions: { display: "flex", gap: 6, flexWrap: "wrap" },
  rescheduleBtn: { fontSize: 11.5, fontWeight: 600, color: "#0B3B36", background: "#F6F5F1", border: "1px solid #E8E6DF", borderRadius: 7, padding: "7px 11px", cursor: "pointer", whiteSpace: "nowrap" },
  cancelBtnSmall: { fontSize: 11.5, fontWeight: 600, color: "#9B2C2C", background: "#FDECEC", border: "1px solid #F5C6C6", borderRadius: 7, padding: "7px 11px", cursor: "pointer", whiteSpace: "nowrap" },
  cancelledTag: { fontSize: 11, fontWeight: 700, color: "#9B2C2C", background: "#FDECEC", padding: "3px 9px", borderRadius: 20 },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(20,24,22,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 },
  modalCard: { background: "#fff", borderRadius: 14, padding: 22, width: "100%", maxWidth: 460, boxSizing: "border-box", maxHeight: "88vh", overflowY: "auto" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  modalIconRow: { display: "flex", alignItems: "center", gap: 8 },
  modalTitle: { fontSize: 16, fontWeight: 700, color: "#1B2320" },
  modalSub: { fontSize: 12, color: "#8A928F", marginTop: 4, marginBottom: 4, fontWeight: 500 },
  modalCloseBtn: { background: "#F6F5F1", border: "none", borderRadius: 7, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5B635F", flexShrink: 0 },
  currentSlotNote: { fontSize: 12, color: "#5B635F", background: "#F6F5F1", borderRadius: 7, padding: "6px 10px", marginBottom: 10, marginTop: 8 },
  modalLabel: { display: "block", fontSize: 12, fontWeight: 700, color: "#3C4441", marginBottom: 6, marginTop: 14 },
  selectedSlotHint: { fontWeight: 500, color: "#8A928F", fontSize: 11, marginLeft: 6 },
  optionalTagSmall: { fontSize: 10.5, fontWeight: 500, color: "#B0B5B1" },
  modalInput: { fontSize: 14, padding: "9px 11px", borderRadius: 8, border: "1px solid #DCD9D0", fontFamily: "inherit", boxSizing: "border-box", width: "100%" },
  patientResultsList: { display: "flex", flexDirection: "column", gap: 6, marginTop: 8, maxHeight: 160, overflowY: "auto" },
  patientResultRow: { fontSize: 13, color: "#1B2320", background: "#F6F5F1", border: "1px solid #EEECE5", borderRadius: 8, padding: "9px 11px", cursor: "pointer" },
  selectedPatientRow: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#E7EFEC", border: "1px solid #0B3B36", borderRadius: 8, padding: "9px 11px", fontSize: 13, fontWeight: 600, color: "#0B3B36" },
  idTagSmall: { fontSize: 11, color: "#8A928F", fontWeight: 500 },
  changeBtn: { fontSize: 11.5, fontWeight: 600, color: "#0B3B36", background: "#fff", border: "1px solid #0B3B36", borderRadius: 6, padding: "4px 9px", cursor: "pointer" },
  modalSlotGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))", gap: 6, maxHeight: 200, overflowY: "auto", padding: 2 },
  modalSlotChip: { display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#5B635F", background: "#fff", border: "1px solid #DCD9D0", borderRadius: 8, padding: "7px 4px", cursor: "pointer" },
  modalSlotChipActive: { background: "#0B3B36", border: "1px solid #0B3B36", color: "#fff" },
  modalSlotCount: { fontSize: 9.5, fontWeight: 700, background: "#F1F1EF", color: "#5B635F", borderRadius: 20, padding: "0 5px" },
  modalSlotCountActive: { background: "rgba(255,255,255,0.25)", color: "#fff" },
  modalActions: { display: "flex", gap: 10, marginTop: 18 },
  submitBtn: { flex: 1, background: "#0B3B36", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  cancelModalBtn: { background: "#fff", color: "#5B635F", border: "1px solid #DCD9D0", borderRadius: 8, padding: "11px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  confirmCancelBtn: { flex: 1, background: "#9B2C2C", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" },
};

/* ============================================================================
   ROOMS & VACCINES SECTION (shared)
   ========================================================================== */
function isVaccineReminderSuppressed(schedule) {
  const others = (schedule || []).find((box) => box.isOthers);
  return !!others?.hideDashboardReminders;
}
function setVaccineReminderSuppressed(schedule, hidden) {
  return (schedule || []).map((box) => box.isOthers ? { ...box, hideDashboardReminders: !!hidden } : box);
}
function vaccineDaysFromToday(due) {
  if (!due) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due); d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}
function RoomsAndVaccinesSection({ vaccinationRecords, allPatients, rooms }) {
  const [showRooms, setShowRooms] = useState(true);
  const [showVaccines, setShowVaccines] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const roomList = rooms || [];
  const occupiedCount = roomList.filter((r) => r.status === "occupied").length;

  const vaccinesDue = useMemo(() => {
    const grouped = [];
    const byPatient = new Map();
    const records = vaccinationRecords || {};
    const patients = allPatients || [];
    for (const p of patients) {
      const schedule = records[p.id];
      if (!schedule || isVaccineReminderSuppressed(schedule)) continue;
      for (const v of flattenSchedule(schedule)) {
        if (v.given || !v.due) continue;
        const days = vaccineDaysFromToday(v.due);
        // Show overdue, due today, and upcoming vaccines from 7 days before the due date.
        if (days !== null && days <= 7) {
          let group = byPatient.get(p.id);
          if (!group) {
            group = { patient: p.name, id: p.id, phone: p.phone, vaccines: [] };
            byPatient.set(p.id, group);
            grouped.push(group);
          }
          group.vaccines.push({
            vaccine: v.name + (v.dose ? ` (${v.dose})` : ""),
            due: v.due,
            days,
            status: days < 0 ? "Overdue" : days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`,
          });
        }
      }
    }
    for (const group of grouped) {
      group.vaccines.sort((a, b) => a.days - b.days || a.vaccine.localeCompare(b.vaccine));
    }
    grouped.sort((a, b) => {
      const aDays = a.vaccines[0]?.days ?? 0;
      const bDays = b.vaccines[0]?.days ?? 0;
      return aDays - bDays || a.patient.localeCompare(b.patient);
    });
    return grouped;
  }, [vaccinationRecords, allPatients]);

  return (
    <div style={rvStyles.wrap}>
      <div style={rvStyles.headerRow}>
        <div style={rvStyles.sectionGroupTitle}>Rooms &amp; Vaccines</div>
        <button style={rvStyles.settingsBtn} onClick={() => setShowSettings((s) => !s)}>
          <Settings2 size={13} />{showSettings ? "Close" : "Show/Hide"}
        </button>
      </div>

      {showSettings && (
        <div style={rvStyles.settingsPanel}>
          <div style={rvStyles.settingsRow}>
            <span style={rvStyles.settingsLabel}>Room availability</span>
            <button style={{ ...rvStyles.toggleSwitch, ...(showRooms ? rvStyles.toggleOn : rvStyles.toggleOff) }} onClick={() => setShowRooms((v) => !v)}>
              {showRooms ? <Eye size={13} /> : <EyeOff size={13} />}{showRooms ? "On" : "Off"}
            </button>
          </div>
          <div style={rvStyles.settingsRow}>
            <span style={rvStyles.settingsLabel}>Vaccines due/overdue</span>
            <button style={{ ...rvStyles.toggleSwitch, ...(showVaccines ? rvStyles.toggleOn : rvStyles.toggleOff) }} onClick={() => setShowVaccines((v) => !v)}>
              {showVaccines ? <Eye size={13} /> : <EyeOff size={13} />}{showVaccines ? "On" : "Off"}
            </button>
          </div>
        </div>
      )}

      <div style={rvStyles.statsRow}>
        {showRooms && <div style={rvStyles.statCard}><div style={rvStyles.statIcon}><BedDouble size={17} color="#0B3B36" /></div><div><div style={rvStyles.statValue}>{occupiedCount} / {roomList.length}</div><div style={rvStyles.statLabel}>Rooms occupied</div></div></div>}
        {showVaccines && <div style={rvStyles.statCard}><div style={rvStyles.statIcon}><Syringe size={17} color="#B7791F" /></div><div><div style={rvStyles.statValue}>{vaccinesDue.reduce((total, p) => total + p.vaccines.length, 0)}</div><div style={rvStyles.statLabel}>Vaccines due</div></div></div>}
      </div>

      {showRooms && (
        <div style={rvStyles.roomGrid}>
          {roomList.length === 0 && <div style={rvStyles.emptyVaxNote}>No rooms set up yet. Admin can add rooms in Settings → Room Setup.</div>}
          {roomList.map((r) => (
            <div key={r.number} style={{ ...rvStyles.roomCard, ...(r.status === "occupied" ? rvStyles.roomOccupied : rvStyles.roomEmpty) }}>
              <div style={rvStyles.roomTop}><span style={rvStyles.roomNumber}>{r.number}</span><span style={{ ...rvStyles.roomStatusTag, color: r.status === "occupied" ? "#9B2C2C" : "#1E6B45", background: r.status === "occupied" ? "#FDECEC" : "#EAF5EF" }}>{r.status === "occupied" ? "Occupied" : "Empty"}</span></div>
              <div style={rvStyles.roomType}>{r.type}</div>
              {r.status === "occupied" && <div style={rvStyles.roomPatient}>{r.patient} <span style={rvStyles.miniId}>{r.patientId}</span></div>}
            </div>
          ))}
        </div>
      )}

      {showVaccines && (
        <>
          <div style={rvStyles.vaxHeading}>Vaccines due / overdue</div>
          <div style={rvStyles.vaxDueList}>
            {vaccinesDue.length === 0 && <div style={rvStyles.emptyVaxNote}>No vaccines due yet — due dates are set by a doctor from each patient's profile.</div>}
            {vaccinesDue.map((p) => (
              <div key={p.id} style={rvStyles.vaxDueRow}>
                <AlertCircle size={15} color="#B7791F" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={rvStyles.vaxDuePatient}>{p.patient} <span style={rvStyles.miniId}>{p.id}</span></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 5 }}>
                    {p.vaccines.map((v, i) => (
                      <div key={i} style={rvStyles.vaxDueMeta}>{v.vaccine} · {v.status}</div>
                    ))}
                  </div>
                </div>
                <div style={rvStyles.vaxDuePhone}><Phone size={11} style={{ marginRight: 4 }} />{p.phone}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const rvStyles = {
  wrap: { marginTop: 26, paddingTop: 20, borderTop: "1px solid #E8E6DF" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  settingsBtn: { display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #E8E6DF", borderRadius: 8, padding: "7px 11px", fontSize: 12, fontWeight: 600, color: "#5B635F", cursor: "pointer" },
  settingsPanel: { background: "#fff", border: "1px solid #E8E6DF", borderRadius: 12, padding: "14px 16px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 },
  settingsRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  settingsLabel: { fontSize: 13, fontWeight: 700, color: "#1B2320" },
  toggleSwitch: { display: "flex", alignItems: "center", gap: 6, border: "1px solid", borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  toggleOn: { background: "#EAF5EF", borderColor: "#BEE3CD", color: "#1E6B45" },
  toggleOff: { background: "#F1F1EF", borderColor: "#DEDDD6", color: "#8A928F" },
  sectionGroupTitle: { fontSize: 14.5, fontWeight: 700, color: "#1B2320" },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 },
  statCard: { background: "#fff", border: "1px solid #E8E6DF", borderRadius: 12, padding: "14px 12px", display: "flex", alignItems: "center", gap: 10 },
  statIcon: { width: 32, height: 32, borderRadius: 8, background: "#E7EFEC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  statValue: { fontSize: 18, fontWeight: 700, color: "#1B2320", lineHeight: 1.1 },
  statLabel: { fontSize: 11, color: "#7A8380", marginTop: 2 },
  roomGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 },
  roomCard: { borderRadius: 10, padding: "12px 12px", border: "1px solid" },
  roomOccupied: { background: "#FFF9F5", borderColor: "#F0DACB" },
  roomEmpty: { background: "#F6FBF8", borderColor: "#D8ECDF" },
  roomTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  roomNumber: { fontSize: 14.5, fontWeight: 700, color: "#1B2320" },
  roomStatusTag: { fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 },
  roomType: { fontSize: 12, color: "#8A928F", marginBottom: 8 },
  roomPatient: { fontSize: 12.5, fontWeight: 600, color: "#1B2320" },
  miniId: { fontSize: 11, color: "#8A928F", fontWeight: 500 },
  vaxHeading: { fontSize: 13.5, fontWeight: 700, color: "#1B2320", margin: "20px 0 10px" },
  vaxDueList: { display: "flex", flexDirection: "column", gap: 8 },
  emptyVaxNote: { fontSize: 12, color: "#8A928F", fontStyle: "italic", padding: "6px 2px" },
  vaxDueRow: { display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #F0D9A8", borderRadius: 10, padding: "10px 12px" },
  vaxDuePatient: { fontSize: 13.5, fontWeight: 600, color: "#1B2320" },
  vaxDueMeta: { fontSize: 12, color: "#7A8380", marginTop: 2 },
  vaxDuePhone: { fontSize: 12, color: "#5B635F", display: "flex", alignItems: "center", whiteSpace: "nowrap" },
};

/* ============================================================================
   PATIENT REGISTRATION + PATIENTS TAB
   ========================================================================== */
function nextPatientId(patients) {
  const max = patients.reduce((acc, p) => { const n = parseInt(p.id.replace("P-", ""), 10); return n > acc ? n : acc; }, 0);
  return `P-${String(max + 1).padStart(4, "0")}`;
}
function countMatches(candidate, existing) {
  let count = 0;
  if (candidate.name.trim().toLowerCase() === existing.name.trim().toLowerCase()) count++;
  if (candidate.dob === existing.dob) count++;
  if (candidate.phone === existing.phone) count++;
  if (candidate.sex === existing.sex) count++;
  return count;
}

function PatientRegistrationScreen({ existingPatients, onDone, onCancel }) {
  const [dobMode, setDobMode] = useState("exact");
  const [form, setForm] = useState({ name: "", dob: "", approxYears: "", approxMonths: "", sex: "", phone: "", fatherName: "", motherName: "", address: "" });
  const [errors, setErrors] = useState({});
  const [successId, setSuccessId] = useState(null);
  const [duplicateMatch, setDuplicateMatch] = useState(null);

  const effectiveDob = useMemo(() => {
    if (dobMode === "exact") return form.dob || null;
    const y = parseInt(form.approxYears, 10) || 0, m = parseInt(form.approxMonths, 10) || 0;
    if (y === 0 && m === 0) return null;
    const d = new Date(); d.setFullYear(d.getFullYear() - y); d.setMonth(d.getMonth() - m);
    return d.toISOString().split("T")[0];
  }, [dobMode, form.dob, form.approxYears, form.approxMonths]);

  function update(field, value) { setForm((f) => ({ ...f, [field]: value })); if (errors[field]) setErrors((e) => ({ ...e, [field]: null })); setSuccessId(null); setDuplicateMatch(null); }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = "Patient name is required.";
    if (dobMode === "exact") { if (!form.dob) e.dob = "Date of birth is required."; }
    else { const y = parseInt(form.approxYears, 10) || 0, m = parseInt(form.approxMonths, 10) || 0; if (y === 0 && m === 0) e.approx = "Enter an approximate age."; }
    if (!form.sex) e.sex = "Please select sex.";
    if (!/^\d{10}$/.test(form.phone.trim())) e.phone = "Enter a valid 10-digit phone number.";
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const candidate = { name: form.name.trim(), dob: effectiveDob, sex: form.sex, phone: form.phone.trim(), fatherName: form.fatherName.trim() || null, motherName: form.motherName.trim() || null, address: form.address.trim() || null };
    let matched = null;
    for (const p of existingPatients) { if (countMatches(candidate, p) >= 3) { matched = p; break; } }
    if (matched) { setDuplicateMatch(matched); return; }
    const newId = nextPatientId(existingPatients);
    setSuccessId(newId);
    onDone({ id: newId, ...candidate });
  }

  return (
    <div style={regStyles.page}>
      <div style={regStyles.card}>
        {onCancel && <button type="button" style={regStyles.backBtn} onClick={onCancel}>← Back to patients</button>}
        <div style={regStyles.header}>
          <div style={regStyles.iconBadge}><UserPlus2 size={20} color="#0B3B36" /></div>
          <div><div style={regStyles.eyebrow}>RECEPTION · NEW PATIENT</div><h1 style={regStyles.h1}>Patient registration</h1></div>
        </div>
        <form onSubmit={handleSubmit} style={regStyles.form}>
          <label style={regStyles.label}>Full name<input style={inputStyle(errors.name)} value={form.name} onChange={(e) => update("name", e.target.value)} />{errors.name && <span style={regStyles.err}>{errors.name}</span>}</label>
          <div>
            <div style={regStyles.dobModeRow}>
              <span style={regStyles.labelWithIcon}><Calendar size={13} /> Date of birth</span>
              <button type="button" onClick={() => setDobMode((m) => (m === "exact" ? "approximate" : "exact"))} style={regStyles.modeSwitchBtn}>{dobMode === "exact" ? "Don't know exact DOB?" : "Enter exact DOB"}</button>
            </div>
            {dobMode === "exact" ? (
              <><input style={inputStyle(errors.dob)} type="date" value={form.dob} onChange={(e) => update("dob", e.target.value)} max={new Date().toISOString().split("T")[0]} />{errors.dob && <span style={regStyles.err}>{errors.dob}</span>}</>
            ) : (
              <><div style={regStyles.approxRow}><input style={inputStyle(errors.approx)} type="number" min="0" placeholder="Years" value={form.approxYears} onChange={(e) => update("approxYears", e.target.value)} /><input style={inputStyle(errors.approx)} type="number" min="0" max="11" placeholder="Months" value={form.approxMonths} onChange={(e) => update("approxMonths", e.target.value)} /></div>{errors.approx && <span style={regStyles.err}>{errors.approx}</span>}</>
            )}
          </div>
          <label style={regStyles.label}>Sex
            <div style={regStyles.sexToggle}>{["Male", "Female", "Other"].map((o) => <button key={o} type="button" onClick={() => update("sex", o)} style={{ ...regStyles.sexBtn, ...(form.sex === o ? regStyles.sexBtnActive : {}) }}>{o}</button>)}</div>
            {errors.sex && <span style={regStyles.err}>{errors.sex}</span>}
          </label>
          <label style={regStyles.label}><span style={regStyles.labelWithIcon}><Phone size={13} /> Phone number</span><input style={inputStyle(errors.phone)} value={form.phone} onChange={(e) => update("phone", e.target.value.replace(/[^\d]/g, "").slice(0, 10))} inputMode="numeric" />{errors.phone && <span style={regStyles.err}>{errors.phone}</span>}</label>
          <div style={regStyles.approxRow}>
            <label style={regStyles.label}>Father's name<input style={inputStyle(false)} value={form.fatherName} onChange={(e) => update("fatherName", e.target.value)} /></label>
            <label style={regStyles.label}>Mother's name<input style={inputStyle(false)} value={form.motherName} onChange={(e) => update("motherName", e.target.value)} /></label>
          </div>
          <label style={regStyles.label}>Address<textarea style={{ ...inputStyle(false), minHeight: 60, resize: "vertical", fontFamily: "inherit" }} value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="House no., street, city, state, PIN" /></label>
          {duplicateMatch && (
            <div style={regStyles.dupBox}>
              <div style={regStyles.dupHeader}><AlertTriangle size={16} color="#9B2C2C" />Possible duplicate</div>
              <div style={regStyles.dupCard}><div style={regStyles.dupId}>{duplicateMatch.id}</div><div style={regStyles.dupRow}>{duplicateMatch.name} · {duplicateMatch.sex}</div><div style={regStyles.dupRow}>DOB: {duplicateMatch.dob} · Phone: {duplicateMatch.phone}</div></div>
              <div style={regStyles.dupNote}>3+ details matched — open the existing record instead, or edit details if this is a different person.</div>
            </div>
          )}
          {successId && <div style={regStyles.successBox}><CheckCircle2 size={16} color="#1E6B45" style={{ flexShrink: 0 }} />Registered. New Patient ID: <strong>{successId}</strong></div>}
          <div style={regStyles.actions}><button type="submit" style={regStyles.submitBtn}>Register patient</button></div>
        </form>
      </div>
    </div>
  );
}

function inputStyle(hasError) { return { fontSize: 14.5, padding: "10px 12px", borderRadius: 8, border: `1px solid ${hasError ? "#E0A0A0" : "#DCD9D0"}`, fontFamily: "inherit", color: "#1B2320", boxSizing: "border-box", width: "100%" }; }

const regStyles = {
  backBtn: { background: "none", border: "none", fontSize: 13, fontWeight: 600, color: "#0B3B36", cursor: "pointer", padding: 0, marginBottom: 16, display: "block" },
  page: { minHeight: "100vh", background: "#F6F5F1", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", padding: "32px 20px", boxSizing: "border-box", display: "flex", justifyContent: "center" },
  card: { width: "100%", maxWidth: 520, background: "#fff", border: "1px solid #E8E6DF", borderRadius: 14, padding: 28, boxSizing: "border-box" },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 22 },
  iconBadge: { width: 40, height: 40, borderRadius: 10, background: "#E7EFEC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#0B3B36", marginBottom: 3 },
  h1: { fontSize: 20, fontWeight: 700, color: "#1B2320", margin: 0 },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  label: { display: "flex", flexDirection: "column", fontSize: 13, fontWeight: 600, color: "#3C4441", gap: 6 },
  labelWithIcon: { display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600, color: "#3C4441" },
  dobModeRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  modeSwitchBtn: { display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: "#0B3B36", background: "#E7EFEC", border: "none", borderRadius: 6, padding: "5px 9px", cursor: "pointer" },
  approxRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  sexToggle: { display: "flex", gap: 8 },
  sexBtn: { flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid #DCD9D0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#5B635F", cursor: "pointer" },
  sexBtnActive: { background: "#E7EFEC", border: "1px solid #0B3B36", color: "#0B3B36" },
  err: { fontSize: 12, color: "#9B2C2C", fontWeight: 500, display: "block", marginTop: 6 },
  successBox: { display: "flex", gap: 10, background: "#EAF5EF", border: "1px solid #BEE3CD", color: "#1E6B45", fontSize: 12.5, padding: "12px 14px", borderRadius: 8, lineHeight: 1.5, fontWeight: 600 },
  dupBox: { background: "#FDF6EC", border: "1px solid #F0D9A8", borderRadius: 10, padding: 14 },
  dupHeader: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#9B2C2C", marginBottom: 10 },
  dupCard: { background: "#fff", border: "1px solid #E8E6DF", borderRadius: 8, padding: "10px 12px", marginBottom: 10 },
  dupId: { fontSize: 13, fontWeight: 700, color: "#0B3B36", marginBottom: 3 },
  dupRow: { fontSize: 12.5, color: "#5B635F", lineHeight: 1.6 },
  dupNote: { fontSize: 12, color: "#8A6D3B", lineHeight: 1.5 },
  actions: { display: "flex", gap: 10, marginTop: 4 },
  submitBtn: { background: "#0B3B36", color: "#fff", border: "none", borderRadius: 8, padding: "11px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", flex: 1 },
};

function PatientsTab({ onSelectPatient, patients, onAddPatient }) {
  const [showRegistration, setShowRegistration] = useState(false);
  const [query, setQuery] = useState("");
  const results = [...patients].filter((p) => {
    const q = query.trim();
    if (!q) return true;
    const qLower = q.toLowerCase();
    const qDigits = q.replace(/[^\d]/g, "");
    return p.name.toLowerCase().includes(qLower) || p.phone.includes(q) || p.id.toLowerCase().includes(qLower) || (qDigits.length > 0 && toDDMMYY(p.dob).startsWith(qDigits));
  }).sort((a, b) => {
    const an = parseInt(String(a.id || "").replace(/\D/g, ""), 10);
    const bn = parseInt(String(b.id || "").replace(/\D/g, ""), 10);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
  if (showRegistration) return <PatientRegistrationScreen existingPatients={patients} onCancel={() => setShowRegistration(false)} onDone={(np) => { onAddPatient(np); setShowRegistration(false); }} />;
  return (
    <div style={patStyles.page}>
      <div style={patStyles.container}>
        <div style={patStyles.header}>
          <div><div style={patStyles.eyebrow}>PATIENTS</div><h1 style={patStyles.h1}>All patients</h1></div>
          <button style={patStyles.addBtn} onClick={() => setShowRegistration(true)}><UserPlus size={16} />Add new patient</button>
        </div>
        <div style={patStyles.searchInputWrap}><Search size={15} color="#8A928F" /><input style={patStyles.searchInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, phone, ID, or DOB (ddmmyy)…" /></div>
        <div style={patStyles.list}>
          {results.map((p) => (
            <div key={p.id} style={patStyles.row} onClick={() => onSelectPatient(p.id, p.name)} role="button" tabIndex={0}>
              <div style={patStyles.avatarSmall}>{p.name.charAt(0)}</div>
              <div style={patStyles.main}><div style={patStyles.name}>{p.name} <span style={patStyles.idTag}>{p.id}</span></div><div style={patStyles.meta}>{p.phone} · DOB {p.dob}</div></div>
              <ChevronRight size={15} color="#B0B5B1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const patStyles = {
  page: { minHeight: "100vh", background: "#F6F5F1", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", padding: "4px 0" },
  container: { maxWidth: 560, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 10, flexWrap: "wrap" },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#0B3B36", marginBottom: 4 },
  h1: { fontSize: 19, fontWeight: 700, color: "#1B2320", margin: 0 },
  addBtn: { display: "flex", alignItems: "center", gap: 6, background: "#0B3B36", color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  searchInputWrap: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #DCD9D0", borderRadius: 10, padding: "10px 12px", marginBottom: 14, boxSizing: "border-box" },
  searchInput: { flex: 1, border: "none", outline: "none", fontSize: 14, fontFamily: "inherit", background: "transparent" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #E8E6DF", borderRadius: 10, padding: "11px 12px", cursor: "pointer" },
  avatarSmall: { width: 36, height: 36, borderRadius: "50%", background: "#0B3B36", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 },
  main: { flex: 1, minWidth: 0 },
  name: { fontSize: 13.5, fontWeight: 600, color: "#1B2320" },
  idTag: { fontSize: 11.5, color: "#8A928F", fontWeight: 500, marginLeft: 6 },
  meta: { fontSize: 12, color: "#7A8380", marginTop: 2 },
};

/* ============================================================================
   IPD ROOM DASHBOARD
   ========================================================================== */
const initialRooms = [
  { number: "G-101", type: "General", status: "empty" },
  { number: "G-102", type: "General", status: "empty" },
  { number: "P-201", type: "Private", status: "empty" },
  { number: "P-202", type: "Private", status: "empty" },
  { number: "D-301", type: "Deluxe", status: "empty" },
];

function IPDRoomDashboardScreen({ allPatients, rooms, setRooms, isAdmin, setPatientHistoryRecords, doctorNames }) {
  const [admittingTo, setAdmittingTo] = useState(null);
  const [managingRoom, setManagingRoom] = useState(null);
  const [switchTarget, setSwitchTarget] = useState(false);
  const occupiedCount = rooms.filter((r) => r.status === "occupied").length;

  function completeAdmission(roomNumber, { patient, doctor, fileNumber }) {
    const admitDate = indiaDateLabel();
    setRooms((prev) => prev.map((r) => (r.number === roomNumber ? { ...r, status: "occupied", patient: patient.name, patientId: patient.id, doctor, fileNumber, admitDate } : r)));
    setAdmittingTo(null);
    supabase.from("rooms").update({ status: "occupied", patient_name: patient.name, patient_id: patient.id, doctor, file_number: fileNumber || null, admit_date: admitDate }).eq("number", roomNumber).then(({ error }) => { if (error) console.error("Failed to save admission", error); });
  }
  function dischargeRoom(roomNumber, summary) {
    const room = rooms.find((r) => r.number === roomNumber);
    const dischargeDate = indiaDateLabel();
    if (room && room.patientId && setPatientHistoryRecords) {
      const entry = {
        type: "IPD",
        admitDate: room.admitDate || "—",
        dischargeDate,
        doctor: room.doctor,
        room: `${room.type} · ${room.number}`,
        fileNumber: room.fileNumber || null,
        summary,
      };
      setPatientHistoryRecords((recs) => ({ ...recs, [room.patientId]: [entry, ...(recs[room.patientId] || [])] }));
      supabase.from("consultations").insert(consultationToDb(entry, room.patientId)).then(({ error }) => { if (error) console.error("Failed to save discharge summary", error); });
    }
    setRooms((prev) => prev.map((r) => (r.number === roomNumber ? { number: r.number, type: r.type, status: "empty" } : r)));
    setManagingRoom(null); setSwitchTarget(false);
    supabase.from("rooms").update({ status: "empty", patient_name: null, patient_id: null, doctor: null, file_number: null, admit_date: null }).eq("number", roomNumber).then(({ error }) => { if (error) console.error("Failed to save discharge", error); });
  }
  function switchToRoom(fromRoomNumber, toRoomNumber) {
    const fromRoom = rooms.find((r) => r.number === fromRoomNumber);
    setRooms((prev) => prev.map((r) => {
      if (r.number === toRoomNumber) return { ...r, status: "occupied", patient: fromRoom.patient, patientId: fromRoom.patientId, doctor: fromRoom.doctor, fileNumber: fromRoom.fileNumber, admitDate: fromRoom.admitDate };
      if (r.number === fromRoomNumber) return { number: r.number, type: r.type, status: "empty" };
      return r;
    }));
    setManagingRoom(null); setSwitchTarget(false);
    Promise.all([
      supabase.from("rooms").update({ status: "occupied", patient_name: fromRoom.patient, patient_id: fromRoom.patientId, doctor: fromRoom.doctor, file_number: fromRoom.fileNumber || null, admit_date: fromRoom.admitDate || null }).eq("number", toRoomNumber),
      supabase.from("rooms").update({ status: "empty", patient_name: null, patient_id: null, doctor: null, file_number: null, admit_date: null }).eq("number", fromRoomNumber),
    ]).then(([a, b]) => { if (a.error || b.error) console.error("Failed to save room switch", a.error || b.error); });
  }

  return (
    <div style={ipdStyles.page}>
      <div style={ipdStyles.container}>
        <div style={ipdStyles.eyebrow}>IPD · ROOM AVAILABILITY</div>
        <h1 style={ipdStyles.h1}>Rooms &amp; Beds</h1>
        {isAdmin && <div style={ipdStyles.adminNote}>To add or remove room slots, use Settings → Room Setup.</div>}
        <div style={ipdStyles.statsRow}>
          <div style={ipdStyles.statCard}><BedDouble size={16} color="#0B3B36" /><span style={ipdStyles.statValue}>{rooms.length}</span><span style={ipdStyles.statLabel}>Total</span></div>
          <div style={ipdStyles.statCard}><span style={{ ...ipdStyles.statValue, color: "#9B2C2C" }}>{occupiedCount}</span><span style={ipdStyles.statLabel}>Occupied</span></div>
          <div style={ipdStyles.statCard}><span style={{ ...ipdStyles.statValue, color: "#1E6B45" }}>{rooms.length - occupiedCount}</span><span style={ipdStyles.statLabel}>Empty</span></div>
        </div>
        <div style={ipdStyles.roomGrid}>
          {rooms.map((r) => (
            <div key={r.number} style={{ ...ipdStyles.roomCard, ...(r.status === "occupied" ? ipdStyles.roomOccupied : ipdStyles.roomEmpty) }}>
              <div style={ipdStyles.roomTop}><span style={ipdStyles.roomNumber}>{r.number}</span><span style={{ ...ipdStyles.roomStatusTag, color: r.status === "occupied" ? "#9B2C2C" : "#1E6B45", background: r.status === "occupied" ? "#FDECEC" : "#EAF5EF" }}>{r.status === "occupied" ? "Occupied" : "Empty"}</span></div>
              <div style={ipdStyles.roomType}>{r.type}</div>
              {r.status === "occupied" ? (
                <div style={ipdStyles.roomPatient} onClick={() => setManagingRoom(r)} role="button" tabIndex={0}>{r.patient} <span style={ipdStyles.patientId}>{r.patientId}</span><div style={ipdStyles.roomDoctor}>{r.doctor}</div></div>
              ) : (
                <button style={ipdStyles.admitBtn} onClick={() => setAdmittingTo(r)}><Plus size={12} style={{ marginRight: 4 }} />Admit here</button>
              )}
            </div>
          ))}
        </div>
      </div>
      {admittingTo && <AdmissionModal room={admittingTo} allPatients={allPatients} onCancel={() => setAdmittingTo(null)} onSubmit={(data) => completeAdmission(admittingTo.number, data)} doctorNames={doctorNames} />}
      {managingRoom && !switchTarget && <ManageRoomModal room={managingRoom} onCancel={() => setManagingRoom(null)} onDischarge={(summary) => dischargeRoom(managingRoom.number, summary)} onSwitchRoom={() => setSwitchTarget(true)} />}
      {managingRoom && switchTarget && <SwitchRoomModal fromRoom={managingRoom} emptyRooms={rooms.filter((r) => r.status === "empty")} onCancel={() => setSwitchTarget(false)} onSelect={(to) => switchToRoom(managingRoom.number, to)} />}
    </div>
  );
}

function AdmissionModal({ room, allPatients, onCancel, onSubmit, doctorNames }) {
  const [query, setQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [doctor, setDoctor] = useState((doctorNames && doctorNames[0]) || "");
  const [fileNumber, setFileNumber] = useState("");
  const results = allPatients.filter((p) => !query.trim() || p.name.toLowerCase().includes(query.toLowerCase()) || p.id.toLowerCase().includes(query.toLowerCase()));
  return (
    <div style={ipdStyles.modalOverlay} onClick={onCancel}>
      <div style={ipdStyles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={ipdStyles.modalTitle}>Admit to {room.number} <span style={ipdStyles.modalSub}>({room.type})</span></div>
        <label style={ipdStyles.modalLabel}>Patient</label>
        {selectedPatient ? (
          <div style={ipdStyles.selectedPatientRow}><span>{selectedPatient.name} <span style={ipdStyles.patientId}>{selectedPatient.id}</span></span><button style={ipdStyles.changeBtn} onClick={() => setSelectedPatient(null)}>Change</button></div>
        ) : (
          <><input style={ipdStyles.modalInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search patient…" />
          <div style={ipdStyles.patientResultsList}>{results.map((p) => <div key={p.id} style={ipdStyles.patientResultRow} onClick={() => setSelectedPatient(p)}>{p.name} <span style={ipdStyles.patientId}>{p.id}</span></div>)}</div></>
        )}
        <label style={ipdStyles.modalLabel}>Doctor</label>
        <select style={ipdStyles.modalInput} value={doctor} onChange={(e) => setDoctor(e.target.value)}>{(doctorNames || []).map((d) => <option key={d} value={d}>{d}</option>)}</select>
        <label style={ipdStyles.modalLabel}>File number</label>
        <input style={ipdStyles.modalInput} value={fileNumber} onChange={(e) => setFileNumber(e.target.value)} placeholder="e.g. F-2026-0150" />
        <div style={ipdStyles.modalActions}>
          <button style={ipdStyles.submitBtn} disabled={!selectedPatient} onClick={() => onSubmit({ patient: selectedPatient, doctor, fileNumber: fileNumber.trim() || null })}>Confirm admission</button>
          <button style={ipdStyles.cancelBtn} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
function ManageRoomModal({ room, onCancel, onDischarge, onSwitchRoom }) {
  const [confirmingDischarge, setConfirmingDischarge] = useState(false);
  const [summary, setSummary] = useState("");

  function handleConfirmDischarge() {
    if (!summary.trim()) return;
    onDischarge(summary.trim());
  }

  return (
    <div style={ipdStyles.modalOverlay} onClick={onCancel}>
      <div style={ipdStyles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={ipdStyles.modalTitle}>{room.patient} <span style={ipdStyles.patientId}>{room.patientId}</span></div>
        <div style={ipdStyles.modalSub}>Room {room.number} ({room.type}) · {room.doctor} · File: {room.fileNumber || "— not entered"}</div>

        {!confirmingDischarge ? (
          <div style={ipdStyles.manageActions}>
            <button style={ipdStyles.manageBtn} onClick={onSwitchRoom}>Switch room</button>
            <button style={ipdStyles.manageBtnDanger} onClick={() => setConfirmingDischarge(true)}>Discharge patient</button>
            <button style={ipdStyles.cancelBtn} onClick={onCancel}>Close</button>
          </div>
        ) : (
          <div>
            <label style={ipdStyles.modalLabel}>Discharge summary <span style={ipdStyles.optionalTag}>required</span></label>
            <textarea
              style={{ ...ipdStyles.modalInput, minHeight: 80, resize: "vertical", fontFamily: "inherit" }}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="e.g. Admitted for dengue fever with low platelets. Managed with IV fluids and monitoring. Discharged in stable condition."
              autoFocus
            />
            <div style={ipdStyles.summaryHint}>This summary, along with the file number, will be saved to the patient's History tab.</div>
            <div style={ipdStyles.manageActions}>
              <button style={ipdStyles.manageBtnDanger} disabled={!summary.trim()} onClick={handleConfirmDischarge}>Confirm discharge</button>
              <button style={ipdStyles.cancelBtn} onClick={() => setConfirmingDischarge(false)}>Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function SwitchRoomModal({ fromRoom, emptyRooms, onCancel, onSelect }) {
  return (
    <div style={ipdStyles.modalOverlay} onClick={onCancel}>
      <div style={ipdStyles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={ipdStyles.modalTitle}>Move {fromRoom.patient} to…</div>
        <div style={ipdStyles.patientResultsList}>
          {emptyRooms.length === 0 && <div style={ipdStyles.emptyNote}>No empty rooms available.</div>}
          {emptyRooms.map((r) => <div key={r.number} style={ipdStyles.patientResultRow} onClick={() => onSelect(r.number)}>{r.number} <span style={ipdStyles.patientId}>({r.type})</span></div>)}
        </div>
        <div style={ipdStyles.modalActions}><button style={ipdStyles.cancelBtn} onClick={onCancel}>Cancel</button></div>
      </div>
    </div>
  );
}

const ipdStyles = {
  page: { minHeight: "100vh", background: "#F6F5F1", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", padding: "28px 16px", boxSizing: "border-box" },
  container: { maxWidth: 640, margin: "0 auto" },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#0B3B36", marginBottom: 4 },
  h1: { fontSize: 21, fontWeight: 700, color: "#1B2320", margin: "0 0 18px" },
  adminNote: { fontSize: 11.5, color: "#0B3B36", background: "#E7EFEC", border: "1px solid #BEE3CD", borderRadius: 8, padding: "8px 11px", marginBottom: 14, fontWeight: 600 },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 },
  statCard: { background: "#fff", border: "1px solid #E8E6DF", borderRadius: 12, padding: "12px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 },
  statValue: { fontSize: 18, fontWeight: 700, color: "#1B2320" },
  statLabel: { fontSize: 10.5, color: "#8A928F", fontWeight: 600 },
  roomGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 },
  roomCard: { borderRadius: 10, padding: "12px 12px", border: "1px solid" },
  roomOccupied: { background: "#FFF9F5", borderColor: "#F0DACB" },
  roomEmpty: { background: "#F6FBF8", borderColor: "#D8ECDF" },
  roomTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  roomNumber: { fontSize: 14.5, fontWeight: 700, color: "#1B2320" },
  roomStatusTag: { fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 },
  roomType: { fontSize: 12, color: "#8A928F", marginBottom: 8 },
  roomPatient: { fontSize: 12.5, fontWeight: 600, color: "#1B2320", cursor: "pointer" },
  patientId: { fontSize: 11, color: "#8A928F", fontWeight: 500 },
  roomDoctor: { fontSize: 11, color: "#7A8380", fontWeight: 500, marginTop: 4 },
  admitBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", background: "#0B3B36", color: "#fff", border: "none", borderRadius: 7, padding: "7px 0", fontSize: 11.5, fontWeight: 600, cursor: "pointer" },
  emptyNote: { fontSize: 12.5, color: "#8A928F", fontStyle: "italic", gridColumn: "1 / -1" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(20,24,22,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 },
  modalCard: { background: "#fff", borderRadius: 14, padding: 22, width: "100%", maxWidth: 420, boxSizing: "border-box", maxHeight: "85vh", overflowY: "auto" },
  modalTitle: { fontSize: 16, fontWeight: 700, color: "#1B2320", marginBottom: 2 },
  modalSub: { fontSize: 12, color: "#8A928F", marginBottom: 16, fontWeight: 500 },
  modalLabel: { display: "block", fontSize: 12, fontWeight: 700, color: "#3C4441", marginBottom: 6, marginTop: 12 },
  optionalTag: { fontSize: 10.5, fontWeight: 500, color: "#B0B5B1" },
  summaryHint: { fontSize: 11, color: "#8A928F", marginTop: 6, lineHeight: 1.5 },
  modalInput: { fontSize: 14, padding: "9px 11px", borderRadius: 8, border: "1px solid #DCD9D0", fontFamily: "inherit", boxSizing: "border-box", width: "100%" },
  patientResultsList: { display: "flex", flexDirection: "column", gap: 6, marginTop: 8, maxHeight: 180, overflowY: "auto" },
  patientResultRow: { fontSize: 13, color: "#1B2320", background: "#F6F5F1", border: "1px solid #EEECE5", borderRadius: 8, padding: "9px 11px", cursor: "pointer" },
  selectedPatientRow: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#E7EFEC", border: "1px solid #0B3B36", borderRadius: 8, padding: "9px 11px", fontSize: 13, fontWeight: 600, color: "#0B3B36" },
  changeBtn: { fontSize: 11.5, fontWeight: 600, color: "#0B3B36", background: "#fff", border: "1px solid #0B3B36", borderRadius: 6, padding: "4px 9px", cursor: "pointer" },
  modalActions: { display: "flex", gap: 10, marginTop: 20 },
  submitBtn: { flex: 1, background: "#0B3B36", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  cancelBtn: { background: "#fff", color: "#5B635F", border: "1px solid #DCD9D0", borderRadius: 8, padding: "11px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  manageActions: { display: "flex", flexDirection: "column", gap: 8, marginTop: 16 },
  manageBtn: { background: "#F6F5F1", color: "#0B3B36", border: "1px solid #E8E6DF", borderRadius: 8, padding: "11px 0", fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  manageBtnDanger: { background: "#FDECEC", color: "#9B2C2C", border: "1px solid #F5C6C6", borderRadius: 8, padding: "11px 0", fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
};

/* ============================================================================
   PATIENT PROFILE — Profile / Vitals / Vaccinations / History / Prescription
   Prescription tab: doctor role ONLY (per requirement)
   ========================================================================== */
function guessSex(name) {
  // Simple heuristic fallback only used when a patient record has no sex field on file yet.
  return "Male";
}
function buildMockPatientFor(basePatient) {
  const dob = basePatient.dob || "";
  const sex = basePatient.sex || guessSex(basePatient.name);
  return {
    id: basePatient.id, name: basePatient.name,
    dob, sex,
    phone: basePatient.phone || "",
    fatherName: basePatient.fatherName || "",
    motherName: basePatient.motherName || "",
    address: basePatient.address || "",
    vitals: {
      recordedOn: null,
      weight: { value: "", unit: "kg" }, height: { value: "", unit: "cm" }, headCirc: { value: "", unit: "cm" },
      pr: { value: "", unit: "bpm" }, rr: { value: "", unit: "/min" }, temp: { value: "", unit: "°F" }, spo2: { value: "", unit: "%" },
    },
    history: [],
  };
}

const statusColors = {
  given: { bg: "#EAF5EF", border: "#BEE3CD", text: "#1E6B45", label: "Given" },
  overdue: { bg: "#FDECEC", border: "#F5C6C6", text: "#9B2C2C", label: "Overdue" },
  "due-today": { bg: "#FDF6E3", border: "#F0DFA8", text: "#8A6D3B", label: "Due today" },
  "not-due": { bg: "#F1F1EF", border: "#DEDDD6", text: "#8A928F", label: "Not yet due" },
};

function PatientProfileScreen({ patient, onClose, session, printSettings, vaccinationRecords, setVaccinationRecords, vitalsRecords, setVitalsRecords, patientHistoryRecords, setPatientHistoryRecords, doctorNames, clinicDetails, quickPickLists, setQuickPickLists, onUpdatePatient, onBookAppointment }) {
  const [tab, setTab] = useState("profile");
  const role = session.role;
  const isDoctor = session.role === "doctor";
  // vitalsHistory: array of dated entries, newest first. vitalsRecords[patientId] stores this array
  // so both Doctor and Reception read/write the same history (mirrors the vaccination records pattern).
  const [vitalsHistory, setVitalsHistoryLocal] = useState(() => (vitalsRecords && vitalsRecords[patient.id]) || (patient.vitals?.recordedOn ? [patient.vitals] : []));
  const currentVitals = vitalsHistory[0] || { recordedOn: null, weight: {}, height: {}, headCirc: {}, pr: {}, rr: {}, temp: {}, spo2: {} };
  const [editingVitals, setEditingVitals] = useState(false);
  const [vitalsDraft, setVitalsDraft] = useState(currentVitals);
  function setVitalsHistory(updater) {
    setVitalsHistoryLocal((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (setVitalsRecords) setVitalsRecords((recs) => ({ ...recs, [patient.id]: next }));
      return next;
    });
  }
  const [profileData, setProfileData] = useState(patient);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState(patient);
  const [history, setHistoryLocal] = useState(() => (patientHistoryRecords && patientHistoryRecords[patient.id]) || patient.history);
  function setHistory(updater) {
    setHistoryLocal((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (setPatientHistoryRecords) setPatientHistoryRecords((recs) => ({ ...recs, [patient.id]: next }));
      return next;
    });
  }
  const [viewingRx, setViewingRx] = useState(null);
  const [creatingRx, setCreatingRx] = useState(false);
  const [followUpSource, setFollowUpSource] = useState(null);
  const [printingHandwritten, setPrintingHandwritten] = useState(false);
  const [printingVaccination, setPrintingVaccination] = useState(false);
  const [vaxSchedule, setVaxScheduleLocal] = useState(() => (vaccinationRecords && vaccinationRecords[patient.id]) || buildMainSchedule(patient.dob));
  function setVaxSchedule(updater) {
    setVaxScheduleLocal((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (setVaccinationRecords) setVaccinationRecords((recs) => ({ ...recs, [patient.id]: next }));
      // The whole schedule is one JSONB blob per patient, so every edit (a due date
      // set, a dose marked given, an "Others" vaccine added) just upserts the full
      // array back — no per-vaccine diffing needed.
      supabase.from("vaccination_records").upsert({ patient_id: patient.id, schedule: next }).then(({ error }) => { if (error) console.error("Failed to save vaccination schedule", error); });
      return next;
    });
  }

  // Shell only fetches everyone's records once, at login. That's fine for the session
  // that made a change, but a DIFFERENT already-open login (e.g. a doctor's own tab)
  // won't see it until it refetches. So on top of Shell's cache, re-pull this specific
  // patient's own vitals/history/vaccinations fresh every time their profile is opened —
  // covers the common case (reception admits/discharges IPD, doctor opens that patient
  // next) without needing full realtime infrastructure.
  useEffect(() => {
    let cancelled = false;
    async function refreshPatientData() {
      const [vitalsRes, consultRes, vaxRes] = await Promise.all([
        supabase.from("vitals").select("*").eq("patient_id", patient.id),
        supabase.from("consultations").select("*").eq("patient_id", patient.id),
        supabase.from("vaccination_records").select("*").eq("patient_id", patient.id).maybeSingle(),
      ]);
      if (cancelled) return;
      if (vitalsRes.data) {
        const rawMapped = vitalsRes.data.map(vitalsFromDb).sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
        const byDate = new Map();
        rawMapped.forEach((v) => { const key = v.dateLabel || indiaDateLabel(new Date(v.dateISO)); if (!byDate.has(key)) byDate.set(key, v); });
        const mapped = [...byDate.values()];
        setVitalsHistoryLocal(mapped);
        if (setVitalsRecords) setVitalsRecords((recs) => ({ ...recs, [patient.id]: mapped }));
      }
      if (consultRes.data) {
        const mapped = consultRes.data.map(consultationFromDb);
        setHistoryLocal(mapped);
        if (setPatientHistoryRecords) setPatientHistoryRecords((recs) => ({ ...recs, [patient.id]: mapped }));
      }
      if (vaxRes.data) {
        setVaxScheduleLocal(vaxRes.data.schedule);
        if (setVaccinationRecords) setVaccinationRecords((recs) => ({ ...recs, [patient.id]: vaxRes.data.schedule }));
      }
    }
    refreshPatientData();
    return () => { cancelled = true; };
  }, [patient.id]);

  function saveProfile() {
    setProfileData(profileDraft);
    setEditingProfile(false);
    if (onUpdatePatient) onUpdatePatient(patient.id, profileDraft);
  }
  function startEditVitals() { setVitalsDraft(currentVitals); setEditingVitals(true); }
  async function saveVitals() {
    const now = new Date();
    const recordedOnStr = now.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
    const dateLabel = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const newEntry = { ...vitalsDraft, recordedOn: recordedOnStr, dateLabel, dateISO: indiaDateISO(now) };
    const existingToday = vitalsHistory.find((row) => row.dateISO === newEntry.dateISO || row.dateLabel === dateLabel || indiaDateLabel(new Date(row.dateISO)) === dateLabel);
    setVitalsHistory((prev) => {
      const existingTodayIndex = prev.findIndex((row) => row.dateISO === newEntry.dateISO || row.dateLabel === dateLabel || indiaDateLabel(new Date(row.dateISO)) === dateLabel);
      if (existingTodayIndex >= 0) {
        const next = [...prev];
        next[existingTodayIndex] = newEntry;
        return next;
      }
      return [newEntry, ...prev];
    });
    setEditingVitals(false);
    // Upsert-by-day: enforced by a unique (patient_id, recorded_date) constraint in
    // Postgres, so a doctor and reception editing the same day can never create
    // duplicate rows even if their local state is stale.
    beginWrite();
    try {
      const { error } = await supabase
        .from("vitals")
        .upsert(vitalsToDb(newEntry, patient.id, session.id), { onConflict: "patient_id,recorded_date" });
      if (error) console.error("Failed to save vitals", error);
    } finally {
      endWrite();
    }
  }

  const tabs = [
    { key: "profile", label: "Profile", icon: <User size={15} /> },
    { key: "vitals", label: "Vitals", icon: <Activity size={15} /> },
    { key: "vaccinations", label: "Vaccinations", icon: <Syringe size={15} /> },
    { key: "history", label: "History", icon: <HistoryIcon size={15} /> },
    ...(isDoctor ? [{ key: "prescription", label: "Prescription", icon: <FileText size={15} /> }] : []),
  ];

  function saveNewConsultation(record) {
    const entry = { type: "OPD", date: record.date, doctor: record.consultingDoctor, diagnosis: record.diagnosis || "Consultation", hasPrescription: true, bookedDoctor: record.bookedDoctor, consultingDoctor: record.consultingDoctor, prescription: record };
    setHistory((prev) => [entry, ...prev]);
    setCreatingRx(false);
    setFollowUpSource(null);
    // Open the prescription that was just saved immediately, so the doctor can print
    // without going back through History or searching for the new entry.
    setViewingRx(entry);
    supabase.from("consultations").insert(consultationToDb(entry, patient.id)).then(({ error }) => { if (error) console.error("Failed to save consultation", error); });
  }
  // Printing a handwritten sheet is also a completed consultation — it should move the
  // patient from "Live queue" to "Checked out" on the Doctor Dashboard, same as a typed one.
  function recordHandwrittenCheckout() {
    const todayLabel = indiaDateLabel();
    if (history.some((h) => h.date === todayLabel)) return; // already checked out today, don't duplicate
    const entry = { type: "OPD", date: todayLabel, doctor: session.name, diagnosis: "Handwritten prescription", hasPrescription: false, bookedDoctor: session.name, consultingDoctor: session.name };
    setHistory((prev) => [entry, ...prev]);
    supabase.from("consultations").insert(consultationToDb(entry, patient.id)).then(({ error }) => { if (error) console.error("Failed to save consultation", error); });
  }

  if (viewingRx) return <PrescriptionViewer entry={viewingRx} patient={profileData} onBack={() => setViewingRx(null)} printSettings={printSettings} vaxList={flattenSchedule(vaxSchedule)} vitalsHistory={vitalsHistory} clinicDetails={clinicDetails} quickPickLists={quickPickLists} setQuickPickLists={setQuickPickLists} />;
  if (creatingRx) return <NewConsultationForm patient={profileData} session={session} onCancel={() => { setCreatingRx(false); setFollowUpSource(null); }} onSave={saveNewConsultation} copyFrom={followUpSource} doctorNames={doctorNames} quickPickLists={quickPickLists} setQuickPickLists={setQuickPickLists} vitalsHistory={vitalsHistory} />;
  if (printingHandwritten) return <HandwrittenPrescriptionView patient={profileData} doctorName={session.name} onBack={() => setPrintingHandwritten(false)} printSettings={printSettings} vitalsHistory={vitalsHistory} onPrinted={recordHandwrittenCheckout} clinicDetails={clinicDetails} />;
  if (printingVaccination) return <VaccinationCertificateView patient={profileData} schedule={vaxSchedule} onBack={() => setPrintingVaccination(false)} printSettings={printSettings} clinicDetails={clinicDetails} />;

  const prescriptionEntries = history.filter((h) => h.hasPrescription);

  return (
    <div style={ppStyles.page}>
      <div style={ppStyles.card}>
        <div style={ppStyles.header}>
          <div style={ppStyles.avatar}>{profileData.name.charAt(0)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={ppStyles.name}>{profileData.name}</div>
            <div style={ppStyles.subline}>{profileData.id} · {profileData.sex} · {calcAge(profileData.dob)}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {onBookAppointment && <button style={ppStyles.closeBtn} onClick={() => onBookAppointment(profileData)}>Book appointment</button>}
            {onClose && <button style={ppStyles.closeBtn} onClick={onClose}>Close</button>}
          </div>
        </div>

        <div style={ppStyles.tabBar}>
          {tabs.map((t) => <button key={t.key} onClick={() => setTab(t.key)} style={{ ...ppStyles.tabBtn, ...(tab === t.key ? ppStyles.tabBtnActive : {}) }}>{t.icon}{t.label}</button>)}
        </div>

        <div style={ppStyles.tabContent}>
          {tab === "profile" && (
            editingProfile ? (
              <div>
                <div style={ppStyles.editGrid}>
                  <EditField label="Full name" value={profileDraft.name} onChange={(v) => setProfileDraft({ ...profileDraft, name: v })} />
                  <EditField label="Date of birth" value={profileDraft.dob} onChange={(v) => setProfileDraft({ ...profileDraft, dob: v })} type="date" />
                  <EditField label="Phone" value={profileDraft.phone} onChange={(v) => setProfileDraft({ ...profileDraft, phone: v })} />
                  <EditField label="Father's name" value={profileDraft.fatherName || ""} onChange={(v) => setProfileDraft({ ...profileDraft, fatherName: v })} />
                  <EditField label="Mother's name" value={profileDraft.motherName || ""} onChange={(v) => setProfileDraft({ ...profileDraft, motherName: v })} />
                  <EditField label="Address" value={profileDraft.address || ""} onChange={(v) => setProfileDraft({ ...profileDraft, address: v })} />
                </div>
                <div style={ppStyles.editActions}><button style={ppStyles.saveBtn} onClick={saveProfile}>Save changes</button><button style={ppStyles.cancelBtn} onClick={() => setEditingProfile(false)}>Cancel</button></div>
              </div>
            ) : (
              <div>
                <div style={ppStyles.infoGrid}>
                  <InfoRow icon={<User size={14} />} label="Full name" value={profileData.name} />
                  <InfoRow icon={<Calendar size={14} />} label="Date of birth" value={profileData.dob} />
                  <InfoRow icon={<User size={14} />} label="Sex" value={profileData.sex} />
                  <InfoRow icon={<Phone size={14} />} label="Phone" value={profileData.phone} />
                  {profileData.fatherName && <InfoRow icon={<User size={14} />} label="Father's name" value={profileData.fatherName} />}
                  {profileData.motherName && <InfoRow icon={<User size={14} />} label="Mother's name" value={profileData.motherName} />}
                  {profileData.address && <InfoRow icon={<MapPin size={14} />} label="Address" value={profileData.address} />}
                  <InfoRow icon={<FileText size={14} />} label="Patient ID" value={profileData.id} />
                </div>
                {role === "doctor" ? <button style={ppStyles.editTrigger} onClick={() => { setProfileDraft(profileData); setEditingProfile(true); }}>Edit profile details</button> : <div style={ppStyles.lockedNote}>Only a doctor login can edit profile details.</div>}
              </div>
            )
          )}

          {tab === "vitals" && (
            editingVitals ? (
              <div>
                <div style={ppStyles.vitalsGrid}>
                  {[["weight", "Weight", "kg"], ["height", "Height", "cm"], ["headCirc", "Head circumference", "cm"], ["pr", "Pulse rate (PR)", "bpm"], ["rr", "Respiratory rate (RR)", "/min"], ["temp", "Temperature", "°F"], ["spo2", "SpO2", "%"]].map(([k, label, unit]) => (
                    <label key={k} style={ppStyles.editLabel}>
                      {label} <span style={ppStyles.unitInline}>({unit})</span>
                      <input style={ppStyles.editInput} type="text" inputMode="decimal" value={vitalsDraft[k]?.value ?? ""} onChange={(e) => setVitalsDraft({ ...vitalsDraft, [k]: { value: e.target.value, unit } })} />
                    </label>
                  ))}
                </div>
                <div style={ppStyles.editActions}><button style={ppStyles.saveBtn} onClick={saveVitals}>Save vitals</button><button style={ppStyles.cancelBtn} onClick={() => setEditingVitals(false)}>Cancel</button></div>
              </div>
            ) : (
              <div>
                <div style={ppStyles.vitalsRecordedOn}>{currentVitals.recordedOn ? `Last recorded: ${currentVitals.recordedOn}` : "No vitals recorded yet for this patient."}</div>
                <div style={ppStyles.vitalsGrid}>
                  {[["weight", "Weight", <Weight size={15} />], ["height", "Height", <Ruler size={15} />], ["headCirc", "Head circumference", <Activity size={15} />], ["pr", "Pulse rate (PR)", <HeartPulse size={15} />], ["rr", "Respiratory rate (RR)", <Wind size={15} />], ["temp", "Temperature", <Thermometer size={15} />], ["spo2", "SpO2", <Droplet size={15} />]].map(([k, label, icon]) => (
                    <div key={k} style={ppStyles.vitalCard}>
                      <div style={ppStyles.vitalIcon}>{icon}</div>
                      <div style={ppStyles.vitalLabel}>{label}</div>
                      <div style={ppStyles.vitalValue}>{currentVitals[k]?.value || "—"} <span style={ppStyles.unitText}>{currentVitals[k]?.value ? currentVitals[k]?.unit : ""}</span></div>
                    </div>
                  ))}
                  {(() => { const bmi = calcBMI(currentVitals.weight, currentVitals.height); const cat = bmiCategory(bmi); if (!bmi) return null;
                    return <div style={ppStyles.vitalCard}><div style={ppStyles.vitalIcon}><Activity size={15} /></div><div style={ppStyles.vitalLabel}>BMI</div><div style={ppStyles.vitalValue}>{bmi}{cat && <span style={{ ...ppStyles.bmiTagSmall, color: cat.color, borderColor: cat.color }}>{cat.label}</span>}</div></div>; })()}
                </div>
                {(isDoctor || session.role === "receptionist") ? <button style={ppStyles.editTrigger} onClick={startEditVitals}>Update vitals</button> : <div style={ppStyles.lockedNote}>Vitals can be updated by a doctor or reception login.</div>}

                {vitalsHistory.length > 0 && (
                  <div style={ppStyles.historyTableWrap}>
                    <div style={ppStyles.historyTableTitle}>Vitals history</div>
                    <div style={ppStyles.tableScroll}>
                      <table style={ppStyles.table}>
                        <thead>
                          <tr>
                            <th style={ppStyles.th}>Date</th>
                            <th style={ppStyles.th}>Weight</th>
                            <th style={ppStyles.th}>Height</th>
                            <th style={ppStyles.th}>Head circ.</th>
                            <th style={ppStyles.th}>PR</th>
                            <th style={ppStyles.th}>RR</th>
                            <th style={ppStyles.th}>Temp</th>
                            <th style={ppStyles.th}>SpO2</th>
                            <th style={ppStyles.th}>BMI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vitalsHistory.map((row, i) => (
                            <tr key={i} style={i % 2 === 1 ? ppStyles.trAlt : undefined}>
                              <td style={ppStyles.tdDate}>{row.dateLabel || row.recordedOn}</td>
                              <td style={ppStyles.td}>{row.weight?.value}{row.weight?.value ? <span style={ppStyles.unitTextSmall}> {row.weight.unit}</span> : null}</td>
                              <td style={ppStyles.td}>{row.height?.value}{row.height?.value ? <span style={ppStyles.unitTextSmall}> {row.height.unit}</span> : null}</td>
                              <td style={ppStyles.td}>{row.headCirc?.value}{row.headCirc?.value ? <span style={ppStyles.unitTextSmall}> {row.headCirc.unit}</span> : null}</td>
                              <td style={ppStyles.td}>{row.pr?.value}{row.pr?.value ? <span style={ppStyles.unitTextSmall}> {row.pr.unit}</span> : null}</td>
                              <td style={ppStyles.td}>{row.rr?.value}{row.rr?.value ? <span style={ppStyles.unitTextSmall}> {row.rr.unit}</span> : null}</td>
                              <td style={ppStyles.td}>{row.temp?.value}{row.temp?.value ? <span style={ppStyles.unitTextSmall}> {row.temp.unit}</span> : null}</td>
                              <td style={ppStyles.td}>{row.spo2?.value}{row.spo2?.value ? <span style={ppStyles.unitTextSmall}> {row.spo2.unit}</span> : null}</td>
                              <td style={ppStyles.td}>{calcBMI(row.weight, row.height) || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          )}

          {tab === "vaccinations" && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <button style={ppStyles.handwrittenBtn} onClick={() => setPrintingVaccination(true)}><Printer size={15} style={{ marginRight: 6 }} />Print vaccination history</button>
              </div>
              <PatientVaccinationEditor schedule={vaxSchedule} setSchedule={setVaxSchedule} editable={isDoctor} />
            </div>
          )}

          {tab === "history" && (
            <div style={ppStyles.historyList}>
              {history.length === 0 && <div style={ppStyles.lockedNote}>No visit history yet for this patient.</div>}
              {history.map((h, i) => (
                <div key={i} style={ppStyles.historyRow}>
                  <div style={{ ...ppStyles.historyIcon, background: h.type === "IPD" ? "#FFF3E9" : "#E7EFEC" }}>
                    {h.type === "IPD" ? <BedDouble size={15} color="#B7591F" /> : <FileText size={15} color="#0B3B36" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {h.type === "IPD" ? (
                      <>
                        <div style={ppStyles.historyTop}><span style={ppStyles.historyType}>IPD</span><span style={ppStyles.historyDate}>{h.admitDate} → {h.dischargeDate}</span></div>
                        <div style={ppStyles.historyDoctor}>{h.doctor} · {h.room}{h.fileNumber && <span style={ppStyles.historyFileTag}>File: {h.fileNumber}</span>}</div>
                        {h.summary && <div style={ppStyles.historySummary}>{h.summary}</div>}
                      </>
                    ) : (
                      <>
                        <div style={ppStyles.historyTop}><span style={ppStyles.historyType}>{h.type}</span><span style={ppStyles.historyDate}>{h.date}</span></div>
                        <div style={ppStyles.historyDoctor}>{h.doctor}{h.bookedDoctor && h.consultingDoctor && h.bookedDoctor !== h.consultingDoctor && <span style={ppStyles.crossCoverageTag}>Cross-coverage</span>}</div>
                        <div style={ppStyles.historyDetail}>
                          {h.diagnosis}
                          {h.hasPrescription && <span style={ppStyles.rxLink} onClick={() => setViewingRx(h)} role="button" tabIndex={0}>View prescription <ChevronRight size={12} style={{ verticalAlign: -2 }} /></span>}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "prescription" && isDoctor && (
            <div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={{ ...ppStyles.newRxBtn, flex: 1, minWidth: 160 }} onClick={() => { setFollowUpSource(null); setCreatingRx(true); }}><Plus size={15} style={{ marginRight: 6 }} />New consultation</button>
                {prescriptionEntries.length > 0 && (
                  <button style={ppStyles.followUpBtn} onClick={() => { setFollowUpSource(prescriptionEntries[0].prescription); setCreatingRx(true); }}><HistoryIcon size={15} style={{ marginRight: 6 }} />Follow-up</button>
                )}
                <button style={ppStyles.handwrittenBtn} onClick={() => setPrintingHandwritten(true)}><Printer size={15} style={{ marginRight: 6 }} />Handwritten sheet</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                {prescriptionEntries.length === 0 && <div style={ppStyles.lockedNote}>No prescriptions recorded yet.</div>}
                {prescriptionEntries.map((h, i) => (
                  <div key={i} style={ppStyles.rxListRow}>
                    <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setViewingRx(h)}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1B2320" }}>{h.diagnosis}</div>
                      <div style={{ fontSize: 12, color: "#7A8380", marginTop: 2 }}>{h.date} · Consulted by {h.consultingDoctor || h.doctor}{h.bookedDoctor && h.consultingDoctor && h.bookedDoctor !== h.consultingDoctor && <span style={ppStyles.crossCoverageTag}>booked for {h.bookedDoctor}</span>}</div>
                    </div>
                    <button style={ppStyles.followUpInlineBtn} onClick={(e) => { e.stopPropagation(); setFollowUpSource(h.prescription); setCreatingRx(true); }}>Follow-up from this</button>
                    <ChevronRight size={15} color="#B0B5B1" onClick={() => setViewingRx(h)} style={{ cursor: "pointer" }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditField({ label, value, onChange, type = "text" }) {
  return <label style={ppStyles.editLabel}>{label}<input style={ppStyles.editInput} type={type} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
function InfoRow({ icon, label, value }) {
  return <div style={ppStyles.infoRow}><div style={ppStyles.infoIcon}>{icon}</div><div><div style={ppStyles.infoLabel}>{label}</div><div style={ppStyles.infoValue}>{value}</div></div></div>;
}

/* ============================================================================
   NEW CONSULTATION FORM (doctor-only) — adapted from OPD Consultation,
   with booked-doctor vs consulting-doctor tracking for cross-coverage.
   ========================================================================== */
const initialLists = {
  complaint: ["Fever", "Fatigue", "Cough", "Cold", "Vomiting", "Loose motions", "Abdominal pain", "Poor feeding", "Rash"],
  finding: ["Throat congested", "Chest clear", "Bilateral crepitations", "Dehydration", "Abdomen soft", "Rash present"],
  diagnosis: ["Viral fever", "URTI", "Acute gastroenteritis", "Bronchiolitis", "Teething", "Routine check-up"],
  investigation: ["CBC", "CRP", "Urine routine", "Chest X-ray", "Blood culture", "Stool routine", "Dengue NS1"],
  investigationPanels: [],
  medication: ["Paracetamol syrup", "Amoxicillin syrup", "ORS", "Zinc syrup", "Cetirizine syrup", "Domperidone syrup"],
  frequency: ["SOS (as needed)", "Before food", "After food", "At bedtime", "Every 6 hours", "Every 8 hours", "Every 12 hours"],
  instruction: ["Plenty of fluids", "Adequate rest", "Avoid oily food", "Steam inhalation", "Complete the full course"],
  referral: [],
  consultationTemplates: [],
};

// Doctor-configured weight-dose presets. No medical doses are hard-coded here.
// The doctor enters the volume dose in mL/kg, the product strength, frequency and duration.
// Selecting that medicine then uses today's recorded weight to calculate the volume in mL
// and pre-fills the configured frequency/days. No medical dose recommendations are built in.
// Example shape: { name: "Example syrup", doseMlKg: 0.5, strength: "250 mg/5 mL", frequency: "3", days: "5" }
function findWeightDoseRule(name, rules) {
  const q = String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!q) return null;
  const normalized = (rules || []).map((rule) => ({ rule, n: String(rule?.name || "").trim().replace(/\s+/g, " ").toLowerCase() })).filter((x) => x.n);
  return normalized.find((x) => x.n === q)?.rule || normalized.find((x) => q.includes(x.n) || x.n.includes(q))?.rule || null;
}

function calculatePresetMl(rule, weightKg) {
  const weight = Number(weightKg);
  const doseMlKg = Number(rule?.doseMlKg);
  if (!rule || !Number.isFinite(weight) || weight <= 0 || !Number.isFinite(doseMlKg) || doseMlKg <= 0) return "";
  const ml = weight * doseMlKg;
  return String(Math.round(ml * 10) / 10);
}

const frequencyOptions = [
  { key: "1", label: "Once a day (OD)" }, { key: "2", label: "Twice a day (BD)" },
  { key: "3", label: "Thrice a day (TDS)" }, { key: "4", label: "4 times a day (QID)" },
];
const customFrequencyKey = "CUSTOM";

function parseListForCopy(str) {
  if (!str) return [];
  return str.split(",").map((s) => s.trim()).filter(Boolean);
}
function parseComplaintsForCopy(str) {
  if (!str) return [];
  return str.split(",").map((s) => s.trim()).filter(Boolean).map((item) => {
    const m = item.match(/^(.*)\s\(([^)]+)\)$/);
    if (m) {
      const name = m[1].trim(), durPart = m[2].trim();
      const durMatch = durPart.match(/^(\d+)\s+(Days|Weeks|Months|Years)$/i);
      if (durMatch) return { name, durationValue: durMatch[1], durationUnit: durMatch[2], manualDuration: "" };
      return { name, durationValue: "", durationUnit: "Days", manualDuration: durPart };
    }
    return { name: item, durationValue: "", durationUnit: "Days", manualDuration: "" };
  });
}
function parseMedicationsForCopy(meds) {
  if (!meds || !meds.length) return [];
  return meds.map((m) => ({
    name: m.name, dosage: m.dosage || "", doseUnit: inferDoseUnit(m.dosage),
    frequency: frequencyOptions.find((f) => f.label === m.frequency)?.key || (m.frequency ? customFrequencyKey : "1"),
    customFrequency: frequencyOptions.some((f) => f.label === m.frequency) ? "" : (m.frequency || ""),
    durationDays: m.days || "", remark: m.remark || "", strength: m.strength || "",
  }));
}

function NewConsultationForm({ patient, session, onCancel, onSave, copyFrom, doctorNames, quickPickLists, setQuickPickLists, vitalsHistory }) {
  const lists = quickPickLists || initialLists;
  const [bookedDoctor, setBookedDoctor] = useState(session.name);
  const [pastHistory, setPastHistory] = useState(() => copyFrom?.pastHistory || "");
  const [complaints, setComplaints] = useState(() => (copyFrom ? parseComplaintsForCopy(copyFrom.complaints) : []));
  const [findings, setFindings] = useState(() => (copyFrom ? parseListForCopy(copyFrom.findings) : []));
  const [diagnoses, setDiagnoses] = useState(() => (copyFrom ? parseListForCopy(copyFrom.diagnosis) : []));
  const [investigations, setInvestigations] = useState(() => (copyFrom ? parseListForCopy(copyFrom.investigations) : []));
  const [medications, setMedications] = useState(() => (copyFrom ? parseMedicationsForCopy(copyFrom.medications) : []));
  const [instructions, setInstructions] = useState(() => (copyFrom ? parseListForCopy(copyFrom.instructions) : []));
  const [panelName, setPanelName] = useState("");
  const [panelTests, setPanelTests] = useState([]);
  const [showPanelBuilder, setShowPanelBuilder] = useState(false);
  const [referral, setReferral] = useState(() => copyFrom?.referral || { name: "", phone: "" });
  const [followUps, setFollowUps] = useState(() => {
    if (!copyFrom?.followUp) return [];
    return copyFrom.followUp.split(" | ").map((x) => { const [date, ...reason] = x.split(" — "); return { date: date || "", reason: reason.join(" — ") }; });
  });
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpReason, setFollowUpReason] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [editingTemplateName, setEditingTemplateName] = useState("");
  const [showTemplateManager, setShowTemplateManager] = useState(true);

  const todaysWeightRow = (vitalsHistory || []).find((v) => v.dateLabel === indiaDateLabel());
  const todaysWeight = Number(todaysWeightRow?.weight?.value ?? todaysWeightRow?.weight);
  const dosePresets = lists.medicationDosePresets || [];

  const crossCoverage = bookedDoctor !== session.name;

  function addToMasterList(field, value) {
    const cleanValue = value.trim();
    if (!cleanValue || !setQuickPickLists) return;
    const exists = (lists[field] || []).some((o) => o.toLowerCase() === cleanValue.toLowerCase());
    if (exists) return;
    setQuickPickLists((prev) => ({ ...prev, [field]: [...(prev[field] || []), cleanValue] }));
    supabase.from("quick_pick_lists").select("items").eq("field", field).maybeSingle().then(({ data }) => {
      const items = data?.items?.some((o) => o.toLowerCase() === cleanValue.toLowerCase()) ? data.items : [...(data?.items || []), cleanValue];
      supabase.from("quick_pick_lists").upsert({ field, items }, { onConflict: "field" }).then(({ error }) => { if (error) console.error("Failed to save quick-pick item", error); });
    });
  }

  function templateSnapshot() {
    return {
      pastHistory,
      complaints: complaints.map((c) => ({ ...c })),
      findings: [...findings],
      diagnosis: [...diagnoses],
      investigations: [...investigations],
      medications: medications.map((m) => ({ ...m })),
      instructions: [...instructions],
      referral: referral ? { ...referral } : { name: "", phone: "" },
      followUps: followUps.map((f) => ({ ...f })),
    };
  }

  function applyTemplate(template) {
    if (!template) return;
    const data = template.data || template;
    setPastHistory(data.pastHistory || "");
    setComplaints((data.complaints || []).map((c) => ({ ...c })));
    setFindings([...(data.findings || [])]);
    setDiagnoses([...(data.diagnosis || data.diagnoses || [])]);
    setInvestigations([...(data.investigations || [])]);
    setMedications((data.medications || []).map((m) => {
      const rule = findWeightDoseRule(m.name, dosePresets);
      const ml = calculatePresetMl(rule, todaysWeight);
      return {
        ...m,
        ...(rule ? {
          dosage: ml || m.dosage || "",
          doseUnit: "ml",
          strength: rule.strength || m.strength || "",
          frequency: rule.frequency || m.frequency || "1",
          durationDays: rule.days || m.durationDays || "",
          doseRuleKey: rule.name || ""
        } : {})
      };
    }));
    setInstructions([...(data.instructions || [])]);
    setReferral(data.referral ? { ...data.referral } : { name: "", phone: "" });
    setFollowUps((data.followUps || []).map((f) => ({ ...f })));
  }

  function persistTemplates(next) {
    if (!setQuickPickLists) return;
    setQuickPickLists((prev) => ({ ...prev, consultationTemplates: next }));
    supabase.from("quick_pick_lists").upsert({ field: "consultationTemplates", items: next }, { onConflict: "field" })
      .then(({ error }) => { if (error) console.error("Failed to save consultation template", error); });
  }

  function saveConsultationTemplate() {
    const name = templateName.trim();
    if (!name) return;
    const existing = lists.consultationTemplates || [];
    const withoutName = existing.filter((t) => String(t.name || "").toLowerCase() !== name.toLowerCase());
    persistTemplates([...withoutName, { name, data: templateSnapshot(), updatedAt: new Date().toISOString() }]);
    setTemplateName("");
    setEditingTemplateName("");
  }

  function editConsultationTemplate(template) {
    if (!template) return;
    applyTemplate(template);
    setEditingTemplateName(template.name || "");
    setTemplateName(template.name || "");
    setShowTemplateManager(true);
  }

  function deleteConsultationTemplate(name) {
    const next = (lists.consultationTemplates || []).filter((t) => t.name !== name);
    persistTemplates(next);
    if (editingTemplateName === name) { setEditingTemplateName(""); setTemplateName(""); }
  }

  function handleSave() {
    const record = {
      date: indiaDateLabel(),
      createdAt: new Date().toISOString(),
      bookedDoctor, consultingDoctor: session.name, consultingDoctorId: session.username,
      pastHistory: pastHistory.trim(),
      complaints: complaints.map((c) => c.manualDuration ? `${c.name} (${c.manualDuration})` : c.durationValue ? `${c.name} (${c.durationValue} ${c.durationUnit})` : c.name).join(", "),
      findings: findings.join(", "), diagnosis: diagnoses.join(", "),
      medications: medications.map((m) => ({ name: m.name, strength: m.strength || (findWeightDoseRule(m.name, dosePresets)?.strength || ""), dosage: m.dosage ? `${m.dosage}${m.doseUnit ? ` ${m.doseUnit}` : ""}`.trim() : "", frequency: m.frequency === customFrequencyKey ? (m.customFrequency || "Custom frequency") : (frequencyOptions.find((f) => f.key === m.frequency)?.label || m.frequency), days: m.durationDays, remark: m.remark || "" })),
      investigations: investigations.join(", "), instructions: instructions.join(", "),
      followUp: followUps.map((f) => `${f.date}${f.reason ? ` — ${f.reason}` : ""}`).join(" | "),
      referral: referral?.name ? { name: referral.name, phone: referral.phone || "" } : null,
    };
    onSave(record);
  }

  return (
    <div style={consultStyles.page}>
      <div style={consultStyles.card}>
        <button style={ppStyles.backBtnPlain} onClick={onCancel}>← Back to profile</button>
        <div style={consultStyles.header}>
          <div style={consultStyles.iconBadge}><Stethoscope size={20} color="#0B3B36" /></div>
          <div><div style={consultStyles.eyebrow}>{copyFrom ? "FOLLOW-UP CONSULTATION" : "NEW CONSULTATION"}</div><h1 style={consultStyles.h1}>{patient.name} <span style={consultStyles.idTag}>{patient.id}</span></h1></div>
        </div>

        {copyFrom && (
          <div style={consultStyles.followUpBanner}>
            <HistoryIcon size={15} color="#1D5A96" style={{ flexShrink: 0 }} />
            <span>Pre-filled from a previous consultation ({copyFrom.date}). Review and adjust before saving — nothing has been saved yet.</span>
          </div>
        )}

        <div style={{ margin: "12px 0 16px", padding: 14, border: "2px solid #B8D8CC", borderRadius: 12, background: "#F5FAF7" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <b style={{ fontSize: 13, color: "#173E37" }}>Saved consultation templates</b>
            <select style={{ ...consultStyles.input, flex: 1, minWidth: 180 }} defaultValue="" onChange={(e) => { const t = (lists.consultationTemplates || []).find((x) => x.name === e.target.value); if (t) applyTemplate(t); }}>
              <option value="">Select template…</option>
              {(lists.consultationTemplates || []).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
            <button type="button" style={{ ...consultStyles.freqChip, ...consultStyles.freqChipActive, fontWeight: 800 }} onClick={() => setShowTemplateManager((v) => !v)}>📋 {showTemplateManager ? "Hide templates" : "Consultation templates"}</button>
          </div>
          {showTemplateManager && <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input style={{ ...consultStyles.input, flex: 1, minWidth: 180 }} value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Template name e.g. Viral fever" />
              <button type="button" style={{ ...consultStyles.freqChip, ...consultStyles.freqChipActive }} onClick={saveConsultationTemplate}>{editingTemplateName ? "Update template" : "Save template"}</button>
              {editingTemplateName && <button type="button" style={consultStyles.freqChip} onClick={() => { setEditingTemplateName(""); setTemplateName(""); }}>Cancel edit</button>}
            </div>
            {(lists.consultationTemplates || []).length > 0 && <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
              {(lists.consultationTemplates || []).map((t) => <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, padding: "6px 8px", background: "#fff", borderRadius: 7, border: "1px solid #E3EAE6" }}>
                <span style={{ flex: 1, fontWeight: 600 }}>{t.name}</span>
                <button type="button" style={consultStyles.freqChip} onClick={() => editConsultationTemplate(t)}>Edit</button>
                <button type="button" style={{ ...consultStyles.freqChip, color: "#8A2D2D" }} onClick={() => deleteConsultationTemplate(t.name)}>Delete</button>
              </div>)}
            </div>}
          </div>}
        </div>

        <FieldBlock icon={<Stethoscope size={14} />} label="Booked doctor">
          <select style={consultStyles.input} value={bookedDoctor} onChange={(e) => setBookedDoctor(e.target.value)}>{(doctorNames || []).map((d) => <option key={d} value={d}>{d}</option>)}</select>
        </FieldBlock>
        {crossCoverage && (
          <div style={consultStyles.crossCoverageBanner}>
            <AlertTriangle size={15} color="#9B2C2C" style={{ flexShrink: 0 }} />
            <span>Booked for <b>{bookedDoctor}</b>, consultation completed by <b>{session.name}</b>. Both are recorded for the audit log.</span>
          </div>
        )}

        <FieldBlock icon={<HistoryIcon size={14} />} label="Past history">
          <textarea
            style={{ ...consultStyles.input, minHeight: 90, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
            value={pastHistory}
            onChange={(e) => setPastHistory(e.target.value)}
            placeholder="Type past medical history, previous illness, surgery, allergy, long-term medication, relevant family history, etc."
          />
          <div style={{ fontSize: 11, color: "#8A928F", marginTop: 5 }}>Free text — no predefined list or length limit.</div>
        </FieldBlock>

        <FieldBlock icon={<ClipboardList size={14} />} label="Chief complaint">
          <Autocomplete options={lists.complaint} excluded={complaints.map((c) => c.name)} placeholder="Type to search or add…"
            onSelect={(name) => setComplaints((prev) => [...prev, { name, durationValue: "", durationUnit: "Days", manualDuration: "" }])}
            onAddNew={(name) => { addToMasterList("complaint", name); setComplaints((prev) => [...prev, { name, durationValue: "", durationUnit: "Days", manualDuration: "" }]); }} />
          <div style={consultStyles.selectedStack}>
            {complaints.map((c, i) => (
              <div key={i} style={consultStyles.complaintRow}>
                <span style={consultStyles.complaintName}>{c.name}</span>
                <input type="number" min="0" value={c.durationValue} onChange={(e) => setComplaints((p) => p.map((x, xi) => (xi === i ? { ...x, durationValue: e.target.value } : x)))} placeholder="e.g. 2" style={consultStyles.durationNumInput} />
                <select value={c.durationUnit} onChange={(e) => setComplaints((p) => p.map((x, xi) => (xi === i ? { ...x, durationUnit: e.target.value } : x)))} style={consultStyles.durationUnitSelect}>{["Days", "Weeks", "Months", "Years"].map((u) => <option key={u} value={u}>{u}</option>)}</select>
                <button type="button" onClick={() => setComplaints((p) => p.filter((_, xi) => xi !== i))} style={consultStyles.removeRowBtn}><X size={13} /></button>
              </div>
            ))}
          </div>
        </FieldBlock>

        <FieldBlock icon={<ClipboardList size={14} />} label="Findings (on examination)">
          <Autocomplete options={lists.finding || []} excluded={findings} placeholder="Type to search or add…"
            onSelect={(name) => setFindings((p) => [...p, name])}
            onAddNew={(name) => { addToMasterList("finding", name); setFindings((p) => [...p, name]); }} />
          <TagList items={findings} onRemove={(name) => setFindings((p) => p.filter((d) => d !== name))} />
        </FieldBlock>

        <FieldBlock icon={<ClipboardList size={14} />} label="Diagnosis">
          <Autocomplete options={lists.diagnosis} excluded={diagnoses} placeholder="Type to search or add…" onSelect={(name) => setDiagnoses((p) => [...p, name])} onAddNew={(name) => { addToMasterList("diagnosis", name); setDiagnoses((p) => [...p, name]); }} />
          <TagList items={diagnoses} onRemove={(name) => setDiagnoses((p) => p.filter((d) => d !== name))} />
        </FieldBlock>

        <FieldBlock icon={<FlaskConical size={14} />} label="Investigations advised">
          {(lists.investigationPanels || []).length > 0 && (
            <div style={consultStyles.panelList}>
              <div style={consultStyles.panelHint}>Saved panels</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(lists.investigationPanels || []).map((panel) => (
                  <button key={panel.name} type="button" style={consultStyles.freqChip} onClick={() => setInvestigations((p) => [...p, ...(panel.tests || []).filter((t) => !p.includes(t))])} title={(panel.tests || []).join(", ")}>{panel.name}</button>
                ))}
              </div>
            </div>
          )}
          <Autocomplete options={lists.investigation || []} excluded={investigations} placeholder="Type to search or add investigation…" onSelect={(name) => setInvestigations((p) => [...p, name])} onAddNew={(name) => { addToMasterList("investigation", name); setInvestigations((p) => [...p, name]); }} />
          <TagList items={investigations} onRemove={(name) => setInvestigations((p) => p.filter((d) => d !== name))} />
          <div style={{ marginTop: 12 }}>
            <button type="button" style={consultStyles.freqChip} onClick={() => setShowPanelBuilder((v) => !v)}>{showPanelBuilder ? "Close panel creator" : "Create investigation panel"}</button>
            {showPanelBuilder && <div style={consultStyles.panelBuilder}>
              <div style={consultStyles.panelTitle}>Create investigation panel</div>
              <input value={panelName} onChange={(e) => setPanelName(e.target.value)} placeholder="Panel name e.g. Fever panel" style={consultStyles.input} />
              <div style={consultStyles.panelHint}>Select tests to include in this panel</div>
              <div style={consultStyles.panelTestList}>
                {(lists.investigation || []).map((test) => { const selected = panelTests.includes(test); return <button key={test} type="button" onClick={() => setPanelTests((p) => selected ? p.filter((x) => x !== test) : [...p, test])} style={{ ...consultStyles.freqChip, ...(selected ? consultStyles.freqChipActive : {}) }}>{test}</button>; })}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" style={consultStyles.freqChip} onClick={() => { setPanelName(""); setPanelTests([]); }}>Clear</button>
                <button type="button" style={{ ...consultStyles.freqChip, ...consultStyles.freqChipActive }} onClick={() => { const name = panelName.trim(); const tests = [...new Set(panelTests.map((t) => t.trim()).filter(Boolean))]; if (!name || !tests.length) return; const existing = lists.investigationPanels || []; const next = [...existing.filter((p) => p.name.toLowerCase() !== name.toLowerCase()), { name, tests }]; setQuickPickLists?.((prev) => ({ ...prev, investigationPanels: next })); supabase.from("quick_pick_lists").upsert({ field: "investigationPanels", items: next }, { onConflict: "field" }).then(({ error }) => { if (error) console.error("Failed to save investigation panel", error); }); setPanelName(""); setPanelTests([]); setShowPanelBuilder(false); }}>Save panel</button>
              </div>
            </div>}
          </div>
        </FieldBlock>

        <FieldBlock icon={<Pill size={14} />} label="Medications">
          <Autocomplete options={lists.medication} excluded={medications.map((m) => m.name)} placeholder="Type to search or add…"
            onSelect={(name) => {
              const rule = findWeightDoseRule(name, dosePresets);
              const ml = calculatePresetMl(rule, todaysWeight);
              setMedications((p) => [...p, { name, frequency: rule?.frequency || "1", durationDays: rule?.days || "", doseUnit: "ml", dosage: ml, strength: rule?.strength || "", doseRuleKey: rule?.name || "" }]);
            }}
            onAddNew={(name) => {
              addToMasterList("medication", name);
              const rule = findWeightDoseRule(name, dosePresets);
              const ml = calculatePresetMl(rule, todaysWeight);
              setMedications((p) => [...p, { name, frequency: rule?.frequency || "1", durationDays: rule?.days || "", doseUnit: "ml", dosage: ml, strength: rule?.strength || "", doseRuleKey: rule?.name || "" }]);
            }} />
          <div style={consultStyles.selectedStack}>
            {medications.map((m, i) => (
              <div key={i} style={consultStyles.medicationCard}>
                <div style={consultStyles.medicationTopRow}><div style={{ flex: 1, marginRight: 8 }}><input list={`new-med-options-${i}`} value={m.name} onChange={(e) => {
                  const name = e.target.value;
                  const rule = findWeightDoseRule(name, dosePresets);
                  const ml = calculatePresetMl(rule, todaysWeight);
                  setMedications((p) => p.map((x, xi) => xi === i ? { ...x, name, doseRuleKey: rule?.name || "", ...(rule ? { dosage: ml, doseUnit: "ml", strength: rule.strength || "", frequency: rule.frequency || "1", durationDays: rule.days || "" } : {}) } : x));
                }} onBlur={() => { if (m.name?.trim()) addToMasterList("medication", m.name); }} style={{ ...consultStyles.medExtraInput, width: "100%" }} placeholder="Medicine name" /><datalist id={`new-med-options-${i}`}>{(lists.medication || []).map((name) => <option key={name} value={name} />)}</datalist></div><button type="button" onClick={() => setMedications((p) => p.filter((_, xi) => xi !== i))} style={consultStyles.removeRowBtn}><X size={13} /></button></div>
                <div style={consultStyles.freqChipRow}>{frequencyOptions.map((f) => <button key={f.key} type="button" onClick={() => setMedications((p) => p.map((x, xi) => (xi === i ? { ...x, frequency: f.key, customFrequency: "" } : x)))} style={{ ...consultStyles.freqChip, ...(m.frequency === f.key ? consultStyles.freqChipActive : {}) }}>{f.label}</button>)}<button type="button" onClick={() => setMedications((p) => p.map((x, xi) => (xi === i ? { ...x, frequency: customFrequencyKey } : x)))} style={{ ...consultStyles.freqChip, ...(m.frequency === customFrequencyKey ? consultStyles.freqChipActive : {}) }}>Other / Custom</button></div>
                {m.frequency === customFrequencyKey && <><Autocomplete options={lists.frequency || []} excluded={[]} placeholder="Type or select frequency (reusable)…" onSelect={(value) => setMedications((p) => p.map((x, xi) => (xi === i ? { ...x, customFrequency: value } : x)))} onAddNew={(value) => { addToMasterList("frequency", value); setMedications((p) => p.map((x, xi) => (xi === i ? { ...x, customFrequency: value } : x))); }} />}{m.customFrequency && <div style={{ fontSize: 12, marginTop: 6, color: "#0B3B36", fontWeight: 700 }}>Selected frequency: {m.customFrequency}</div>}</>}
                {findWeightDoseRule(m.name, dosePresets) && (
                  <div style={{ marginTop: 7, padding: "7px 9px", borderRadius: 8, background: "#F4F8F6", border: "1px solid #D9E5DF", fontSize: 11.5, color: "#38504A" }}>
                    {(() => { const rule = findWeightDoseRule(m.name, dosePresets); const ml = calculatePresetMl(rule, todaysWeight); return todaysWeight > 0 && ml ? <>Today's weight: <b>{todaysWeight} kg</b> · Preset dose: <b>{rule.doseMlKg} mL/kg</b> · Strength: <b>{rule.strength || "—"}</b> · Volume: <b>{ml} mL</b> · {(frequencyOptions.find((f) => f.key === rule.frequency)?.label || rule.frequency)} · {rule.days || "—"} days</> : <b>Today's weight is required for automatic mL calculation.</b>; })()}
                  </div>
                )}
                <div style={consultStyles.medExtraRow}>
                  <input value={m.dosage || ""} onChange={(e) => setMedications((p) => p.map((x, xi) => (xi === i ? { ...x, dosage: e.target.value } : x)))} placeholder="Amount e.g. 5" style={consultStyles.medExtraInput} /><select value={m.doseUnit || "ml"} onChange={(e) => setMedications((p) => p.map((x, xi) => (xi === i ? { ...x, doseUnit: e.target.value } : x)))} style={consultStyles.durationUnitSelect}><option value="tab">Tab</option><option value="ml">ml</option><option value="drops">Drops</option></select>
                  {!(m.frequency === customFrequencyKey && m.customFrequency === "SOS (as needed)") && <><span style={consultStyles.forLabel}>for</span><input type="number" min="0" value={m.durationDays} onChange={(e) => setMedications((p) => p.map((x, xi) => (xi === i ? { ...x, durationDays: e.target.value } : x)))} placeholder="e.g. 5" style={consultStyles.durationNumInput} /><span style={consultStyles.forLabel}>days</span></>}
                </div>
                <input value={m.remark || ""} onChange={(e) => setMedications((p) => p.map((x, xi) => (xi === i ? { ...x, remark: e.target.value } : x)))} placeholder="Remark e.g. After food, At bedtime" style={{ ...consultStyles.medExtraInput, width: "100%", marginTop: 6, boxSizing: "border-box" }} />
              </div>
            ))}
          </div>
        </FieldBlock>

        <FieldBlock icon={<MessageSquareText size={14} />} label="Instructions">
          <Autocomplete options={lists.instruction} excluded={instructions} placeholder="Type to search or add…" onSelect={(name) => setInstructions((p) => [...p, name])} onAddNew={(name) => { addToMasterList("instruction", name); setInstructions((p) => [...p, name]); }} />
          <TagList items={instructions} onRemove={(name) => setInstructions((p) => p.filter((d) => d !== name))} />
        </FieldBlock>

        <FieldBlock icon={<UserPlus2 size={14} />} label="Refer to another doctor">
          <select style={consultStyles.input} value={referral?.name || ""} onChange={(e) => { const selected = (lists.referral || []).find((r) => r.name === e.target.value); setReferral(selected ? { name: selected.name, phone: selected.phone || "" } : { name: "", phone: "" }); }}>
            <option value="">Select saved referral</option>
            {(lists.referral || []).map((r) => <option key={`${r.name}-${r.phone || ""}`} value={r.name}>{r.name}{r.phone ? ` — ${r.phone}` : ""}</option>)}
          </select>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input style={consultStyles.input} value={referral?.name || ""} onChange={(e) => setReferral({ ...(referral || {}), name: e.target.value })} placeholder="Doctor name" />
            <input style={consultStyles.input} value={referral?.phone || ""} onChange={(e) => setReferral({ ...(referral || {}), phone: e.target.value })} placeholder="Phone number" />
            <button type="button" style={consultStyles.freqChip} onClick={() => { const name = referral?.name?.trim(); if (!name) return; const item = { name, phone: referral?.phone?.trim() || "" }; const next = [...(lists.referral || []).filter((r) => !(r.name.toLowerCase() === item.name.toLowerCase() && (r.phone || "") === item.phone)), item]; setQuickPickLists?.((prev) => ({ ...prev, referral: next })); supabase.from("quick_pick_lists").upsert({ field: "referral", items: next }, { onConflict: "field" }).then(({ error }) => { if (error) console.error("Failed to save referral", error); }); }}>Save</button>
          </div>
        </FieldBlock>

        <FieldBlock icon={<Calendar size={14} />} label="Follow-up dates">
          <div style={consultStyles.followUpRow}>
            <input style={{ ...consultStyles.input, maxWidth: 170 }} type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
            <input style={consultStyles.input} value={followUpReason} onChange={(e) => setFollowUpReason(e.target.value)} placeholder="Reason (optional)" />
            <button type="button" style={consultStyles.freqChip} onClick={() => { if (!followUpDate) return; setFollowUps((p) => [...p, { date: followUpDate, reason: followUpReason }]); setFollowUpDate(""); setFollowUpReason(""); }}>Add date</button>
          </div>
          {followUps.map((f, i) => <div key={`${f.date}-${i}`} style={{ ...consultStyles.complaintRow, marginTop: 6 }}><span style={consultStyles.complaintName}>{f.date}</span><span style={{ fontSize: 12, color: "#66706C", flex: 1 }}>{f.reason || "Follow-up"}</span><button type="button" onClick={() => setFollowUps((p) => p.filter((_, xi) => xi !== i))} style={consultStyles.removeRowBtn}><X size={13} /></button></div>)}
        </FieldBlock>

        <button style={consultStyles.saveBtn} onClick={handleSave}>Save consultation</button>
      </div>
    </div>
  );
}

function Autocomplete({ options, excluded = [], placeholder, onSelect, onAddNew }) {
  const [query, setQuery] = useState(""); const [open, setOpen] = useState(false); const wrapRef = useRef(null);
  useEffect(() => { function h(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); } document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const available = options.filter((o) => !excluded.includes(o));
  const q = query.trim().toLowerCase();
  const queryWords = q.split(/\s+/).filter(Boolean);
  const matches = q ? available.filter((o) => {
    const value = String(o).toLowerCase();
    if (value.startsWith(q)) return true;
    return queryWords.every((word) => value.includes(word));
  }) : [];
  const exactExists = available.some((o) => o.toLowerCase() === q);
  function selectOption(name) { onSelect(name); setQuery(""); setOpen(false); }
  function addNew() { const name = query.trim(); if (!name) return; onAddNew(name); setQuery(""); setOpen(false); }
  return (
    <div style={consultStyles.autocompleteWrap} ref={wrapRef}>
      <input style={consultStyles.input} value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (matches.length > 0) selectOption(matches[0]); else if (q && !exactExists) addNew(); } }} />
      {open && (query.length > 0 || matches.length > 0) && (
        <div style={consultStyles.dropdown}>
          {matches.slice(0, 6).map((m) => <div key={m} style={consultStyles.dropdownItem} onClick={() => selectOption(m)}>{m}</div>)}
          {q && !exactExists && <div style={consultStyles.dropdownAddNew} onClick={addNew}><Plus size={13} style={{ marginRight: 6 }} />Add "{query.trim()}" to list</div>}
        </div>
      )}
    </div>
  );
}
function TagList({ items, onRemove }) {
  if (items.length === 0) return null;
  return <div style={consultStyles.selectedList}>{items.map((item) => <span key={item} style={consultStyles.selectedTag}>{item}<button type="button" onClick={() => onRemove(item)} style={consultStyles.removeTagBtn}><X size={11} /></button></span>)}</div>;
}
function FieldBlock({ icon, label, children }) {
  return <div style={consultStyles.fieldBlock}><div style={consultStyles.labelRow}>{icon}<span style={consultStyles.labelText}>{label}</span></div>{children}</div>;
}

const consultStyles = {
  page: { minHeight: "100vh", background: "#F6F5F1", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", padding: "24px 16px", boxSizing: "border-box", display: "flex", justifyContent: "center" },
  card: { width: "100%", maxWidth: 600, background: "#fff", border: "1px solid #E8E6DF", borderRadius: 14, padding: 26, boxSizing: "border-box" },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 18 },
  iconBadge: { width: 40, height: 40, borderRadius: 10, background: "#E7EFEC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#0B3B36", marginBottom: 3 },
  h1: { fontSize: 17.5, fontWeight: 700, color: "#1B2320", margin: 0, display: "flex", alignItems: "center", gap: 8 },
  idTag: { fontSize: 11.5, fontWeight: 600, color: "#8A928F", background: "#F1F1EF", padding: "2px 8px", borderRadius: 20 },
  crossCoverageBanner: { display: "flex", gap: 8, alignItems: "flex-start", background: "#FDECEC", border: "1px solid #F5C6C6", color: "#9B2C2C", fontSize: 12.5, padding: "10px 12px", borderRadius: 8, marginBottom: 18, lineHeight: 1.5 },
  followUpBanner: { display: "flex", gap: 8, alignItems: "flex-start", background: "#E7F0FA", border: "1px solid #B8D4EF", color: "#1D5A96", fontSize: 12.5, padding: "10px 12px", borderRadius: 8, marginBottom: 18, lineHeight: 1.5 },
  fieldBlock: { marginBottom: 20 },
  labelRow: { display: "flex", alignItems: "center", gap: 6, color: "#0B3B36", marginBottom: 7 },
  labelText: { fontSize: 12.5, fontWeight: 700, color: "#3C4441" },
  input: { fontSize: 14, padding: "9px 11px", borderRadius: 8, border: "1px solid #DCD9D0", fontFamily: "inherit", color: "#1B2320", boxSizing: "border-box", width: "100%" },
  autocompleteWrap: { position: "relative" },
  dropdown: { position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #E8E6DF", borderRadius: 10, boxShadow: "0 4px 16px rgba(16,24,32,0.08)", zIndex: 10, overflow: "hidden", maxHeight: 220, overflowY: "auto" },
  dropdownItem: { padding: "9px 13px", fontSize: 13.5, color: "#1B2320", cursor: "pointer", borderBottom: "1px solid #F3F2EE" },
  dropdownAddNew: { display: "flex", alignItems: "center", padding: "9px 13px", fontSize: 13, fontWeight: 600, color: "#0B3B36", background: "#F6F5F1", cursor: "pointer" },
  selectedStack: { display: "flex", flexDirection: "column", gap: 8, marginTop: 10 },
  selectedList: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 },
  selectedTag: { display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#0B3B36", background: "#E7EFEC", borderRadius: 20, padding: "5px 6px 5px 11px" },
  removeTagBtn: { display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: "#0B3B36", cursor: "pointer", padding: 2 },
  complaintRow: { display: "flex", alignItems: "center", gap: 6, background: "#F6F5F1", border: "1px solid #EEECE5", borderRadius: 8, padding: "8px 10px", flexWrap: "wrap" },
  complaintName: { fontSize: 13, fontWeight: 700, color: "#1B2320", marginRight: 4 },
  durationNumInput: { width: 52, fontSize: 12.5, padding: "6px 8px", borderRadius: 6, border: "1px solid #DCD9D0", textAlign: "center", boxSizing: "border-box" },
  durationUnitSelect: { fontSize: 12.5, padding: "6px 8px", borderRadius: 6, border: "1px solid #DCD9D0", background: "#fff", color: "#3C4441" },
  removeRowBtn: { display: "flex", alignItems: "center", justifyContent: "center", background: "#FDECEC", border: "1px solid #F5C6C6", color: "#9B2C2C", borderRadius: 6, width: 24, height: 24, cursor: "pointer", flexShrink: 0, marginLeft: "auto" },
  medicationCard: { background: "#F6F5F1", border: "1px solid #EEECE5", borderRadius: 10, padding: "10px 12px" },
  medicationTopRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  freqChipRow: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  freqChip: { fontSize: 11.5, fontWeight: 600, color: "#5B635F", background: "#fff", border: "1px solid #DCD9D0", borderRadius: 20, padding: "5px 10px", cursor: "pointer" },
  freqChipActive: { background: "#0B3B36", border: "1px solid #0B3B36", color: "#fff" },
  panelBuilder: { marginTop: 12, padding: 10, background: "#F6F5F1", border: "1px solid #EEECE5", borderRadius: 10 },
  panelTitle: { fontSize: 12.5, fontWeight: 700, color: "#3C4441", marginBottom: 8 },
  panelHint: { fontSize: 11.5, color: "#66706C", margin: "8px 0 6px" },
  panelList: { marginBottom: 8 },
  panelTestList: { display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 150, overflowY: "auto", paddingRight: 2 },
  durationForRow: { display: "flex", alignItems: "center", gap: 8 },
  medExtraRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 6 },
  medExtraInput: { fontSize: 12.5, padding: "6px 9px", borderRadius: 6, border: "1px solid #DCD9D0", fontFamily: "inherit", boxSizing: "border-box", flex: 1 },
  forLabel: { fontSize: 12, color: "#5B635F", fontWeight: 500 },
  followUpRow: { display: "flex", gap: 10 },
  saveBtn: { width: "100%", background: "#0B3B36", color: "#fff", border: "none", borderRadius: 8, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" },
};

/* ============================================================================
   PRESCRIPTION VIEWER (view + light edit, printable)
   ========================================================================== */
const defaultPrintSettings = {
  marginTop: 15, marginBottom: 15, marginLeft: 15, marginRight: 15,
  includeClinicHeader: true,
  includeComplaints: true, includeFindings: true, includeDiagnosis: true,
  includeMedications: true, includeInvestigations: true, includeInstructions: true,
  includeVaccination: true, includeFollowUp: true, includeGrowthChart: false,
};

function PrescriptionViewer({ entry, patient, onBack, printSettings, vaxList, vitalsHistory, clinicDetails, quickPickLists, setQuickPickLists }) {
  const editLists = quickPickLists || initialLists;
  const ps = { ...defaultPrintSettings, ...(printSettings || {}) };
  const clinic = clinicDetails || { name: "Niramaya Clinic", address: "", phone: "" };
  const [editing, setEditing] = useState(false);
  const [rx, setRx] = useState(entry.prescription);
  const [draft, setDraft] = useState(entry.prescription);
  const [justSaved, setJustSaved] = useState(false);
  function handlePrint() { window.print(); }

  // Prefer the vitals entry recorded on the same day as this consultation;
  // fall back to the most recent vitals on file if none match exactly.
  const visitVitals = (() => {
    const hist = vitalsHistory || [];
    if (hist.length === 0) return null;
    const matchByDate = hist.find((row) => row.dateLabel === entry.date);
    return matchByDate || hist[0];
  })();

  return (
    <div style={ppStyles.page} className="rx-page-wrap">
      <div style={ppStyles.card} className="rx-card-print">
        <div style={ppStyles.rxViewerHeader} className="no-print">
          <button style={ppStyles.backBtnPlain} onClick={onBack}>← Back to prescription</button>
          {justSaved && <span style={{ fontSize: 12, color: "#0B3B36", fontWeight: 600, marginLeft: "auto" }}>✓ Prescription saved</span>}
          <button style={ppStyles.printRecordBtnDark} onClick={handlePrint}><Printer size={13} style={{ marginRight: 6 }} />Print Prescription</button>
        </div>
        {ps.includeClinicHeader && (
          <div style={ppStyles.rxClinicHeader}>
            <div style={ppStyles.rxClinicIcon}><Stethoscope size={20} color="#0B3B36" /></div>
            <div><div style={ppStyles.rxClinicName}>{clinic.name}</div><div style={ppStyles.rxClinicMeta}>{[clinic.address, clinic.phone].filter(Boolean).join(" · ")}</div></div>
          </div>
        )}
        <div style={ppStyles.rxViewerPatient}>
          <div style={ppStyles.rxViewerName}>{patient.name} <span style={ppStyles.idTag}>{patient.id}</span></div>
          <div style={ppStyles.rxViewerMeta}>{patient.sex}{patient.dob && ` · ${calcAge(patient.dob)}`} · {entry.date} · {entry.consultingDoctor || entry.doctor}</div>
          {entry.bookedDoctor && entry.consultingDoctor && entry.bookedDoctor !== entry.consultingDoctor && (
            <div style={ppStyles.crossCoverageBanner}>⚠ Appointment booked for {entry.bookedDoctor} · consultation completed by {entry.consultingDoctor}</div>
          )}
          {(() => {
            // Only print vitals that actually have a value — an empty "—" for
            // something never recorded (e.g. head circumference on an adult) just
            // wastes space and looks like a missed measurement rather than N/A.
            const enteredVitals = visitVitals ? [
              ["Wt", visitVitals.weight], ["Ht", visitVitals.height], ["Head circ.", visitVitals.headCirc],
              ["PR", visitVitals.pr], ["RR", visitVitals.rr], ["Temp", visitVitals.temp], ["SpO2", visitVitals.spo2],
            ].filter(([, v]) => v && v.value !== undefined && v.value !== null && v.value !== "") : [];
            return enteredVitals.length > 0 ? (
              <div style={ppStyles.rxVitalsRow}>
                {enteredVitals.map(([label, v]) => <span key={label}>{label}: {v.value} {v.unit || ""}</span>)}
              </div>
            ) : (
              <div style={ppStyles.rxVitalsMissing}>No vitals on record for this patient yet.</div>
            );
          })()}
        </div>
        <div style={ppStyles.divider} />
        {editing ? (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <RxField label="Past history" value={draft.pastHistory || ""} onChange={(v) => setDraft({ ...draft, pastHistory: v })} />
            <EditReusableField label="Complaints" value={draft.complaints} onChange={(v) => setDraft({ ...draft, complaints: v })} options={editLists.complaint || []} field="complaint" setQuickPickLists={setQuickPickLists} />
            <EditReusableField label="Findings" value={draft.findings} onChange={(v) => setDraft({ ...draft, findings: v })} options={editLists.finding || []} field="finding" setQuickPickLists={setQuickPickLists} />
            <EditReusableField label="Diagnosis" value={draft.diagnosis} onChange={(v) => setDraft({ ...draft, diagnosis: v })} options={editLists.diagnosis || []} field="diagnosis" setQuickPickLists={setQuickPickLists} />

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#3C4441", marginBottom: 8 }}>Medications</div>
              {(draft.medications || []).map((m, i) => (
                <div key={i} style={ppStyles.medEditRow}>
                  <input list={`edit-med-options-${i}`} style={{ ...ppStyles.editInput, flex: 2 }} value={m.name || ""} onChange={(e) => setDraft({ ...draft, medications: draft.medications.map((mm, mi) => (mi === i ? { ...mm, name: e.target.value } : mm)) })} onBlur={() => saveQuickPickItem("medication", m.name, editLists, setQuickPickLists)} placeholder="Medicine name" />
                  <datalist id={`edit-med-options-${i}`}>{(editLists.medication || []).map((name) => <option key={name} value={name} />)}</datalist>
                  <input style={{ ...ppStyles.editInput, width: 70 }} value={m.dosage || ""} onChange={(e) => setDraft({ ...draft, medications: draft.medications.map((mm, mi) => (mi === i ? { ...mm, dosage: e.target.value } : mm)) })} placeholder="Dose" />
                  <select style={{ ...ppStyles.editInput, width: 70 }} value={m.doseUnit || inferDoseUnit(m.dosage)} onChange={(e) => setDraft({ ...draft, medications: draft.medications.map((mm, mi) => (mi === i ? { ...mm, doseUnit: e.target.value } : mm)) })}><option value="tab">Tab</option><option value="ml">ml</option><option value="drops">Drops</option></select>
                  <input list={`edit-freq-options-${i}`} style={{ ...ppStyles.editInput, flex: 1 }} value={m.frequency || ""} onChange={(e) => setDraft({ ...draft, medications: draft.medications.map((mm, mi) => (mi === i ? { ...mm, frequency: e.target.value } : mm)) })} onBlur={() => saveQuickPickItem("frequency", m.frequency, editLists, setQuickPickLists)} placeholder="Frequency" />
                  <datalist id={`edit-freq-options-${i}`}>{[...frequencyOptions.map((f) => f.label), ...(editLists.frequency || [])].map((f) => <option key={f} value={f} />)}</datalist>
                  <input style={{ ...ppStyles.editInput, width: 55 }} value={m.days || ""} onChange={(e) => setDraft({ ...draft, medications: draft.medications.map((mm, mi) => (mi === i ? { ...mm, days: e.target.value } : mm)) })} placeholder="Days" />
                  <input style={{ ...ppStyles.editInput, flex: 1 }} value={m.remark || ""} onChange={(e) => setDraft({ ...draft, medications: draft.medications.map((mm, mi) => (mi === i ? { ...mm, remark: e.target.value } : mm)) })} placeholder="Remark" />
                  <button type="button" style={ppStyles.medRemoveBtn} onClick={() => setDraft({ ...draft, medications: draft.medications.filter((_, mi) => mi !== i) })}><X size={13} /></button>
                </div>
              ))}
              <button type="button" style={ppStyles.medAddBtn} onClick={() => setDraft({ ...draft, medications: [...(draft.medications || []), { name: "", dosage: "", doseUnit: "ml", frequency: "", days: "", remark: "" }] })}><Plus size={13} style={{ marginRight: 4 }} />Add medicine</button>
            </div>

            <EditReusableField label="Investigations" value={draft.investigations} onChange={(v) => setDraft({ ...draft, investigations: v })} options={editLists.investigation || []} field="investigation" setQuickPickLists={setQuickPickLists} />
            <RxField label="Instructions" value={draft.instructions} onChange={(v) => setDraft({ ...draft, instructions: v })} />
            <RxField label="Follow-up" value={draft.followUp} onChange={(v) => setDraft({ ...draft, followUp: v })} />
            <div><div style={ppStyles.editLabel}>Refer to</div><select style={ppStyles.editInput} value={draft.referral?.name || ""} onChange={(e) => { const r = (editLists.referral || []).find((x) => x.name === e.target.value); setDraft({ ...draft, referral: r ? { name: r.name, phone: r.phone || "" } : null }); }}><option value="">No referral</option>{(editLists.referral || []).map((r) => <option key={`${r.name}-${r.phone || ""}`} value={r.name}>{r.name}{r.phone ? ` — ${r.phone}` : ""}</option>)}</select></div>
            <div style={ppStyles.editActions}><button style={ppStyles.saveBtn} onClick={() => { const next = { ...draft, medications: normalizePrescriptionMedications(draft.medications) }; setDraft(next); setRx(next); setJustSaved(true); setEditing(false); }}>Save changes</button><button style={ppStyles.cancelBtn} onClick={() => setEditing(false)}>Cancel</button></div>
          </div>
        ) : (
          <div style={{ paddingBottom: 24 }}>
            {rx.pastHistory && <RxSection label="Past history" value={rx.pastHistory} />}
            {ps.includeComplaints && <RxSection label="Complaints" value={rx.complaints} />}
            {ps.includeFindings && <RxSection label="Findings" value={rx.findings} />}
            {ps.includeDiagnosis && <RxSection label="Diagnosis" value={rx.diagnosis} />}
            {ps.includeMedications && rx.medications?.length > 0 && (
              <div style={ppStyles.rxSectionBlock}>
                <div style={ppStyles.rxSectionLabel}>Medications</div>
                <table style={ppStyles.medTable}>
                  <thead>
                    <tr>
                      <th style={ppStyles.medTh}>Sr.</th>
                      <th style={{ ...ppStyles.medTh, textAlign: "left" }}>Name</th>
                      <th style={ppStyles.medTh}>Amount</th>
                      <th style={ppStyles.medTh}>Frequency</th>
                      <th style={ppStyles.medTh}>Days</th>
                      <th style={{ ...ppStyles.medTh, textAlign: "left" }}>Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rx.medications.map((m, i) => (
                      <tr key={i}>
                        <td style={ppStyles.medTd}>{i + 1}</td>
                        <td style={{ ...ppStyles.medTd, textAlign: "left", fontWeight: 700 }}>{m.name}</td>
                        <td style={ppStyles.medTd}>{m.dosage || "—"}</td>
                        <td style={ppStyles.medTd}>{m.frequency || "—"}</td>
                        <td style={ppStyles.medTd}>{m.days || "—"}</td>
                        <td style={{ ...ppStyles.medTd, textAlign: "left" }}>{m.remark || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {ps.includeInvestigations && <RxSection label="Investigations" value={rx.investigations} />}
            {ps.includeInstructions && <RxSection label="Instructions" value={rx.instructions} />}
            {ps.includeVaccination && (() => {
              // Compare by the visit's own recorded date label (always present on every
              // entry) rather than a timestamp — this is what actually identifies "this
              // visit," and works correctly whether you're viewing today's prescription
              // or an old one from the patient's history.
              const givenToday = (vaxList || []).filter((v) => v.given && fmtDate(v.given) === entry.date);
              const nextDue = (vaxList || [])
                .filter((v) => !v.given && v.due && getVStatus(v) === "blue")
                .sort((a, b) => new Date(a.due) - new Date(b.due))
                .slice(0, 1);
              if (givenToday.length === 0 && nextDue.length === 0) return null;
              return (
                <div style={ppStyles.rxSectionBlock}>
                  <div style={ppStyles.rxSectionLabel}>Vaccination</div>
                  {givenToday.length > 0 && (
                    <div style={{ fontSize: 13, color: "#1B2320", marginBottom: 4 }}>
                      <b>Given at this visit:</b> {givenToday.map((v, i) => `${v.name}${v.dose ? ` (${v.dose})` : ""}${v.brand ? ` — ${v.brand}` : ""}`).join(", ")}
                    </div>
                  )}
                  {nextDue.length > 0 && (
                    <div style={{ fontSize: 13, color: "#1B2320" }}>
                      <b>Next due:</b> {nextDue.map((v) => `${v.name}${v.dose ? ` (${v.dose})` : ""} — ${fmtDate(v.due)}`).join(", ")}
                    </div>
                  )}
                </div>
              );
            })()}
            {ps.includeFollowUp && <RxSection label="Follow-up" value={rx.followUp} />}
            {rx.referral?.name && <RxSection label="Referral" value={`${rx.referral.name}${rx.referral.phone ? ` — ${rx.referral.phone}` : ""}`} />}
            {ps.includeGrowthChart && ageInMonths(patient.dob) <= 216 && (
              <div style={ppStyles.rxSectionBlock}>
                <div style={ppStyles.rxSectionLabel}>Growth Chart</div>
                <GrowthChartSVG patient={patient} vitalsHistory={vitalsHistory} />
              </div>
            )}
            <div style={ppStyles.rxFooterSignature}>
              <div style={ppStyles.rxSignatureLine} />
              <div style={ppStyles.rxSignatureName}>{entry.consultingDoctor || entry.doctor}</div>
              <div style={ppStyles.rxSignatureSub}>Consulting Doctor</div>
            </div>
            <button style={{ ...ppStyles.editTrigger, margin: "0 20px" }} className="no-print" onClick={() => { setDraft({ ...rx, medications: (rx.medications || []).map((m) => ({ ...m, dosage: stripDoseUnit(m.dosage), doseUnit: m.doseUnit || inferDoseUnit(m.dosage) })) }); setEditing(true); }}>Edit prescription</button>
          </div>
        )}
      </div>
      <style>{`@media print { html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } .rx-page-wrap { min-height: 0 !important; padding: ${ps.marginTop}mm ${ps.marginRight}mm ${ps.marginBottom}mm ${ps.marginLeft}mm !important; display: block !important; background: #fff !important; box-sizing: border-box !important; } .rx-card-print { max-width: none !important; width: 100% !important; margin: 0 !important; border: 0 !important; outline: 0 !important; border-radius: 0 !important; box-shadow: none !important; background: #fff !important; } @page { margin: 0; size: A4; } }`}</style>
    </div>
  );
}

/* ---- Handwritten prescription sheet: blank space for doctor to write, doctor-only, printable ---- */
function HandwrittenPrescriptionView({ patient, doctorName, onBack, printSettings, vitalsHistory, onPrinted, clinicDetails }) {
  const ps = { ...defaultPrintSettings, ...(printSettings || {}) };
  const clinic = clinicDetails || { name: "Niramaya Clinic", address: "", phone: "" };
  function handlePrint() { if (onPrinted) onPrinted(); window.print(); }
  const today = indiaDateLabel();
  const latestVitals = (vitalsHistory && vitalsHistory[0]) || null;
  return (
    <div style={ppStyles.page} className="rx-page-wrap">
      <div style={{ ...ppStyles.card, display: "flex", flexDirection: "column", minHeight: `calc(297mm - ${ps.marginTop + ps.marginBottom}mm)` }} className="rx-card-print handwritten-print-card">
        <div style={ppStyles.rxViewerHeader} className="no-print">
          <button style={ppStyles.backBtnPlain} onClick={onBack}>← Back to profile</button>
          <button style={ppStyles.printRecordBtnDark} onClick={handlePrint}><Printer size={13} style={{ marginRight: 6 }} />Print</button>
        </div>
        <div style={{ padding: "10px 20px 24px", display: "flex", flexDirection: "column", flex: 1, minHeight: 0, boxSizing: "border-box" }} className="handwritten-print-body">
          {ps.includeClinicHeader && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: "#E7EFEC", display: "flex", alignItems: "center", justifyContent: "center" }}><Stethoscope size={20} color="#0B3B36" /></div>
              <div><div style={{ fontSize: 17, fontWeight: 700, color: "#1B2320" }}>{clinic.name}</div><div style={{ fontSize: 11.5, color: "#7A8380" }}>{[clinic.address, clinic.phone].filter(Boolean).join(" · ")}</div></div>
            </div>
          )}
          <div style={ppStyles.divider} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div><div style={{ fontSize: 15, fontWeight: 700, color: "#1B2320" }}>{patient.name}</div><div style={{ fontSize: 12, color: "#7A8380", marginTop: 2 }}>{patient.sex} · {calcAge(patient.dob)} · {patient.id}</div></div>
            <div style={{ fontSize: 12.5, color: "#5B635F", fontWeight: 600 }}>{today}</div>
          </div>
          <div style={{ fontSize: 12, color: "#5B635F", fontWeight: 600, marginTop: 4 }}>{doctorName}</div>
          {(() => {
            const enteredVitals = latestVitals ? [
              ["Wt", latestVitals.weight], ["Ht", latestVitals.height], ["Head circ.", latestVitals.headCirc],
              ["PR", latestVitals.pr], ["RR", latestVitals.rr], ["Temp", latestVitals.temp], ["SpO2", latestVitals.spo2],
            ].filter(([, v]) => v && v.value !== undefined && v.value !== null && v.value !== "") : [];
            return enteredVitals.length > 0 ? (
              <div style={{ display: "flex", gap: 18, marginTop: 10, fontSize: 12.5, color: "#3C4441", fontWeight: 600, flexWrap: "wrap" }}>
                {enteredVitals.map(([label, v]) => <span key={label}>{label}: {v.value} {v.unit || ""}</span>)}
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: "#8A928F", fontStyle: "italic", marginTop: 10 }}>No vitals on record for this patient yet.</div>
            );
          })()}
          <div style={ppStyles.divider} />
          {/* Blank writing area — flex:1 fills whatever page height remains below the
              header, so the signature always lands at the true bottom of the sheet. */}
          <div className="handwritten-writing-space" style={{ flex: 1, minHeight: 0, marginTop: 6, marginBottom: 12 }} />
          <div className="handwritten-signature" style={{ display: "flex", justifyContent: "flex-end", paddingTop: 14, marginTop: 0, flexShrink: 0, breakInside: "avoid", pageBreakInside: "avoid" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 180 }}>
              <div style={{ width: 160, borderTop: "1px solid #1B2320", marginBottom: 5 }} />
              <div style={{ fontSize: 11, color: "#1B2320", marginBottom: 8, fontWeight: 600 }}>Signature</div>
              <div style={{ fontSize: 12.5, color: "#1B2320", fontWeight: 700 }}>{doctorName}</div>
            </div>
          </div>
        </div>
      </div>
      <style>{`@media print {
        @page { size: A4; margin: 0; }
        html, body { width: 210mm !important; height: 297mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .no-print { display: none !important; }
        .rx-page-wrap { width: 210mm !important; min-height: 297mm !important; height: 297mm !important; margin: 0 !important; padding: ${ps.marginTop}mm ${ps.marginRight}mm ${ps.marginBottom}mm ${ps.marginLeft}mm !important; display: block !important; background: #fff !important; box-sizing: border-box !important; border: 0 !important; outline: 0 !important; box-shadow: none !important; }
        .rx-card-print, .handwritten-print-card { max-width: none !important; width: 100% !important; height: calc(297mm - ${ps.marginTop + ps.marginBottom}mm) !important; min-height: 0 !important; margin: 0 !important; border: 0 !important; outline: 0 !important; border-radius: 0 !important; box-shadow: none !important; background: #fff !important; overflow: hidden !important; box-sizing: border-box !important; }
        .handwritten-print-body { min-height: 0 !important; overflow: hidden !important; }
        .handwritten-writing-space { min-height: 0 !important; overflow: hidden !important; }
        .handwritten-signature { flex-shrink: 0 !important; margin-top: 0 !important; }
      }`}</style>
    </div>
  );
}
function RxSection({ label, value }) { if (!value) return null; return <div style={ppStyles.rxSectionBlock}><div style={ppStyles.rxSectionLabel}>{label}</div><div style={ppStyles.rxSectionValue}>{value}</div></div>; }
function stripDoseUnit(value) { return String(value || "").replace(/\s*(tab|tabs|tablet|tablets|ml|mL|drops?)\b/gi, "").trim(); }
function normalizePrescriptionMedications(medications) {
  return (medications || []).map((m) => {
    const unit = m.doseUnit || inferDoseUnit(m.dosage);
    const amount = stripDoseUnit(m.dosage);
    return { ...m, dosage: amount ? `${amount} ${unit}` : "", doseUnit: unit };
  });
}
function saveQuickPickItem(field, value, lists, setQuickPickLists) {
  const clean = (value || "").trim();
  if (!clean || !setQuickPickLists) return;
  const existing = lists[field] || [];
  if (existing.some((x) => String(x).toLowerCase() === clean.toLowerCase())) return;
  const next = [...existing, clean];
  setQuickPickLists((prev) => ({ ...prev, [field]: next }));
  supabase.from("quick_pick_lists").upsert({ field, items: next }, { onConflict: "field" }).then(({ error }) => { if (error) console.error("Failed to save quick-pick item", error); });
}
function inferDoseUnit(value) { const v = String(value || "").toLowerCase(); if (v.includes("drop")) return "drops"; if (v.includes("tab")) return "tab"; return "ml"; }
function EditReusableField({ label, value, onChange, options, field, setQuickPickLists }) {
  const items = parseListForCopy(value || "");
  const add = (name) => { const next = [...items, name]; onChange(next.join(", ")); saveQuickPickItem(field, name, { [field]: options }, setQuickPickLists); };
  return <div><div style={ppStyles.editLabel}>{label}</div><Autocomplete options={options || []} excluded={items} placeholder={`Type or select ${label.toLowerCase()}…`} onSelect={add} onAddNew={add} /><TagList items={items} onRemove={(name) => onChange(items.filter((x) => x !== name).join(", "))} /></div>;
}
function RxField({ label, value, onChange }) { return <label style={ppStyles.editLabel}>{label}<textarea style={{ ...ppStyles.editInput, minHeight: 50, resize: "vertical", fontFamily: "inherit" }} value={value} onChange={(e) => onChange(e.target.value)} /></label>; }

/* ============================================================================
   VACCINATION CERTIFICATE — printable immunization record for travel/school
   use. Defaults to administered vaccines only (chronological), with a
   toggle to also list what's still pending, since some school forms ask
   for the full schedule rather than just what's been given.
   ========================================================================== */
function VaccinationCertificateView({ patient, schedule, onBack, printSettings, clinicDetails }) {
  const ps = { ...defaultPrintSettings, ...(printSettings || {}) };
  const clinic = clinicDetails || { name: "Niramaya Clinic", address: "", phone: "" };
  const [includePending, setIncludePending] = useState(false);
  function handlePrint() { window.print(); }

  const flat = flattenSchedule(schedule).filter((v) => !v.isOthers || v.name); // Others box entries are already flat individual vaccines
  const given = flat.filter((v) => v.given).sort((a, b) => new Date(a.given) - new Date(b.given));
  const pending = flat.filter((v) => !v.given);

  const today = new Date();
  const age = patient.dob ? calcAge(patient.dob) : null;

  return (
    <div style={ppStyles.page} className="rx-page-wrap">
      <div style={ppStyles.card} className="rx-card-print">
        <div style={ppStyles.rxViewerHeader} className="no-print">
          <button style={ppStyles.backBtnPlain} onClick={onBack}>← Back to profile</button>
          <button style={ppStyles.printRecordBtnDark} onClick={handlePrint}><Printer size={13} style={{ marginRight: 6 }} />Print</button>
        </div>

        <div className="no-print" style={{ padding: "0 20px 12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#5B635F", cursor: "pointer" }}>
            <input type="checkbox" checked={includePending} onChange={(e) => setIncludePending(e.target.checked)} />
            Also list vaccines not yet given (some school forms ask for the full schedule)
          </label>
        </div>

        {ps.includeClinicHeader && (
          <div style={ppStyles.rxClinicHeader}>
            <div style={ppStyles.rxClinicIcon}><Stethoscope size={20} color="#0B3B36" /></div>
            <div><div style={ppStyles.rxClinicName}>{clinic.name}</div><div style={ppStyles.rxClinicMeta}>{[clinic.address, clinic.phone].filter(Boolean).join(" · ")}</div></div>
          </div>
        )}

        <div style={{ textAlign: "center", padding: "4px 20px 14px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0B3B36", letterSpacing: "0.02em" }}>IMMUNIZATION CERTIFICATE</div>
          <div style={{ fontSize: 11, color: "#8A928F", marginTop: 2 }}>Issued {fmtDate(today)}</div>
        </div>

        <div style={ppStyles.rxViewerPatient}>
          <div style={ppStyles.rxViewerName}>{patient.name} <span style={ppStyles.idTag}>{patient.id}</span></div>
          <div style={ppStyles.rxViewerMeta}>
            {patient.dob ? `DOB: ${fmtDate(patient.dob)}${age ? ` (${age})` : ""}` : "DOB not on file"} · {patient.sex}
            {patient.fatherName && ` · Father: ${patient.fatherName}`}
            {patient.motherName && ` · Mother: ${patient.motherName}`}
          </div>
        </div>

        <div style={ppStyles.divider} />

        <div style={{ padding: "16px 20px" }}>
          <div style={ppStyles.rxSectionLabel}>Vaccines administered</div>
          {given.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "#8A928F", fontStyle: "italic", padding: "8px 0" }}>No vaccines recorded as given yet.</div>
          ) : (
            <table style={ppStyles.medTable}>
              <thead><tr><th style={ppStyles.medTh}>Vaccine</th><th style={ppStyles.medTh}>Dose</th><th style={ppStyles.medTh}>Date given</th><th style={ppStyles.medTh}>Brand</th></tr></thead>
              <tbody>
                {given.map((v) => (
                  <tr key={v.id}>
                    <td style={ppStyles.medTd}>{v.name}{v.givenElsewhere && <span style={{ fontSize: 10, color: "#B7591F" }}> (given elsewhere)</span>}</td>
                    <td style={ppStyles.medTd}>{v.dose || "—"}</td>
                    <td style={ppStyles.medTd}>{fmtDate(v.given)}</td>
                    <td style={ppStyles.medTd}>{v.brand || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {includePending && pending.length > 0 && (
            <>
              <div style={{ ...ppStyles.rxSectionLabel, marginTop: 20 }}>Not yet given</div>
              <table style={ppStyles.medTable}>
                <thead><tr><th style={ppStyles.medTh}>Vaccine</th><th style={ppStyles.medTh}>Dose</th><th style={ppStyles.medTh}>Age group</th><th style={ppStyles.medTh}>Status</th></tr></thead>
                <tbody>
                  {pending.map((v) => { const s = vStatusStyles[getVStatus(v)]; return (
                    <tr key={v.id}>
                      <td style={ppStyles.medTd}>{v.name}</td>
                      <td style={ppStyles.medTd}>{v.dose || "—"}</td>
                      <td style={ppStyles.medTd}>{v.boxLabel}</td>
                      <td style={{ ...ppStyles.medTd, color: s.text, fontWeight: 600 }}>{s.label}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div style={ppStyles.divider} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "16px 20px 24px" }}>
          <div style={{ fontSize: 10, color: "#B0B5B1" }}>This certificate reflects records on file at {clinic.name} as of the print date.</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ width: 160, borderTop: "1px solid #1B2320", marginBottom: 4 }} />
            <div style={{ fontSize: 10.5, color: "#B0B5B1" }}>Doctor's signature & clinic stamp</div>
          </div>
        </div>
      </div>
      <style>{`@media print { html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } .rx-page-wrap { min-height: 0 !important; padding: ${ps.marginTop}mm ${ps.marginRight}mm ${ps.marginBottom}mm ${ps.marginLeft}mm !important; display: block !important; background: #fff !important; box-sizing: border-box !important; } .rx-card-print { max-width: none !important; width: 100% !important; margin: 0 !important; border: 0 !important; outline: 0 !important; border-radius: 0 !important; box-shadow: none !important; background: #fff !important; } @page { margin: 0; size: A4; } }`}</style>
    </div>
  );
}

const ppStyles = {
  page: { minHeight: "100vh", background: "#F6F5F1", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", padding: "24px 16px", boxSizing: "border-box", display: "flex", justifyContent: "center" },
  card: { width: "100%", maxWidth: 600, background: "#fff", border: "1px solid #E8E6DF", borderRadius: 14, boxSizing: "border-box", height: "fit-content" },
  header: { display: "flex", alignItems: "center", gap: 12, padding: "20px 20px 16px" },
  avatar: { width: 44, height: 44, borderRadius: "50%", background: "#0B3B36", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, flexShrink: 0 },
  name: { fontSize: 16.5, fontWeight: 700, color: "#1B2320" },
  subline: { fontSize: 12.5, color: "#7A8380", marginTop: 2 },
  closeBtn: { background: "#F6F5F1", border: "1px solid #E8E6DF", borderRadius: 7, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, color: "#5B635F", cursor: "pointer" },
  tabBar: { display: "flex", borderBottom: "1px solid #EEECE5", padding: "0 20px", gap: 4, overflowX: "auto" },
  tabBtn: { display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "#8A928F", background: "none", border: "none", borderBottom: "2px solid transparent", cursor: "pointer", whiteSpace: "nowrap" },
  tabBtnActive: { color: "#0B3B36", borderBottom: "2px solid #0B3B36" },
  tabContent: { padding: 20 },
  infoGrid: { display: "flex", flexDirection: "column", gap: 12 },
  infoRow: { display: "flex", alignItems: "flex-start", gap: 10 },
  infoIcon: { width: 30, height: 30, borderRadius: 7, background: "#E7EFEC", color: "#0B3B36", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  infoLabel: { fontSize: 11, color: "#8A928F", fontWeight: 600 },
  infoValue: { fontSize: 14, color: "#1B2320", fontWeight: 600, marginTop: 1 },
  vitalsRecordedOn: { fontSize: 12, color: "#8A928F", marginBottom: 14 },
  vitalsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 },
  vitalCard: { background: "#F6F5F1", border: "1px solid #EEECE5", borderRadius: 10, padding: "12px 12px" },
  vitalIcon: { color: "#0B3B36", marginBottom: 6 },
  vitalLabel: { fontSize: 11, color: "#8A928F", fontWeight: 600 },
  vitalValue: { fontSize: 15, color: "#1B2320", fontWeight: 700, marginTop: 2 },
  unitText: { fontSize: 11, color: "#8A928F", fontWeight: 600, marginLeft: 5 },
  unitInline: { fontSize: 10.5, color: "#8A928F", fontWeight: 500 },
  historyTableWrap: { marginTop: 22, borderTop: "1px solid #EEECE5", paddingTop: 16 },
  historyTableTitle: { fontSize: 12.5, fontWeight: 700, color: "#5B635F", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" },
  tableScroll: { overflowX: "auto", border: "1px solid #E8E6DF", borderRadius: 10, background: "#fff" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 },
  th: { textAlign: "left", padding: "9px 12px", color: "#5B635F", fontWeight: 700, fontSize: 11, background: "#F0EFEA", borderBottom: "1px solid #E8E6DF", whiteSpace: "nowrap" },
  td: { padding: "9px 12px", color: "#1B2320", fontWeight: 500, whiteSpace: "nowrap", borderBottom: "1px solid #EEECE5" },
  tdDate: { padding: "9px 12px", color: "#0B3B36", fontWeight: 700, whiteSpace: "nowrap", borderBottom: "1px solid #EEECE5" },
  trAlt: { background: "#FBFAF8" },
  unitTextSmall: { fontSize: 11, color: "#8A928F", fontWeight: 500 },
  bmiTagSmall: { fontSize: 9.5, fontWeight: 700, border: "1px solid", borderRadius: 20, padding: "1px 7px", marginLeft: 8 },
  editTrigger: { marginTop: 14, background: "#0B3B36", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  lockedNote: { marginTop: 14, fontSize: 12, color: "#8A928F", fontStyle: "italic" },
  editGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 },
  editLabel: { display: "flex", flexDirection: "column", fontSize: 12, fontWeight: 600, color: "#3C4441", gap: 5 },
  editInput: { fontSize: 13.5, padding: "8px 10px", borderRadius: 7, border: "1px solid #DCD9D0", fontFamily: "inherit", boxSizing: "border-box", width: "100%" },
  editActions: { display: "flex", gap: 8 },
  saveBtn: { background: "#0B3B36", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  cancelBtn: { background: "#fff", color: "#5B635F", border: "1px solid #DCD9D0", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  vaxList: { display: "flex", flexDirection: "column", gap: 8 },
  vaxRow: { display: "flex", alignItems: "center", gap: 10, border: "1px solid", borderRadius: 10, padding: "10px 12px" },
  vaxName: { fontSize: 13.5, fontWeight: 600, color: "#1B2320" },
  vaxMeta: { fontSize: 12, color: "#5B635F", marginTop: 2 },
  vaxTag: { fontSize: 10.5, fontWeight: 700, border: "1px solid", borderRadius: 20, padding: "3px 9px" },
  historyList: { display: "flex", flexDirection: "column", gap: 12 },
  historyRow: { display: "flex", gap: 12 },
  historyIcon: { width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  historyTop: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  historyType: { fontSize: 11, fontWeight: 700, color: "#0B3B36" },
  historyDate: { fontSize: 12, color: "#8A928F" },
  historyDoctor: { fontSize: 12.5, color: "#5B635F", marginTop: 2, fontWeight: 500 },
  historyDetail: { fontSize: 13, color: "#1B2320", marginTop: 4 },
  historyFileTag: { fontSize: 11, color: "#B7591F", fontWeight: 700, marginLeft: 8, background: "#FDF0E6", padding: "2px 7px", borderRadius: 4 },
  historySummary: { fontSize: 12.5, color: "#5B635F", marginTop: 4, lineHeight: 1.5, background: "#F6F5F1", padding: "8px 10px", borderRadius: 8 },
  rxLink: { fontSize: 12, color: "#0B3B36", fontWeight: 600, marginLeft: 10, cursor: "pointer" },
  crossCoverageTag: { display: "inline-block", fontSize: 10, fontWeight: 700, color: "#B7591F", background: "#FDF0E6", padding: "2px 6px", borderRadius: 4, marginLeft: 8 },
  newRxBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", background: "#0B3B36", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  handwrittenBtn: { display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", color: "#0B3B36", border: "1px solid #0B3B36", borderRadius: 8, padding: "11px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  followUpBtn: { display: "flex", alignItems: "center", justifyContent: "center", background: "#E7F0FA", color: "#1D5A96", border: "1px solid #B8D4EF", borderRadius: 8, padding: "11px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  followUpInlineBtn: { fontSize: 11, fontWeight: 600, color: "#1D5A96", background: "#E7F0FA", border: "1px solid #B8D4EF", borderRadius: 7, padding: "6px 10px", cursor: "pointer", whiteSpace: "nowrap" },
  growthPlaceholder: { border: "1px dashed #B0B5B1", borderRadius: 8, padding: "20px 12px", textAlign: "center", fontSize: 11.5, color: "#8A928F", fontStyle: "italic" },
  growthBox: { width: "1in", height: "1in", border: "1px dashed #DCD9D0", borderRadius: 6, boxSizing: "border-box" },
  rxListRow: { display: "flex", alignItems: "center", gap: 10, background: "#F6F5F1", border: "1px solid #EEECE5", borderRadius: 10, padding: "11px 12px", cursor: "pointer" },
  backBtnPlain: { background: "none", border: "none", fontSize: 13, fontWeight: 600, color: "#0B3B36", cursor: "pointer", padding: 0, marginBottom: 12, display: "block" },
  rxViewerHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 20px 0" },
  rxClinicHeader: { display: "flex", alignItems: "center", gap: 10, padding: "16px 20px 0" },
  rxClinicIcon: { width: 34, height: 34, borderRadius: 8, background: "#E7EFEC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  rxClinicName: { fontSize: 15, fontWeight: 700, color: "#1B2320" },
  rxClinicMeta: { fontSize: 11, color: "#7A8380", marginTop: 1 },
  rxViewerPatient: { padding: "16px 20px 0" },
  rxViewerName: { fontSize: 16, fontWeight: 700, color: "#1B2320" },
  rxViewerMeta: { fontSize: 12, color: "#8A928F", marginTop: 3 },
  rxVitalsRow: { display: "flex", gap: 16, marginTop: 8, fontSize: 12.5, color: "#3C4441", fontWeight: 600, flexWrap: "wrap" },
  rxVitalsMissing: { fontSize: 11.5, color: "#8A928F", fontStyle: "italic", marginTop: 8 },
  crossCoverageBanner: { fontSize: 11.5, color: "#9B2C2C", background: "#FDECEC", border: "1px solid #F5C6C6", borderRadius: 8, padding: "8px 10px", marginTop: 8 },
  rxSectionBlock: { padding: "0 20px", marginBottom: 16 },
  rxSectionLabel: { fontSize: 11, fontWeight: 700, color: "#0B3B36", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 },
  rxSectionValue: { fontSize: 13.5, color: "#1B2320", lineHeight: 1.6 },
  medViewRow: { display: "flex", alignItems: "baseline", gap: 8, fontSize: 13, flexWrap: "wrap" },
  medViewNum: { fontWeight: 700, color: "#0B3B36" },
  medViewName: { fontWeight: 700, color: "#1B2320" },
  medViewDetail: { color: "#5B635F", fontSize: 12 },
  medTable: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 },
  medTh: { textAlign: "center", fontSize: 10.5, fontWeight: 700, color: "#5B635F", textTransform: "uppercase", letterSpacing: "0.03em", padding: "0 6px 6px", borderBottom: "1px solid #E8E6DF" },
  medTd: { textAlign: "center", padding: "7px 6px", color: "#1B2320", borderBottom: "1px solid #F3F2EE", verticalAlign: "top" },
  medEditRow: { display: "flex", gap: 6, marginBottom: 8, alignItems: "center", flexWrap: "wrap" },
  medRemoveBtn: { display: "flex", alignItems: "center", justifyContent: "center", background: "#FDECEC", border: "1px solid #F5C6C6", color: "#9B2C2C", borderRadius: 6, width: 30, height: 30, cursor: "pointer", flexShrink: 0 },
  medAddBtn: { display: "flex", alignItems: "center", fontSize: 12, fontWeight: 600, color: "#0B3B36", background: "#E7EFEC", border: "1px solid #0B3B36", borderRadius: 8, padding: "7px 12px", cursor: "pointer" },
  printRecordBtnDark: { display: "flex", alignItems: "center", fontSize: 12.5, fontWeight: 600, color: "#fff", background: "#0B3B36", border: "none", borderRadius: 7, padding: "8px 14px", cursor: "pointer" },
  idTag: { fontSize: 11.5, fontWeight: 600, color: "#8A928F", background: "#F1F1EF", padding: "2px 8px", borderRadius: 20 },
  rxFooterSignature: { margin: "20px 20px 0", paddingTop: 16, borderTop: "1px solid #E8E6DF", display: "flex", flexDirection: "column", alignItems: "flex-end" },
  rxSignatureLine: { width: 160, borderTop: "1px solid #1B2320", marginBottom: 4 },
  rxSignatureName: { fontSize: 12.5, fontWeight: 700, color: "#1B2320" },
  rxSignatureSub: { fontSize: 10.5, color: "#8A928F", marginTop: 1 },
};

/* ============================================================================
   GROWTH CHART — inline SVG (print-safe, no external chart library required)
   Approximate WHO weight-for-age and height-for-age P3/P50/P97 reference
   points, 0–60 months.
   ========================================================================== */
const growthRefWeight = {
  boys: [{ age: 0, p3: 2.5, p50: 3.3, p97: 4.4 }, { age: 3, p3: 5.0, p50: 6.4, p97: 8.0 }, { age: 6, p3: 6.4, p50: 7.9, p97: 9.8 }, { age: 12, p3: 7.7, p50: 9.6, p97: 12.0 }, { age: 24, p3: 10.4, p50: 12.7, p97: 15.6 }, { age: 60, p3: 14.8, p50: 18.4, p97: 24.3 }],
  girls: [{ age: 0, p3: 2.4, p50: 3.2, p97: 4.2 }, { age: 3, p3: 4.0, p50: 5.5, p97: 7.4 }, { age: 6, p3: 5.1, p50: 7.3, p97: 9.8 }, { age: 12, p3: 6.8, p50: 9.4, p97: 12.4 }, { age: 24, p3: 8.6, p50: 12.0, p97: 15.7 }, { age: 60, p3: 12.4, p50: 18.0, p97: 24.6 }],
};
const growthRefHeight = {
  boys: [{ age: 0, p3: 46.5, p50: 49.9, p97: 53.4 }, { age: 3, p3: 57.3, p50: 61.4, p97: 65.5 }, { age: 6, p3: 63.3, p50: 67.6, p97: 71.9 }, { age: 12, p3: 71.0, p50: 75.7, p97: 80.5 }, { age: 24, p3: 81.7, p50: 87.8, p97: 93.9 }, { age: 60, p3: 100.7, p50: 110.0, p97: 119.2 }],
  girls: [{ age: 0, p3: 45.6, p50: 49.1, p97: 52.7 }, { age: 3, p3: 55.6, p50: 59.8, p97: 64.0 }, { age: 6, p3: 61.2, p50: 65.7, p97: 70.3 }, { age: 12, p3: 68.9, p50: 74.0, p97: 79.2 }, { age: 24, p3: 80.0, p50: 86.4, p97: 92.9 }, { age: 60, p3: 99.9, p50: 109.4, p97: 118.9 }],
};
const growthRefHeadCirc = {
  boys: [{ age: 0, p3: 31.9, p50: 34.5, p97: 37.0 }, { age: 3, p3: 38.3, p50: 41.3, p97: 44.2 }, { age: 6, p3: 40.9, p50: 43.3, p97: 45.6 }, { age: 12, p3: 43.6, p50: 46.1, p97: 48.5 }, { age: 24, p3: 45.4, p50: 48.3, p97: 51.2 }, { age: 36, p3: 46.6, p50: 49.5, p97: 52.3 }, { age: 48, p3: 47.5, p50: 50.4, p97: 53.3 }, { age: 60, p3: 48.2, p50: 51.1, p97: 54.0 }],
  girls: [{ age: 0, p3: 31.5, p50: 33.9, p97: 36.2 }, { age: 3, p3: 37.2, p50: 40.0, p97: 42.8 }, { age: 6, p3: 39.6, p50: 42.2, p97: 44.8 }, { age: 12, p3: 42.1, p50: 44.9, p97: 47.7 }, { age: 24, p3: 44.3, p50: 47.2, p97: 50.1 }, { age: 36, p3: 45.5, p50: 48.4, p97: 51.3 }, { age: 48, p3: 46.4, p50: 49.3, p97: 52.2 }, { age: 60, p3: 47.1, p50: 50.0, p97: 52.9 }],
};
const growthRefWeight5to18 = {
  boys: [{ age: 60, p3: 15.1, p50: 18.3, p97: 22.5 }, { age: 72, p3: 16.5, p50: 20.0, p97: 24.8 }, { age: 84, p3: 18.0, p50: 21.8, p97: 27.4 }, { age: 96, p3: 19.6, p50: 23.7, p97: 30.2 }, { age: 108, p3: 21.3, p50: 25.6, p97: 33.0 }, { age: 120, p3: 23.0, p50: 27.5, p97: 36.0 }, { age: 132, p3: 25.0, p50: 29.7, p97: 40.0 }, { age: 144, p3: 27.2, p50: 32.0, p97: 44.0 }, { age: 156, p3: 29.5, p50: 34.7, p97: 48.5 }, { age: 168, p3: 32.0, p50: 37.5, p97: 53.0 }, { age: 180, p3: 34.5, p50: 40.5, p97: 58.0 }, { age: 192, p3: 37.0, p50: 43.5, p97: 63.0 }, { age: 204, p3: 40.0, p50: 47.0, p97: 69.0 }, { age: 216, p3: 43.0, p50: 50.5, p97: 75.0 }],
  girls: [{ age: 60, p3: 14.0, p50: 17.9, p97: 22.0 }, { age: 72, p3: 15.5, p50: 19.5, p97: 24.5 }, { age: 84, p3: 17.0, p50: 21.1, p97: 27.0 }, { age: 96, p3: 18.6, p50: 22.9, p97: 29.5 }, { age: 108, p3: 20.3, p50: 24.8, p97: 32.0 }, { age: 120, p3: 22.0, p50: 27.0, p97: 35.5 }, { age: 132, p3: 24.0, p50: 29.5, p97: 40.0 }, { age: 144, p3: 26.0, p50: 32.0, p97: 44.5 }, { age: 156, p3: 28.5, p50: 34.5, p97: 49.0 }, { age: 168, p3: 31.0, p50: 37.0, p97: 53.5 }, { age: 180, p3: 34.0, p50: 40.0, p97: 58.0 }, { age: 192, p3: 37.0, p50: 43.0, p97: 62.5 }, { age: 204, p3: 40.0, p50: 46.5, p97: 67.0 }, { age: 216, p3: 43.0, p50: 50.0, p97: 72.0 }],
};
const growthRefHeight5to18 = {
  boys: [{ age: 60, p3: 101, p50: 110, p97: 119 }, { age: 72, p3: 106, p50: 117, p97: 127 }, { age: 84, p3: 111, p50: 123, p97: 134 }, { age: 96, p3: 116, p50: 129, p97: 141 }, { age: 108, p3: 121, p50: 134, p97: 148 }, { age: 120, p3: 126, p50: 140, p97: 155 }, { age: 132, p3: 131, p50: 146, p97: 162 }, { age: 144, p3: 136, p50: 152, p97: 169 }, { age: 156, p3: 141, p50: 158, p97: 176 }, { age: 168, p3: 147, p50: 164, p97: 182 }, { age: 180, p3: 152, p50: 169, p97: 188 }, { age: 192, p3: 157, p50: 174, p97: 194 }, { age: 204, p3: 162, p50: 179, p97: 200 }, { age: 216, p3: 167, p50: 183, p97: 205 }],
  girls: [{ age: 60, p3: 100, p50: 109, p97: 118 }, { age: 72, p3: 105, p50: 116, p97: 126 }, { age: 84, p3: 110, p50: 122, p97: 133 }, { age: 96, p3: 115, p50: 128, p97: 140 }, { age: 108, p3: 120, p50: 134, p97: 147 }, { age: 120, p3: 125, p50: 140, p97: 154 }, { age: 132, p3: 130, p50: 146, p97: 161 }, { age: 144, p3: 135, p50: 152, p97: 168 }, { age: 156, p3: 140, p50: 158, p97: 174 }, { age: 168, p3: 145, p50: 163, p97: 180 }, { age: 180, p3: 150, p50: 168, p97: 186 }, { age: 192, p3: 155, p50: 173, p97: 191 }, { age: 204, p3: 159, p50: 178, p97: 196 }, { age: 216, p3: 163, p50: 181, p97: 201 }],
};

function ageInMonths(dob, atDate) {
  const d0 = new Date(dob), d1 = atDate ? new Date(atDate) : new Date();
  return Math.max(0, Math.round((d1 - d0) / (1000 * 60 * 60 * 24 * 30.44)));
}

function GrowthChartMetric({ patient, vitalsHistory, metric }) {
  const sexKey = patient.sex === "Female" ? "girls" : "boys";
  const ageMonths = ageInMonths(patient.dob);
  const isHeadCirc = metric === "headCirc";
  const isWeight = metric === "weight";
  const isUnder5 = ageMonths <= 60;
  const refTable = isHeadCirc ? growthRefHeadCirc : (isWeight ? { boys: [...growthRefWeight.boys, ...growthRefWeight5to18.boys.filter(r => r.age > 60)], girls: [...growthRefWeight.girls, ...growthRefWeight5to18.girls.filter(r => r.age > 60)] } : { boys: [...growthRefHeight.boys, ...growthRefHeight5to18.boys.filter(r => r.age > 60)], girls: [...growthRefHeight.girls, ...growthRefHeight5to18.girls.filter(r => r.age > 60)] });
  const unit = isWeight ? "kg" : "cm";
  const shortLabel = isHeadCirc ? "HC/Age" : (isWeight ? "Wt/Age" : "Ht/Age");
  const rawHistory = (vitalsHistory && vitalsHistory.length > 0) ? vitalsHistory : (patient.vitals ? [patient.vitals] : []);
  const maxAge = isHeadCirc ? 60 : 216;
  const points = rawHistory.map(row => ({ age: ageInMonths(patient.dob, row.dateISO || undefined), value: parseFloat(row[metric]?.value) }))
    .filter(p => !isNaN(p.value) && p.age >= 0 && p.age <= maxAge).sort((a,b) => a.age-b.age);

  if (points.length === 0) {
    return <div style={{ ...ppStyles.growthBox, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 4 }}>
      <div style={{ fontSize: 7.5, color: "#B0B5B1" }}>{shortLabel}<br />no data</div>
    </div>;
  }

  // The chart always spans the complete reference age range (0–18 years for
  // weight/height; 0–5 years for head circumference). Reference data are shown
  // as five SD curves: −2 SD, −1 SD, Median, +1 SD, +2 SD. Patient observations
  // are intentionally dots only — never connected by a patient line.
  const baseRef = refTable[sexKey].filter(r => r.age <= maxAge).sort((a,b) => a.age-b.age);
  const ref = baseRef.length ? baseRef : refTable[sexKey];
  const refByAge = (age) => {
    if (age <= ref[0].age) return ref[0];
    if (age >= ref[ref.length - 1].age) return ref[ref.length - 1];
    for (let i = 1; i < ref.length; i++) {
      if (age <= ref[i].age) {
        const a = ref[i - 1], b = ref[i], t = (age - a.age) / (b.age - a.age || 1);
        return { age, p3: a.p3 + (b.p3-a.p3)*t, p50: a.p50 + (b.p50-a.p50)*t, p97: a.p97 + (b.p97-a.p97)*t };
      }
    }
    return ref[ref.length - 1];
  };
  // The existing reference tables contain the outer P3/P97 and median values.
  // Convert those to the requested five evenly-spaced SD guide curves for the
  // visual chart, keeping the median in the middle.
  const curveFor = (sd) => {
    const t = Math.abs(sd) / 2;
    return Array.from({ length: maxAge + 1 }, (_, age) => {
      const r = refByAge(age);
      const value = sd < 0 ? r.p50 - (r.p50-r.p3)*t : sd > 0 ? r.p50 + (r.p97-r.p50)*t : r.p50;
      return { age, value };
    });
  };
  const curves = { m2: curveFor(-2), m1: curveFor(-1), median: curveFor(0), p1: curveFor(1), p2: curveFor(2) };
  const maxVal = Math.max(...Object.values(curves).flat().map(p => p.value), ...points.map(p => p.value)) * 1.06;
  const minVal = Math.max(0, Math.min(...Object.values(curves).flat().map(p => p.value)) * 0.9);
  const W = 560, H = 250, padL = 42, padR = 12, padT = 18, padB = 30;
  const x = age => padL + (Math.min(Math.max(age, 0), maxAge) / maxAge) * (W - padL - padR);
  const y = v => H - padB - ((v - minVal) / Math.max(0.001, maxVal - minVal)) * (H - padT - padB);
  const pathFor = curve => curve.map((r,i) => `${i === 0 ? "M" : "L"} ${x(r.age).toFixed(1)} ${y(r.value).toFixed(1)}`).join(" ");
  const patientPath = points.map((p,i) => `${i === 0 ? "M" : "L"} ${x(p.age).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const last = points[points.length-1];
  const years = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18].filter(v => v * 12 <= maxAge);
  const gridValues = [0,1,2,3,4].map(i => minVal + (maxVal-minVal) * i / 4);
  const lineDefs = [
    ["m2", "−2 SD", "#C98A8A"], ["m1", "−1 SD", "#D6B37A"], ["median", "M", "#8A928F"],
    ["p1", "+1 SD", "#D6B37A"], ["p2", "+2 SD", "#C98A8A"]
  ];

  return <div style={{ width: "100%", maxWidth: 570 }}>
    <div style={{ fontSize: 9.5, fontWeight: 700, color: "#0B3B36", marginBottom: 3 }}>{shortLabel} · {isHeadCirc ? "0–5 years" : "0–18 years"}</div>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: "#FBFAF8", border: "1px solid #EEECE5", borderRadius: 6, display: "block" }}>
      {gridValues.map((v,i) => <line key={`gy${i}`} x1={padL} y1={y(v)} x2={W-padR} y2={y(v)} stroke="#ECEAE4" strokeWidth="0.7" />)}
      {years.map(yr => <line key={`gx${yr}`} x1={x(yr*12)} y1={padT} x2={x(yr*12)} y2={H-padB} stroke="#F0EEE9" strokeWidth="0.7" />)}
      <line x1={padL} y1={padT} x2={padL} y2={H-padB} stroke="#CFCBC1" strokeWidth="0.9" />
      <line x1={padL} y1={H-padB} x2={W-padR} y2={H-padB} stroke="#CFCBC1" strokeWidth="0.9" />
      {lineDefs.map(([key,label,stroke]) => <path key={key} d={pathFor(curves[key])} fill="none" stroke={stroke} strokeWidth={key === "median" ? 1.35 : 1.05} strokeDasharray="4 3" />)}
      {points.length > 1 && <path d={patientPath} fill="none" stroke="#0B3B36" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />}
      {years.map(yr => <text key={`xt${yr}`} x={x(yr*12)} y={H-10} textAnchor="middle" fontSize="8" fill="#6D746F">{yr}</text>)}
      {lineDefs.map(([key,label],i) => <text key={`lab${key}`} x={padL + i * 66} y={12} fontSize="8" fill="#5B635F">{label}</text>)}
      <text x={W-8} y={H-10} textAnchor="end" fontSize="8" fill="#6D746F">Age (years)</text>
      {points.map((p,i) => <circle key={i} cx={x(p.age)} cy={y(p.value)} r="3" fill="#0B3B36" stroke="#FFFFFF" strokeWidth="1" />)}
    </svg>
    <div style={{ fontSize: 7.5, color: "#5B635F", marginTop: 2 }}>Latest: {last.value}{unit} · bold line + dots = recorded measurements</div>
  </div>;
}
function GrowthChartSVG({ patient, vitalsHistory }) {
  const ageMonths = ageInMonths(patient.dob);
  return (
    <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {ageMonths <= 60 ? <>
        <GrowthChartMetric patient={patient} vitalsHistory={vitalsHistory} metric="weight" />
        <GrowthChartMetric patient={patient} vitalsHistory={vitalsHistory} metric="height" />
        <GrowthChartMetric patient={patient} vitalsHistory={vitalsHistory} metric="headCirc" />
      </> : ageMonths <= 216 ? <>
        <GrowthChartMetric patient={patient} vitalsHistory={vitalsHistory} metric="weight" />
        <GrowthChartMetric patient={patient} vitalsHistory={vitalsHistory} metric="height" />
      </> : <div style={ppStyles.growthPlaceholder}>Growth charts are available for children up to 18 years.</div>}
    </div>
  );
}

/* ============================================================================
   VACCINATION SCHEDULE (full — due/given dates per vaccine, brand tracking)
   ========================================================================== */
const GRACE_DAYS = 14;
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function fmtDate(d) { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
function toDateInputValue(d) { return new Date(d).toISOString().split("T")[0]; }
let vuid = 0; function nextVUid() { return `v${vuid++}`; }

function ageLabelFromMonths(m) {
  if (m < 24) return `${m} months`;
  const y = Math.floor(m / 12), rem = m % 12;
  return rem === 0 ? `${y} yr` : `${y} yr ${rem} mo`;
}

function buildMainSchedule(dobStr) {
  const dob = new Date(dobStr);

  // Annual influenza: first dose at 19 months, then every 12 months through 18 years —
  // grouped into one box so the schedule list doesn't balloon into 17 separate boxes.
  const annualFlu = [];
  for (let m = 19; m <= 216; m += 12) {
    annualFlu.push({ name: "Influenza", dose: `ANNUAL — ${ageLabelFromMonths(m)}` });
  }

  // HPV: 3-dose series starting at 9 years (0 / +2mo / +6mo) — grouped for the same reason.
  const hpvDoses = [
    { name: "HPV", dose: "1ST DOSE" },
    { name: "HPV", dose: "2ND DOSE — +2 mo" },
    { name: "HPV", dose: "3RD DOSE — +6 mo" },
  ];

  const raw = [
    { label: "Birth", milestone: dob, vaccines: ["BCG", "OPV", "Hep B"] },
    { label: "6 weeks", milestone: addDays(dob, 42), vaccines: ["DPT", "IPV", "Hep B", "Hib", "PCV", "Rota"] },
    { label: "10 weeks", milestone: addDays(dob, 70), vaccines: ["DPT", "IPV", "Hep B", "Hib", "PCV", "Rota"] },
    { label: "14 weeks", milestone: addDays(dob, 98), vaccines: ["DPT", "IPV", "Hep B", "Hib", "PCV", "Rota"] },
    { label: "6 months", milestone: addMonths(dob, 6), vaccines: ["Influenza", "Typhoid"] },
    { label: "7 months", milestone: addMonths(dob, 7), vaccines: [{ name: "Influenza", dose: "2ND DOSE" }] },
    { label: "9 months", milestone: addMonths(dob, 9), vaccines: ["MMR", "Meningococcal"] },
    { label: "12 months", milestone: addMonths(dob, 12), vaccines: ["Hep A", "JE", { name: "Meningococcal", dose: "2ND DOSE" }] },
    { label: "13 months", milestone: addMonths(dob, 13), vaccines: [{ name: "JE", dose: "2ND DOSE" }] },
    { label: "15 months", milestone: addMonths(dob, 15), vaccines: ["Varicella", { name: "PCV", dose: "BOOSTER" }] },
    { label: "18 months", milestone: addMonths(dob, 18), vaccines: [{ name: "Hep A", dose: "2ND DOSE" }, { name: "Varicella", dose: "2ND DOSE" }, { name: "DPT", dose: "BOOSTER 1" }] },
    { label: "Annual Influenza (19 months – 18 years)", milestone: addMonths(dob, 19), vaccines: annualFlu },
    { label: "4 years", milestone: addMonths(dob, 48), vaccines: [{ name: "DPT", dose: "BOOSTER 2" }] },
    { label: "8 years", milestone: addMonths(dob, 96), vaccines: [{ name: "DPT", dose: "BOOSTER 3" }] },
    { label: "9 years", milestone: addMonths(dob, 108), vaccines: hpvDoses },
    { label: "12 years", milestone: addMonths(dob, 144), vaccines: [{ name: "DPT", dose: "BOOSTER 4" }] },
    { label: "16 years", milestone: addMonths(dob, 192), vaccines: [{ name: "DPT", dose: "BOOSTER 5" }] },
  ];
  // Vaccines start with NO due date (grey / not yet due) — a doctor must explicitly
  // set a due date before status can turn yellow/red. `milestone` is only used to
  // keep the age-group boxes in chronological order; it does not drive status.
  const main = raw
    .map((box) => ({ label: box.label, milestone: box.milestone, vaccines: box.vaccines.map((v) => { const o = typeof v === "string" ? { name: v } : v; return { id: nextVUid(), name: o.name, dose: o.dose || null, due: null, given: null }; }) }))
    .sort((a, b) => a.milestone - b.milestone);

  // "Others / as needed" — not tied to an age milestone. Starts empty; a doctor adds
  // entries manually (Rabies PEP, PCV 20, travel vaccines, etc.), and can add the same
  // vaccine multiple times for multi-dose regimens — each click auto-numbers the dose.
  const others = { label: "Others / as needed", milestone: null, isOthers: true, vaccines: [] };

  return [...main, others];
}
function getVStatus(v) {
  if (v.given) return v.givenElsewhere ? "orange" : "green";
  if (!v.due) return "grey";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(v.due); due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - due) / 86400000);
  if (diffDays < 0) return "blue";
  return diffDays <= GRACE_DAYS ? "yellow" : "red";
}
const vStatusStyles = {
  grey: { bg: "#F1F1EF", border: "#DEDDD6", text: "#8A928F", label: "Not scheduled" },
  blue: { bg: "#E7F0FA", border: "#B8D4EF", text: "#1D5A96", label: "Scheduled" },
  yellow: { bg: "#FDF6E3", border: "#F0DFA8", text: "#8A6D3B", label: "Due now" },
  red: { bg: "#FDECEC", border: "#F5C6C6", text: "#9B2C2C", label: "Overdue" },
  green: { bg: "#EAF5EF", border: "#BEE3CD", text: "#1E6B45", label: "Given" },
  orange: { bg: "#FDF0E6", border: "#F0C9A0", text: "#B7591F", label: "Given elsewhere" },
};
function flattenSchedule(schedule) {
  return schedule.flatMap((box) => box.vaccines.map((v) => ({ ...v, boxLabel: box.label })));
}

function PatientVaccinationEditor({ schedule, setSchedule, editable }) {
  const [editingField, setEditingField] = useState(null);
  const [brandMemory, setBrandMemory] = useState({});
  const [brandEditingFor, setBrandEditingFor] = useState(null);
  const [brandDraft, setBrandDraft] = useState("");

  function updateMainVaccine(id, field, dateStr) { setSchedule((prev) => prev.map((box) => ({ ...box, vaccines: box.vaccines.map((v) => (v.id === id ? { ...v, [field]: dateStr ? new Date(dateStr) : null } : v)) }))); }
  function toggleElsewhere(id) { setSchedule((prev) => prev.map((box) => ({ ...box, vaccines: box.vaccines.map((v) => (v.id === id ? { ...v, givenElsewhere: !v.givenElsewhere } : v)) }))); }
  function setBrand(id, brand) { setSchedule((prev) => prev.map((box) => ({ ...box, vaccines: box.vaccines.map((v) => (v.id === id ? { ...v, brand } : v)) }))); }
  function rememberBrand(name, brand) { setBrandMemory((prev) => { const existing = prev[name] || []; return existing.some((b) => b.toLowerCase() === brand.toLowerCase()) ? prev : { ...prev, [name]: [...existing, brand] }; }); }
  // "Others / as needed" box only: free-form add, auto-numbering repeat doses of the
  // same vaccine name (e.g. clicking "Rabies" 5 times gives DOSE 1..5 for a PEP course).
  function addOtherVaccine(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSchedule((prev) => prev.map((box) => {
      if (!box.isOthers) return box;
      const existingCount = box.vaccines.filter((v) => v.name.toLowerCase() === trimmed.toLowerCase()).length;
      const dose = existingCount === 0 ? null : `DOSE ${existingCount + 1}`;
      return { ...box, vaccines: [...box.vaccines, { id: nextVUid(), name: trimmed, dose, due: null, given: null }] };
    }));
  }
  function removeOtherVaccine(id) {
    setSchedule((prev) => prev.map((box) => (box.isOthers ? { ...box, vaccines: box.vaccines.filter((v) => v.id !== id) } : box)));
  }

  function DateField({ fieldKey, label, value, onChange, allowEmpty }) {
    if (!editable) {
      return <span style={vaxStyles.dateFieldReadOnly}><span style={vaxStyles.dateFieldLabel}>{label}:</span> {value ? fmtDate(value) : (allowEmpty ? "— not set" : "—")}</span>;
    }
    if (editingField === fieldKey) {
      return <input type="date" autoFocus defaultValue={value ? toDateInputValue(value) : ""} onBlur={(e) => { onChange(e.target.value || null); setEditingField(null); }} onKeyDown={(e) => { if (e.key === "Enter") { onChange(e.target.value || null); setEditingField(null); } if (e.key === "Escape") setEditingField(null); }} style={vaxStyles.dateEditInputSmall} />;
    }
    return <button style={vaxStyles.dateFieldBtn} onClick={() => setEditingField(fieldKey)}><span style={vaxStyles.dateFieldLabel}>{label}:</span> {value ? fmtDate(value) : (allowEmpty ? "— not set" : "—")}<Pencil size={9} style={{ marginLeft: 4, flexShrink: 0 }} /></button>;
  }
  function ElsewhereToggle({ given, givenElsewhere, onToggle }) {
    if (!given) return null;
    if (!editable) return <div style={vaxStyles.elsewhereToggleRow}><span style={{ ...vaxStyles.elsewhereBtn, ...(givenElsewhere ? vaxStyles.elsewhereBtnActiveOrange : vaxStyles.elsewhereBtnActive) }}>{givenElsewhere ? "Given elsewhere" : "Given here"}</span></div>;
    return <div style={vaxStyles.elsewhereToggleRow}>
      <button type="button" onClick={() => givenElsewhere && onToggle()} style={{ ...vaxStyles.elsewhereBtn, ...(!givenElsewhere ? vaxStyles.elsewhereBtnActive : {}) }}>Given here</button>
      <button type="button" onClick={() => !givenElsewhere && onToggle()} style={{ ...vaxStyles.elsewhereBtn, ...(givenElsewhere ? vaxStyles.elsewhereBtnActiveOrange : {}) }}>Given elsewhere</button>
    </div>;
  }
  function BrandField({ doseId, vaccineName, brand, onSetBrand }) {
    if (!editable) return brand ? <div style={vaxStyles.brandWrap}><span style={vaxStyles.brandLabel}>Brand:</span> {brand}</div> : null;
    if (!brand && brandEditingFor !== doseId) {
      const remembered = brandMemory[vaccineName] || [];
      return <div style={vaxStyles.brandWrap}><span style={vaxStyles.brandLabel}>Brand:</span>{remembered.map((b) => <button key={b} type="button" style={vaxStyles.brandChip} onClick={() => onSetBrand(b)}>{b}</button>)}<button type="button" style={vaxStyles.brandAddChip} onClick={() => { setBrandEditingFor(doseId); setBrandDraft(""); }}><Plus size={10} style={{ marginRight: 2 }} />New</button></div>;
    }
    if (brandEditingFor === doseId) {
      return <div style={vaxStyles.brandWrap}>
        <input autoFocus style={vaxStyles.brandInput} value={brandDraft} onChange={(e) => setBrandDraft(e.target.value)} placeholder="Brand name" onKeyDown={(e) => { if (e.key === "Enter" && brandDraft.trim()) { rememberBrand(vaccineName, brandDraft.trim()); onSetBrand(brandDraft.trim()); setBrandEditingFor(null); } if (e.key === "Escape") setBrandEditingFor(null); }} />
        <button type="button" style={vaxStyles.brandSaveBtn} onClick={() => { if (!brandDraft.trim()) return; rememberBrand(vaccineName, brandDraft.trim()); onSetBrand(brandDraft.trim()); setBrandEditingFor(null); }}><Check size={12} /></button>
      </div>;
    }
    return <button type="button" style={vaxStyles.brandSetBtn} onClick={() => { setBrandEditingFor(doseId); setBrandDraft(brand); }}><span style={vaxStyles.brandLabel}>Brand:</span> {brand} <Pencil size={9} style={{ marginLeft: 4 }} /></button>;
  }

  function OtherVaccineInput({ onAdd }) {
    const [draft, setDraft] = useState("");
    return (
      <div style={vaxStyles.othersAddRow}>
        <input
          style={vaxStyles.othersAddInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type vaccine name, e.g. Rabies (Day 3)"
          onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { onAdd(draft); setDraft(""); } }}
        />
        <button type="button" style={vaxStyles.othersAddBtn} onClick={() => { if (draft.trim()) { onAdd(draft); setDraft(""); } }}><Plus size={12} style={{ marginRight: 3 }} />Add</button>
      </div>
    );
  }

  return (
    <div>
      {!editable && <div style={vaxStyles.readOnlyNote}>View only — only a doctor login can update vaccination dates.</div>}
      {editable && (
        <div style={vaxStyles.reminderControl}>
          <div>
            <div style={vaxStyles.reminderTitle}>Vaccine reminders for this patient</div>
            <div style={vaxStyles.reminderSub}>Hide due/overdue reminders if the patient has moved out or should no longer be contacted. You can turn this back on anytime.</div>
          </div>
          <button type="button" style={{ ...vaxStyles.reminderToggle, ...(isVaccineReminderSuppressed(schedule) ? vaxStyles.reminderToggleOff : vaxStyles.reminderToggleOn) }} onClick={() => setSchedule((prev) => setVaccineReminderSuppressed(prev, !isVaccineReminderSuppressed(prev)))}>
            {isVaccineReminderSuppressed(schedule) ? "Reminders off" : "Reminders on"}
          </button>
        </div>
      )}
      <div style={vaxStyles.legend}>{Object.entries(vStatusStyles).map(([key, s]) => <span key={key} style={vaxStyles.legendItem}><span style={{ ...vaxStyles.legendDot, background: s.text }} />{s.label}</span>)}</div>
      <div style={vaxStyles.boxList}>
        {schedule.map((box, bi) => (
          <div key={bi} style={vaxStyles.box}>
            <div style={vaxStyles.boxLabel}>{box.label}</div>
            <div style={vaxStyles.vaccineRows}>
              {box.vaccines.map((v) => { const s = vStatusStyles[getVStatus(v)]; return (
                <div key={v.id} style={{ ...vaxStyles.vaccineRow, background: s.bg, borderColor: s.border }}>
                  <div style={{ ...vaxStyles.vaccineName, color: s.text }}>{v.name}{v.dose && <span style={vaxStyles.doseLabel}> ({v.dose})</span>}{box.isOthers && editable && <button type="button" style={vaxStyles.removeOtherBtn} onClick={() => removeOtherVaccine(v.id)} title="Remove"><X size={11} /></button>}</div>
                  <div style={vaxStyles.vaccineDates}>
                    <DateField fieldKey={`${v.id}-due`} label="Due" value={v.due} onChange={(d) => updateMainVaccine(v.id, "due", d)} allowEmpty />
                    <DateField fieldKey={`${v.id}-given`} label="Given" value={v.given} onChange={(d) => updateMainVaccine(v.id, "given", d)} allowEmpty />
                  </div>
                  <ElsewhereToggle given={v.given} givenElsewhere={v.givenElsewhere} onToggle={() => toggleElsewhere(v.id)} />
                  {v.given && <BrandField doseId={v.id} vaccineName={v.name} brand={v.brand} onSetBrand={(b) => setBrand(v.id, b)} />}
                </div>
              ); })}
              {box.isOthers && box.vaccines.length === 0 && <div style={vaxStyles.othersEmptyNote}>No entries yet — add Rabies, PCV 20, or any other vaccine below.</div>}
            </div>
            {box.isOthers && editable && (
              <div style={vaxStyles.othersAddWrap}>
                <div style={vaxStyles.othersChipRow}>
                  <button type="button" style={vaxStyles.othersChip} onClick={() => addOtherVaccine("Rabies")}>+ Rabies</button>
                  <button type="button" style={vaxStyles.othersChip} onClick={() => addOtherVaccine("PCV 20")}>+ PCV 20</button>
                </div>
                <OtherVaccineInput onAdd={addOtherVaccine} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const vaxStyles = {
  readOnlyNote: { fontSize: 12, color: "#8A928F", fontStyle: "italic", marginBottom: 12 },
  dateFieldReadOnly: { display: "inline-flex", alignItems: "center", fontSize: 10.5, color: "#5B635F", fontWeight: 500, background: "rgba(255,255,255,0.6)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, padding: "3px 7px" },
  page: { minHeight: "100vh", background: "#F6F5F1", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", padding: "28px 16px", boxSizing: "border-box" },
  container: { maxWidth: 600, margin: "0 auto" },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  iconBadge: { width: 40, height: 40, borderRadius: 10, background: "#E7EFEC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#0B3B36", marginBottom: 3 },
  h1: { fontSize: 17.5, fontWeight: 700, color: "#1B2320", margin: 0, display: "flex", alignItems: "center", gap: 8 },
  idTag: { fontSize: 11.5, fontWeight: 600, color: "#8A928F", background: "#F1F1EF", padding: "2px 8px", borderRadius: 20 },
  dobLine: { fontSize: 12, color: "#7A8380", marginTop: 3 },
  legend: { display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" },
  legendItem: { display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#5B635F", fontWeight: 500 },
  legendDot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" },
  reminderControl: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #E8E6DF", borderRadius: 10, padding: "11px 12px", marginBottom: 14 },
  reminderTitle: { fontSize: 12.5, fontWeight: 700, color: "#1B2320" },
  reminderSub: { fontSize: 10.5, color: "#8A928F", lineHeight: 1.45, marginTop: 3, maxWidth: 430 },
  reminderToggle: { border: "1px solid", borderRadius: 7, padding: "7px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  reminderToggleOn: { background: "#EAF5EF", borderColor: "#BEE3CD", color: "#1E6B45" },
  reminderToggleOff: { background: "#FDECEC", borderColor: "#F5C6C6", color: "#9B2C2C" },
  boxList: { display: "flex", flexDirection: "column", gap: 12 },
  box: { background: "#fff", border: "1px solid #E8E6DF", borderRadius: 10, padding: "12px 14px" },
  boxLabel: { fontSize: 13.5, fontWeight: 700, color: "#1B2320", marginBottom: 8 },
  vaccineRows: { display: "flex", flexDirection: "column", gap: 6 },
  vaccineRow: { border: "1px solid", borderRadius: 8, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 },
  vaccineName: { fontSize: 12.5, fontWeight: 700 },
  doseLabel: { fontWeight: 500, fontSize: 10.5 },
  vaccineDates: { display: "flex", gap: 10, flexWrap: "wrap" },
  dateFieldBtn: { display: "flex", alignItems: "center", fontSize: 10.5, color: "#5B635F", fontWeight: 500, background: "rgba(255,255,255,0.6)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, cursor: "pointer", padding: "3px 7px" },
  dateFieldLabel: { fontWeight: 700, marginRight: 3 },
  dateEditInputSmall: { fontSize: 11, padding: "3px 6px", borderRadius: 6, border: "1px solid #0B3B36", fontFamily: "inherit" },
  elsewhereToggleRow: { display: "flex", gap: 5, marginTop: 4 },
  elsewhereBtn: { fontSize: 9.5, fontWeight: 700, color: "#8A928F", background: "#fff", border: "1px solid #DCD9D0", borderRadius: 20, padding: "3px 8px", cursor: "pointer" },
  elsewhereBtnActive: { color: "#1E6B45", background: "#EAF5EF", border: "1px solid #BEE3CD" },
  elsewhereBtnActiveOrange: { color: "#B7591F", background: "#FDF0E6", border: "1px solid #F0C9A0" },
  brandWrap: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5, marginTop: 4 },
  brandLabel: { fontSize: 10, fontWeight: 700, color: "#5B635F" },
  brandChip: { fontSize: 10, fontWeight: 600, color: "#5B635F", background: "#fff", border: "1px solid #DCD9D0", borderRadius: 20, padding: "3px 8px", cursor: "pointer" },
  brandAddChip: { display: "flex", alignItems: "center", fontSize: 10, fontWeight: 700, color: "#0B3B36", background: "#E7EFEC", border: "1px solid #0B3B36", borderRadius: 20, padding: "3px 8px", cursor: "pointer" },
  brandInput: { fontSize: 11, padding: "3px 7px", borderRadius: 6, border: "1px solid #0B3B36", fontFamily: "inherit", width: 110, boxSizing: "border-box" },
  brandSaveBtn: { display: "flex", alignItems: "center", justifyContent: "center", background: "#0B3B36", color: "#fff", border: "none", borderRadius: 6, width: 22, height: 22, cursor: "pointer" },
  brandSetBtn: { display: "flex", alignItems: "center", fontSize: 10.5, fontWeight: 600, color: "#5B635F", background: "rgba(255,255,255,0.6)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, cursor: "pointer", padding: "3px 7px", marginTop: 4 },
  removeOtherBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: 6, width: 16, height: 16, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.06)", color: "#8A928F", cursor: "pointer", padding: 0, verticalAlign: -2 },
  othersEmptyNote: { fontSize: 11.5, color: "#8A928F", fontStyle: "italic", padding: "4px 2px" },
  othersAddWrap: { marginTop: 10, paddingTop: 10, borderTop: "1px dashed #E8E6DF" },
  othersChipRow: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 },
  othersChip: { fontSize: 11, fontWeight: 700, color: "#0B3B36", background: "#E7EFEC", border: "1px solid #0B3B36", borderRadius: 20, padding: "4px 10px", cursor: "pointer" },
  othersAddRow: { display: "flex", gap: 6 },
  othersAddInput: { flex: 1, fontSize: 12, padding: "6px 9px", borderRadius: 7, border: "1px solid #DCD9D0", fontFamily: "inherit", boxSizing: "border-box" },
  othersAddBtn: { display: "flex", alignItems: "center", flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: "#fff", background: "#0B3B36", border: "none", borderRadius: 7, padding: "6px 10px", cursor: "pointer" },
};

function DrugDosePresetsPanel({ quickPickLists, setQuickPickLists }) {
  const presets = quickPickLists?.medicationDosePresets || [];
  const [name, setName] = useState("");
  const [doseMlKg, setDoseMlKg] = useState("");
  const [strength, setStrength] = useState("");
  const [frequency, setFrequency] = useState("1");
  const [days, setDays] = useState("");
  const [editingName, setEditingName] = useState("");
  const [message, setMessage] = useState("");

  function resetForm() {
    setName(""); setDoseMlKg(""); setStrength(""); setFrequency("1"); setDays(""); setEditingName("");
  }
  async function savePreset() {
    const cleanName = name.trim();
    const dose = Number(doseMlKg);
    const cleanStrength = strength.trim();
    if (!cleanName || !Number.isFinite(dose) || dose <= 0 || !cleanStrength) {
      setMessage("Enter drug name, a positive mL/kg dose, and strength."); return;
    }
    const previousName = editingName || "";
    const next = [...presets.filter((r) => String(r.name || "").toLowerCase() !== cleanName.toLowerCase() && String(r.name || "").toLowerCase() !== previousName.toLowerCase()), {
      name: cleanName, doseMlKg: dose, strength: cleanStrength, frequency: frequency || "1", days: days || ""
    }];
    const existingMeds = quickPickLists?.medication || [];
    const medicationNext = [...existingMeds.filter((m) => String(m).toLowerCase() !== String(previousName).toLowerCase() && String(m).toLowerCase() !== cleanName.toLowerCase()), cleanName];
    // Save the dose-preset row first. The dose preset is a new quick_pick_lists
    // field, so older databases may not have that row yet. If RLS blocks the
    // insert, do not claim the change was saved locally; show the exact policy
    // problem instead.
    const dosePayload = { field: "medicationDosePresets", items: next };
    const { data: existingDoseRow, error: doseLookupError } = await supabase
      .from("quick_pick_lists")
      .select("field")
      .eq("field", "medicationDosePresets")
      .maybeSingle();
    if (doseLookupError) {
      console.error("Failed to check medicationDosePresets row", doseLookupError);
      setMessage(doseLookupError.message || "Could not check drug dose settings.");
      return;
    }

    const doseRes = existingDoseRow
      ? await supabase.from("quick_pick_lists").update({ items: next }).eq("field", "medicationDosePresets")
      : await supabase.from("quick_pick_lists").insert(dosePayload);

    if (doseRes.error) {
      console.error("Failed to save medicationDosePresets", doseRes.error);
      const msg = String(doseRes.error.message || "Could not save dose preset.");
      if (/row-level security|rls|policy/i.test(msg)) {
        setMessage("Supabase RLS is blocking creation of the new medicationDosePresets row. Add an INSERT policy for quick_pick_lists for Admin users, then save again.");
      } else {
        setMessage(msg);
      }
      return;
    }

    // Keep the medicine master list in sync. This row normally already exists
    // in installations that have the prescription medicine list. If it does not,
    // use the same update/insert pattern and surface RLS clearly.
    const { data: existingMedRow, error: medLookupError } = await supabase
      .from("quick_pick_lists")
      .select("field")
      .eq("field", "medication")
      .maybeSingle();
    if (medLookupError) {
      console.error("Failed to check medication row", medLookupError);
      setMessage(medLookupError.message || "Dose saved, but medicine list could not be checked.");
      return;
    }
    const medRes = existingMedRow
      ? await supabase.from("quick_pick_lists").update({ items: medicationNext }).eq("field", "medication")
      : await supabase.from("quick_pick_lists").insert({ field: "medication", items: medicationNext });
    if (medRes.error) {
      console.error("Failed to save medication list", medRes.error);
      const msg = String(medRes.error.message || "Could not update medicine list.");
      setMessage(/row-level security|rls|policy/i.test(msg)
        ? "Dose preset saved, but Supabase RLS blocked updating the medicine list. Add an INSERT/UPDATE policy for quick_pick_lists for Admin users."
        : msg);
      return;
    }

    setQuickPickLists?.((prev) => ({ ...prev, medicationDosePresets: next, medication: medicationNext }));
    setMessage(editingName ? "Drug dose preset updated and medicine list refreshed." : "Drug dose preset saved and medicine added to the prescription list.");
    resetForm();
  }
  function editPreset(r) {
    setEditingName(r.name); setName(r.name); setDoseMlKg(String(r.doseMlKg ?? "")); setStrength(String(r.strength ?? "")); setFrequency(r.frequency || "1"); setDays(String(r.days ?? "")); setMessage("");
  }
  async function deletePreset(nameToDelete) {
    const next = presets.filter((r) => r.name !== nameToDelete);
    // Keep the medicine searchable even after its dose preset is deleted; only the automatic dose rule is removed.
    const { data: existingDoseRow, error: lookupError } = await supabase
      .from("quick_pick_lists").select("field").eq("field", "medicationDosePresets").maybeSingle();
    if (lookupError) { setMessage(lookupError.message || "Could not check dose settings."); return; }
    const { error } = existingDoseRow
      ? await supabase.from("quick_pick_lists").update({ items: next }).eq("field", "medicationDosePresets")
      : await supabase.from("quick_pick_lists").insert({ field: "medicationDosePresets", items: next });
    if (error) {
      setMessage(/row-level security|rls|policy/i.test(String(error.message))
        ? "Supabase RLS is blocking the medicationDosePresets row. Add the Admin INSERT/UPDATE policy, then try again."
        : (error.message || "Could not delete preset."));
      return;
    }
    setQuickPickLists?.((prev) => ({ ...prev, medicationDosePresets: next }));
    setMessage("Dose preset deleted. The medicine remains in the prescription list.");
  }

  return (
    <div style={{ padding: 4 }}>
      <div style={settingsStyles.header}>
        <div style={settingsStyles.iconBadge}><Pill size={20} color="#0B3B36" /></div>
        <div><div style={settingsStyles.eyebrow}>ADMIN · PRESCRIPTION SETTINGS</div><h1 style={settingsStyles.h1}>Drug dose presets</h1><p style={settingsStyles.sub}>Manage the medicines and doctor-entered mL/kg rules used by prescription entry. These are clinic presets; no doses are hard-coded. Saving a preset also adds that medicine to the Doctor prescription medicine list.</p></div>
      </div>
      <div style={{ padding: 14, background: "#F5FAF7", border: "1px solid #B8D8CC", borderRadius: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#52615C", marginBottom: 10 }}>Enter the dose in <b>mL/kg</b>, product strength, frequency and number of days. When a doctor selects the medicine, Niramaya uses the patient's <b>today-only recorded weight</b> to calculate the mL amount. Strength is displayed on the prescription but is not used to calculate volume.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          <input style={settingsStyles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Drug name" />
          <input style={settingsStyles.input} type="number" min="0" step="any" value={doseMlKg} onChange={(e) => setDoseMlKg(e.target.value)} placeholder="Dose mL/kg" />
          <input style={settingsStyles.input} type="text" value={strength} onChange={(e) => setStrength(e.target.value)} placeholder="Strength e.g. 250 mg/5 mL" />
          <select style={settingsStyles.input} value={frequency} onChange={(e) => setFrequency(e.target.value)}>{frequencyOptions.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
          <input style={settingsStyles.input} type="number" min="0" value={days} onChange={(e) => setDays(e.target.value)} placeholder="Days" />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button style={settingsStyles.saveBtn} type="button" onClick={savePreset}>{editingName ? "Update dose preset" : "Save dose preset"}</button>
          {editingName && <button style={settingsStyles.cancelBtn} type="button" onClick={resetForm}>Cancel edit</button>}
        </div>
        {message && <div style={{ ...settingsStyles.successBox, marginTop: 10 }}>{message}</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {presets.length === 0 && <div style={settingsStyles.sub}>No drug dose presets saved yet.</div>}
        {presets.map((r) => (
          <div key={r.name} style={{ ...settingsStyles.staffRow, alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1B2320" }}>{r.name}</div>
              <div style={{ fontSize: 12, color: "#7A8380", marginTop: 3 }}>{r.doseMlKg} mL/kg · {r.strength || "Strength not set"} · {(frequencyOptions.find((f) => f.key === r.frequency)?.label || r.frequency || "Frequency not set")} · {r.days || "—"} days</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button style={settingsStyles.editStaffBtn} type="button" onClick={() => editPreset(r)}><Pencil size={12} style={{ marginRight: 5 }} />Edit</button>
              <button style={settingsStyles.removeStaffBtn} type="button" onClick={() => deletePreset(r.name)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   CLINIC SETTINGS (admin only, gated in Shell)
   ========================================================================== */
function ClinicSettings({ accounts, setAccounts, refreshAccounts, session, printSettings, setPrintSettings, rooms, setRooms, clinicDetails, setClinicDetails, appointmentTypes, setAppointmentTypes, quickPickLists, setQuickPickLists, backupData }) {
  const [subTab, setSubTab] = useState("details");
  const [draft, setDraft] = useState(clinicDetails);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <div style={settingsStyles.page}>
      <div style={settingsStyles.cardWide}>
        <div style={settingsStyles.subTabBar}>
          <button onClick={() => setSubTab("details")} style={{ ...settingsStyles.subTabBtn, ...(subTab === "details" ? settingsStyles.subTabBtnActive : {}) }}>Clinic Details</button>
          <button onClick={() => setSubTab("staff")} style={{ ...settingsStyles.subTabBtn, ...(subTab === "staff" ? settingsStyles.subTabBtnActive : {}) }}>Staff Accounts</button>
          <button onClick={() => setSubTab("rooms")} style={{ ...settingsStyles.subTabBtn, ...(subTab === "rooms" ? settingsStyles.subTabBtnActive : {}) }}>Room Setup</button>
          <button onClick={() => setSubTab("apptTypes")} style={{ ...settingsStyles.subTabBtn, ...(subTab === "apptTypes" ? settingsStyles.subTabBtnActive : {}) }}>Appointment Types</button>
          <button onClick={() => setSubTab("drugDoses")} style={{ ...settingsStyles.subTabBtn, ...(subTab === "drugDoses" ? settingsStyles.subTabBtnActive : {}) }}>Drug Dose Presets</button>
          <button onClick={() => setSubTab("print")} style={{ ...settingsStyles.subTabBtn, ...(subTab === "print" ? settingsStyles.subTabBtnActive : {}) }}>Print Settings</button>
          <button onClick={() => setSubTab("audit")} style={{ ...settingsStyles.subTabBtn, ...(subTab === "audit" ? settingsStyles.subTabBtnActive : {}) }}>Audit Log</button>
          <button onClick={() => setSubTab("backup")} style={{ ...settingsStyles.subTabBtn, ...(subTab === "backup" ? settingsStyles.subTabBtnActive : {}) }}>Data Export / Backup</button>
        </div>

        {subTab === "details" && (
          <div style={{ padding: 4 }}>
            <div style={settingsStyles.header}>
              <div style={settingsStyles.iconBadge}><Building2 size={20} color="#0B3B36" /></div>
              <div><div style={settingsStyles.eyebrow}>ADMIN · CLINIC SETTINGS</div><h1 style={settingsStyles.h1}>Clinic details</h1><p style={settingsStyles.sub}>Shown on every printed prescription (unless the clinic header is turned off in Print Settings for letterhead paper).</p></div>
            </div>
            {!editing ? (
              <>
                <div style={settingsStyles.infoGrid}>
                  <InfoRow icon={<Building2 size={14} />} label="Clinic name" value={clinicDetails.name} />
                  <InfoRow icon={<MapPin size={14} />} label="Address" value={clinicDetails.address} />
                  <InfoRow icon={<Phone size={14} />} label="Phone" value={clinicDetails.phone} />
                  {clinicDetails.email && <InfoRow icon={<Mail size={14} />} label="Email" value={clinicDetails.email} />}
                  {clinicDetails.website && <InfoRow icon={<Globe size={14} />} label="Website" value={clinicDetails.website} />}
                </div>
                {saved && <div style={settingsStyles.successBox}><Check size={14} style={{ marginRight: 6 }} />Saved.</div>}
                <button style={settingsStyles.editBtn} onClick={() => { setDraft(clinicDetails); setEditing(true); setSaved(false); }}><Pencil size={14} style={{ marginRight: 7 }} />Edit clinic details</button>
              </>
            ) : (
              <div style={settingsStyles.form}>
                <label style={settingsStyles.label}>Clinic name<input style={settingsStyles.input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
                <label style={settingsStyles.label}>Address<input style={settingsStyles.input} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></label>
                <label style={settingsStyles.label}>Phone<input style={settingsStyles.input} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label>
                <label style={settingsStyles.label}>Email<input style={settingsStyles.input} type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
                <label style={settingsStyles.label}>Website<input style={settingsStyles.input} value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} /></label>
                <div style={settingsStyles.formActions}><button style={settingsStyles.saveBtn} onClick={() => { setClinicDetails(draft); setEditing(false); setSaved(true); supabase.from("clinic_details").update(clinicDetailsToDb(draft)).eq("id", true).then(({ error }) => { if (error) console.error("Failed to save clinic details", error); }); }}>Save changes</button><button style={settingsStyles.cancelBtn} onClick={() => setEditing(false)}>Cancel</button></div>
              </div>
            )}
          </div>
        )}

        {subTab === "staff" && <StaffAccountsPanel accounts={accounts} refreshAccounts={refreshAccounts} session={session} />}
        {subTab === "rooms" && <RoomSetupPanel rooms={rooms} setRooms={setRooms} />}
        {subTab === "apptTypes" && <AppointmentTypesPanel appointmentTypes={appointmentTypes} setAppointmentTypes={setAppointmentTypes} />}
        {subTab === "drugDoses" && <DrugDosePresetsPanel quickPickLists={quickPickLists} setQuickPickLists={setQuickPickLists} />}
        {subTab === "print" && <PrintSettingsPanel printSettings={printSettings} setPrintSettings={setPrintSettings} />}
        {subTab === "audit" && <AuditLogPanel />}
        {subTab === "backup" && <DataExportBackupPanel backupData={backupData} />}
      </div>
    </div>
  );
}

function AuditLogPanel() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  async function loadAudit() {
    setLoading(true);
    setError("");
    try {
      const [appointmentsRes, vitalsRes, consultationsRes] = await Promise.all([
        supabase.from("appointments").select("*"),
        supabase.from("vitals").select("*"),
        supabase.from("consultations").select("*"),
      ]);
      const errors = [appointmentsRes.error, vitalsRes.error, consultationsRes.error].filter(Boolean);
      if (errors.length) {
        console.error("Audit refresh errors", errors);
        throw new Error(errors.map((e) => e.message).filter(Boolean).join(" | ") || "Unable to load one or more audit sources.");
      }
      const events = [];
      (appointmentsRes.data || []).forEach((a) => {
        if (a.created_at) events.push({ type: "appointment", at: a.created_at, title: "Appointment created", detail: `${a.patient_name || a.patient_id || "Patient"}${a.doctor_name ? ` · Dr. ${a.doctor_name}` : ""}` });
        if (a.check_in_at) events.push({ type: "checkin", at: a.check_in_at, title: "Patient checked in", detail: `${a.patient_name || a.patient_id || "Patient"}${a.entry_source ? ` · ${a.entry_source}` : ""}` });
        if (a.status === "cancelled") events.push({ type: "appointment", at: a.updated_at || a.created_at || a.check_in_at, title: "Appointment cancelled", detail: a.patient_name || a.patient_id || "Patient" });
      });
      (vitalsRes.data || []).forEach((v) => events.push({ type: "vitals", at: v.updated_at || v.recorded_at, title: "Vitals recorded/updated", detail: `Patient ${v.patient_id}${v.recorded_by ? ` · by ${v.recorded_by}` : ""}` }));
      (consultationsRes.data || []).forEach((c) => events.push({ type: "consultation", at: c.created_at || c.updated_at || c.date_label, title: c.type === "IPD" ? "IPD record saved" : "Consultation saved", detail: `Patient ${c.patient_id}${c.consulting_doctor ? ` · Dr. ${c.consulting_doctor}` : ""}` }));
      events.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
      setEntries(events);
    } catch (err) {
      console.error("Audit log refresh failed", err);
      setError(`Refresh failed: ${err?.message || "Please check your connection and database permissions."}`);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadAudit(); }, []);
  const shown = filter === "all" ? entries : entries.filter((e) => e.type === filter);
  return (
    <div style={{ padding: 4 }}>
      <div style={settingsStyles.header}>
        <div style={settingsStyles.iconBadge}><HistoryIcon size={20} color="#0B3B36" /></div>
        <div><div style={settingsStyles.eyebrow}>ADMIN · AUDIT LOG</div><h1 style={settingsStyles.h1}>Clinical activity</h1><p style={settingsStyles.sub}>Review recorded appointments, check-ins, vitals and consultations. This is read-only and does not change any patient record.</p></div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {[['all','All'],['appointment','Appointments'],['checkin','Check-ins'],['vitals','Vitals'],['consultation','Consultations']].map(([key,label]) => <button key={key} onClick={() => setFilter(key)} style={{ ...settingsStyles.roleChipOpt, ...(filter === key ? settingsStyles.roleChipOptActive : {}) }}>{label}</button>)}
        <button onClick={loadAudit} disabled={loading} style={{ ...settingsStyles.editStaffBtn, marginLeft: "auto", opacity: loading ? 0.6 : 1, cursor: loading ? "wait" : "pointer" }}><RefreshCw size={13} style={{ marginRight: 5 }} />{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
      {error && <div style={{ fontSize: 12, color: "#9B2C2C", marginBottom: 10 }}>{error}</div>}
      {loading ? <div style={{ fontSize: 13, color: "#8A928F", padding: "18px 0" }}>Loading audit log…</div> : shown.length === 0 ? <div style={{ fontSize: 13, color: "#8A928F", padding: "18px 0" }}>No recorded activity found yet.</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shown.map((e, i) => <div key={`${e.type}-${e.at}-${i}`} style={settingsStyles.auditRow}>
            <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: "#1B2320" }}>{e.title}</div><div style={{ fontSize: 12, color: "#5B635F", marginTop: 2 }}>{e.detail}</div></div>
            <div style={{ fontSize: 11, color: "#8A928F", textAlign: "right", whiteSpace: "nowrap" }}>{e.at ? indiaDateTimeLabel(new Date(e.at)) : "Date unavailable"}</div>
          </div>)}
        </div>
      )}
    </div>
  );
}

function StaffAccountsPanel({ accounts, refreshAccounts, session }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", username: "", password: "", role: "doctor" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Row-level state: which account (by id) is being edited or having its password reset.
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", username: "", role: "doctor" });
  const [editError, setEditError] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [resettingId, setResettingId] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const [deletingId, setDeletingId] = useState(null); // confirm-before-delete
  const [deleteError, setDeleteError] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  function resetForm() { setForm({ name: "", email: "", username: "", password: "", role: "doctor" }); setError(""); }
  function closeAllRowActions() { setEditingId(null); setResettingId(null); setDeletingId(null); setEditError(""); setResetError(""); setDeleteError(""); }

  async function handleCreate() {
    setError("");
    if (!form.name.trim() || !form.email.trim() || !form.username.trim() || !form.password.trim()) {
      setError("Fill in name, email, username, and password."); return;
    }
    setSubmitting(true);
    const { data, error: fnError } = await supabase.functions.invoke("create-staff-account", {
      body: { name: form.name.trim(), email: form.email.trim(), username: form.username.trim(), password: form.password, role: form.role },
    });
    setSubmitting(false);
    const message = fnError?.message || data?.error;
    if (message) { setError(message); return; }
    resetForm();
    setShowForm(false);
    if (refreshAccounts) refreshAccounts();
  }

  // Editing name/username/role updates `profiles` directly — RLS already lets
  // an admin do this, so no Edge Function needed for this part.
  function startEdit(a) { closeAllRowActions(); setEditingId(a.id); setEditForm({ name: a.name, username: a.username, role: a.role }); }
  async function saveEdit(id) {
    setEditError("");
    if (!editForm.name.trim() || !editForm.username.trim()) { setEditError("Name and username can't be empty."); return; }
    setEditSubmitting(true);
    const { error: updateErr } = await supabase.from("profiles")
      .update({ name: editForm.name.trim(), username: editForm.username.trim().toLowerCase(), role: editForm.role })
      .eq("id", id);
    setEditSubmitting(false);
    if (updateErr) { setEditError(updateErr.message); return; }
    setEditingId(null);
    if (refreshAccounts) refreshAccounts();
  }

  function startReset(a) { closeAllRowActions(); setResettingId(a.id); setNewPassword(""); }
  async function saveReset(id) {
    setResetError("");
    setResetSubmitting(true);
    const { data, error: fnError } = await supabase.functions.invoke("manage-staff-account", { body: { action: "reset_password", id, password: newPassword } });
    setResetSubmitting(false);
    const message = fnError?.message || data?.error;
    if (message) { setResetError(message); return; }
    setResettingId(null);
    setNewPassword("");
  }

  function startDelete(a) { closeAllRowActions(); setDeletingId(a.id); }
  async function confirmDelete(id) {
    setDeleteError("");
    setDeleteSubmitting(true);
    const { data, error: fnError } = await supabase.functions.invoke("manage-staff-account", { body: { action: "delete", id } });
    setDeleteSubmitting(false);
    const message = fnError?.message || data?.error;
    if (message) { setDeleteError(message); return; }
    setDeletingId(null);
    if (refreshAccounts) refreshAccounts();
  }

  return (
    <div style={{ padding: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <div><div style={settingsStyles.eyebrow}>ADMIN · STAFF ACCOUNTS</div><h1 style={settingsStyles.h1}>Manage logins</h1><p style={settingsStyles.sub}>Create real login credentials and assign Admin, Doctor, Receptionist, or Appointment Desk rights.</p></div>
        <button style={settingsStyles.editBtn} type="button" onClick={() => (showForm ? (resetForm(), setShowForm(false)) : (closeAllRowActions(), setShowForm(true)))}>{showForm ? "Cancel" : "+ Add account"}</button>
      </div>

      {showForm && (
        <div style={settingsStyles.staffForm}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0B3B36", textTransform: "uppercase", letterSpacing: "0.03em" }}>New account</div>
          <label style={settingsStyles.label}>Full name<input style={settingsStyles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dr. New Doctor" /></label>
          <label style={settingsStyles.label}>Email (used to log in)<input style={settingsStyles.input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="e.g. drnew@clinic.com" /></label>
          <label style={settingsStyles.label}>Username (display handle)<input style={settingsStyles.input} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="e.g. drnew" /></label>
          <label style={settingsStyles.label}>Password<input style={settingsStyles.input} type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" /></label>
          <label style={settingsStyles.label}>Rights
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["admin", "doctor", "receptionist", "appointment"].map((r) => (
                <button key={r} type="button" onClick={() => setForm({ ...form, role: r })} style={{ ...settingsStyles.roleChipOpt, ...(form.role === r ? settingsStyles.roleChipOptActive : {}) }}>{roleLabel[r]}</button>
              ))}
            </div>
          </label>
          {error && <div style={{ fontSize: 12, color: "#9B2C2C" }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={settingsStyles.saveBtn} type="button" onClick={handleCreate} disabled={submitting}>{submitting ? "Creating…" : "Create account"}</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {accounts.length === 0 && <div style={settingsStyles.sub}>No staff accounts found yet.</div>}
        {accounts.map((a) => {
          const isSelf = a.id === session?.id;
          const isEditing = editingId === a.id;
          const isResetting = resettingId === a.id;
          const isDeleting = deletingId === a.id;
          return (
            <div key={a.id} style={settingsStyles.staffRow}>
              {!isEditing && !isResetting && !isDeleting && (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1B2320" }}>{a.name}{isSelf && <span style={{ fontWeight: 500, color: "#7A8380" }}> (you)</span>}</div>
                    <div style={{ fontSize: 12, color: "#7A8380", marginTop: 2 }}>@{a.username} · {roleLabel[a.role]}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button style={settingsStyles.editStaffBtn} onClick={() => startEdit(a)}><Pencil size={12} style={{ marginRight: 5 }} />Edit</button>
                    <button style={settingsStyles.editStaffBtn} onClick={() => startReset(a)}>Reset password</button>
                    {!isSelf && <button style={settingsStyles.removeStaffBtn} onClick={() => startDelete(a)}>Delete</button>}
                  </div>
                </>
              )}

              {isEditing && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
                  <label style={settingsStyles.label}>Full name<input style={settingsStyles.input} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label>
                  <label style={settingsStyles.label}>Username<input style={settingsStyles.input} value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} /></label>
                  <label style={settingsStyles.label}>Rights
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {["admin", "doctor", "receptionist", "appointment"].map((r) => (
                        <button key={r} type="button" disabled={isSelf && r !== "admin"} onClick={() => setEditForm({ ...editForm, role: r })} style={{ ...settingsStyles.roleChipOpt, ...(editForm.role === r ? settingsStyles.roleChipOptActive : {}), ...(isSelf && r !== "admin" ? { opacity: 0.4, cursor: "not-allowed" } : {}) }}>{roleLabel[r]}</button>
                      ))}
                    </div>
                    {isSelf && <div style={{ fontSize: 11, color: "#7A8380", marginTop: 4 }}>You can't change your own account away from Admin — have another admin do it.</div>}
                  </label>
                  {editError && <div style={{ fontSize: 12, color: "#9B2C2C" }}>{editError}</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={settingsStyles.saveBtn} type="button" onClick={() => saveEdit(a.id)} disabled={editSubmitting}>{editSubmitting ? "Saving…" : "Save changes"}</button>
                    <button style={settingsStyles.editStaffBtn} type="button" onClick={closeAllRowActions}>Cancel</button>
                  </div>
                </div>
              )}

              {isResetting && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
                  <label style={settingsStyles.label}>New password for {a.name}<input style={settingsStyles.input} type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" /></label>
                  {resetError && <div style={{ fontSize: 12, color: "#9B2C2C" }}>{resetError}</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={settingsStyles.saveBtn} type="button" onClick={() => saveReset(a.id)} disabled={resetSubmitting}>{resetSubmitting ? "Saving…" : "Set new password"}</button>
                    <button style={settingsStyles.editStaffBtn} type="button" onClick={closeAllRowActions}>Cancel</button>
                  </div>
                </div>
              )}

              {isDeleting && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
                  <div style={{ fontSize: 13, color: "#9B2C2C" }}>Delete {a.name}'s login? This removes their access immediately and can't be undone.</div>
                  {deleteError && <div style={{ fontSize: 12, color: "#9B2C2C" }}>{deleteError}</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={settingsStyles.removeStaffBtn} type="button" onClick={() => confirmDelete(a.id)} disabled={deleteSubmitting}>{deleteSubmitting ? "Deleting…" : "Yes, delete"}</button>
                    <button style={settingsStyles.editStaffBtn} type="button" onClick={closeAllRowActions}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoomSetupPanel({ rooms, setRooms }) {
  const roomTypes = ["General", "Private", "Deluxe", "Super Deluxe"];
  const [number, setNumber] = useState("");
  const [type, setType] = useState(roomTypes[0]);
  const [error, setError] = useState("");

  function handleAdd() {
    const num = number.trim();
    if (!num) { setError("Enter a room number."); return; }
    if (rooms.some((r) => r.number.toLowerCase() === num.toLowerCase())) { setError("That room number already exists."); return; }
    setRooms((prev) => [...prev, { number: num, type, status: "empty" }]);
    setNumber("");
    setError("");
    supabase.from("rooms").insert({ number: num, type, status: "empty" }).then(({ error }) => { if (error) console.error("Failed to save room", error); });
  }
  function handleRemove(num) {
    const room = rooms.find((r) => r.number === num);
    if (room?.status === "occupied") { setError("Discharge the patient before removing this room."); return; }
    setRooms((prev) => prev.filter((r) => r.number !== num));
    setError("");
    supabase.from("rooms").delete().eq("number", num).then(({ error }) => { if (error) console.error("Failed to remove room", error); });
  }

  const grouped = roomTypes.map((t) => ({ type: t, list: rooms.filter((r) => r.type === t) }));

  return (
    <div style={{ padding: 4 }}>
      <div style={settingsStyles.eyebrow}>ADMIN · ROOM SETUP</div>
      <h1 style={settingsStyles.h1}>Rooms</h1>
      <p style={settingsStyles.sub}>Add or remove room slots. Only admin controls how many rooms exist — doctors and reception can still admit/discharge into existing rooms from the IPD tab.</p>

      <div style={settingsStyles.staffForm}>
        <label style={settingsStyles.label}>Room number<input style={settingsStyles.input} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. G-104" /></label>
        <label style={settingsStyles.label}>Room type
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {roomTypes.map((t) => <button key={t} type="button" onClick={() => setType(t)} style={{ ...settingsStyles.roleChipOpt, ...(type === t ? settingsStyles.roleChipOptActive : {}) }}>{t}</button>)}
          </div>
        </label>
        {error && <div style={{ fontSize: 12, color: "#9B2C2C" }}>{error}</div>}
        <button style={settingsStyles.saveBtn} type="button" onClick={handleAdd}>Add room</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {grouped.map((g) => (
          <div key={g.type}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#1B2320", marginBottom: 8 }}>{g.type} <span style={{ fontSize: 11, color: "#8A928F" }}>({g.list.length})</span></div>
            {g.list.length === 0 ? (
              <div style={{ fontSize: 12, color: "#8A928F", fontStyle: "italic" }}>No rooms in this category.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {g.list.map((r) => (
                  <div key={r.number} style={settingsStyles.roomChip}>
                    <span>{r.number}{r.status === "occupied" ? " · occupied" : ""}</span>
                    <button style={settingsStyles.roomChipRemove} onClick={() => handleRemove(r.number)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PrintSettingsPanel({ printSettings, setPrintSettings }) {
  const [draft, setDraft] = useState(printSettings);
  const [saved, setSaved] = useState(false);
  const sections = [
    ["includeClinicHeader", "Clinic name/address header — turn off if printing on pre-printed letterhead"],
    ["includeComplaints", "Chief complaints"], ["includeFindings", "Findings"], ["includeDiagnosis", "Diagnosis"],
    ["includeMedications", "Medications"], ["includeInvestigations", "Investigations"], ["includeInstructions", "Instructions"],
    ["includeVaccination", "Vaccination status"], ["includeFollowUp", "Follow-up"], ["includeGrowthChart", "Growth chart placeholder"],
  ];
  function toggle(key) { setDraft((d) => ({ ...d, [key]: !d[key] })); }
  function save() {
    setPrintSettings(draft); setSaved(true);
    supabase.from("print_settings").update(printSettingsToDb(draft)).eq("id", true).then(({ error }) => { if (error) console.error("Failed to save print settings", error); });
  }

  return (
    <div style={{ padding: 4 }}>
      <div style={settingsStyles.eyebrow}>ADMIN · PRINT SETTINGS</div>
      <h1 style={settingsStyles.h1}>Prescription print layout</h1>
      <p style={settingsStyles.sub}>Controls margins and which sections appear on every printed prescription — typed and handwritten.</p>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#3C4441", margin: "16px 0 8px" }}>Page margins (mm)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        <label style={settingsStyles.label}>Top<input style={settingsStyles.input} type="number" min="0" value={draft.marginTop} onChange={(e) => setDraft({ ...draft, marginTop: Number(e.target.value) })} /></label>
        <label style={settingsStyles.label}>Bottom<input style={settingsStyles.input} type="number" min="0" value={draft.marginBottom} onChange={(e) => setDraft({ ...draft, marginBottom: Number(e.target.value) })} /></label>
        <label style={settingsStyles.label}>Left<input style={settingsStyles.input} type="number" min="0" value={draft.marginLeft} onChange={(e) => setDraft({ ...draft, marginLeft: Number(e.target.value) })} /></label>
        <label style={settingsStyles.label}>Right<input style={settingsStyles.input} type="number" min="0" value={draft.marginRight} onChange={(e) => setDraft({ ...draft, marginRight: Number(e.target.value) })} /></label>
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#3C4441", marginBottom: 8 }}>Sections to include on print</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        {sections.map(([key, label]) => (
          <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#1B2320" }}>
            <input type="checkbox" checked={!!draft[key]} onChange={() => toggle(key)} /> {label}
          </label>
        ))}
      </div>

      {saved && <div style={settingsStyles.successBox}><Check size={14} style={{ marginRight: 6 }} />Saved. Applies to future prints.</div>}
      <button style={settingsStyles.editBtn} onClick={save}>Save print settings</button>
    </div>
  );
}

const settingsStyles = {
  page: { minHeight: "100vh", background: "#F6F5F1", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", padding: "28px 16px", boxSizing: "border-box", display: "flex", justifyContent: "center" },
  card: { width: "100%", maxWidth: 480, background: "#fff", border: "1px solid #E8E6DF", borderRadius: 14, padding: 26, boxSizing: "border-box" },
  cardWide: { width: "100%", maxWidth: 560, background: "#fff", border: "1px solid #E8E6DF", borderRadius: 14, padding: 22, boxSizing: "border-box" },
  subTabBar: { display: "flex", gap: 6, marginBottom: 18, borderBottom: "1px solid #EEECE5", paddingBottom: 4 },
  subTabBtn: { fontSize: 12.5, fontWeight: 600, color: "#8A928F", background: "none", border: "none", borderBottom: "2px solid transparent", padding: "8px 10px", cursor: "pointer" },
  subTabBtnActive: { color: "#0B3B36", borderBottom: "2px solid #0B3B36" },
  staffForm: { display: "flex", flexDirection: "column", gap: 12, background: "#F6F5F1", border: "1px solid #EEECE5", borderRadius: 10, padding: 16, marginBottom: 16 },
  staffBackendNote: { fontSize: 11.5, lineHeight: 1.5, color: "#7A5B1F", background: "#FFF8E6", border: "1px solid #F0DFA8", borderRadius: 10, padding: "10px 12px", marginBottom: 16 },
  staffRow: { display: "flex", alignItems: "center", gap: 10, background: "#F6F5F1", border: "1px solid #EEECE5", borderRadius: 10, padding: "11px 12px" },
  auditRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#F6F5F1", border: "1px solid #EEECE5", borderRadius: 10, padding: "11px 12px" },
  removeStaffBtn: { fontSize: 11.5, fontWeight: 600, color: "#9B2C2C", background: "#FDECEC", border: "1px solid #F5C6C6", borderRadius: 7, padding: "6px 11px", cursor: "pointer", whiteSpace: "nowrap" },
  editStaffBtn: { display: "flex", alignItems: "center", fontSize: 11.5, fontWeight: 600, color: "#0B3B36", background: "#fff", border: "1px solid #E8E6DF", borderRadius: 7, padding: "6px 11px", cursor: "pointer", whiteSpace: "nowrap" },
  roomChip: { display: "flex", alignItems: "center", gap: 8, background: "#F6F5F1", border: "1px solid #EEECE5", borderRadius: 20, padding: "6px 8px 6px 12px", fontSize: 12.5, fontWeight: 600, color: "#1B2320" },
  roomChipRemove: { display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid #DCD9D0", borderRadius: "50%", width: 18, height: 18, fontSize: 10, color: "#9B2C2C", cursor: "pointer", padding: 0 },
  roleChipOpt: { fontSize: 12, fontWeight: 600, color: "#5B635F", background: "#fff", border: "1px solid #DCD9D0", borderRadius: 20, padding: "6px 12px", cursor: "pointer" },
  roleChipOptActive: { background: "#0B3B36", border: "1px solid #0B3B36", color: "#fff" },
  header: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 22 },
  iconBadge: { width: 40, height: 40, borderRadius: 10, background: "#E7EFEC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#0B3B36", marginBottom: 3 },
  h1: { fontSize: 19, fontWeight: 700, color: "#1B2320", margin: "0 0 4px" },
  sub: { fontSize: 12.5, color: "#8A928F", margin: 0, lineHeight: 1.5 },
  infoGrid: { display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 },
  successBox: { display: "flex", alignItems: "center", background: "#EAF5EF", border: "1px solid #BEE3CD", color: "#1E6B45", fontSize: 12.5, padding: "10px 12px", borderRadius: 8, marginBottom: 16, fontWeight: 600 },
  editBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", background: "#0B3B36", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  label: { display: "flex", flexDirection: "column", fontSize: 13, fontWeight: 600, color: "#3C4441", gap: 6 },
  input: { fontSize: 14.5, padding: "10px 12px", borderRadius: 8, border: "1px solid #DCD9D0", fontFamily: "inherit", color: "#1B2320", boxSizing: "border-box", width: "100%" },
  formActions: { display: "flex", gap: 10, marginTop: 4 },
  saveBtn: { flex: 1, background: "#0B3B36", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  cancelBtn: { background: "#fff", color: "#5B635F", border: "1px solid #DCD9D0", borderRadius: 8, padding: "11px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
};

/* ============================================================================
   SHELL / LOGIN STYLES
   ========================================================================== */
const styles = {
  loginPage: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F6F5F1", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", padding: 20, boxSizing: "border-box" },
  loginCard: { width: "100%", maxWidth: 380, background: "#fff", borderRadius: 14, padding: "30px 26px", border: "1px solid #E8E6DF", boxSizing: "border-box" },
  brandRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 22 },
  brandMark: { width: 38, height: 38, borderRadius: 9, background: "#E7EFEC", display: "flex", alignItems: "center", justifyContent: "center" },
  brandTitle: { fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", color: "#0B3B36" },
  brandSub: { fontSize: 11.5, color: "#7A8380", marginTop: 1 },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  label: { display: "flex", flexDirection: "column", fontSize: 12.5, fontWeight: 600, color: "#3C4441", gap: 6 },
  input: { fontSize: 14, padding: "9px 11px", borderRadius: 8, border: "1px solid #DCD9D0", fontFamily: "inherit", boxSizing: "border-box", width: "100%" },
  passwordWrap: { position: "relative" },
  eyeBtn: { position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#8A928F" },
  errorBox: { background: "#FDECEC", color: "#9B2C2C", fontSize: 12.5, padding: "8px 11px", borderRadius: 8, border: "1px solid #F5C6C6" },
  submitBtn: { background: "#0B3B36", color: "#fff", fontSize: 14, fontWeight: 600, padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer" },
  demoBox: { marginTop: 20, background: "#F6F5F1", borderRadius: 10, padding: "12px 14px" },
  demoTitle: { fontSize: 11, fontWeight: 700, color: "#5B635F", marginBottom: 6, textTransform: "uppercase" },
  demoRow: { fontSize: 12, color: "#5B635F", lineHeight: 1.7 },
  shellPage: { height: "100dvh", display: "flex", flexDirection: "column", background: "#F6F5F1", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", overflow: "hidden" },
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "#fff", borderBottom: "1px solid #E8E6DF", flexShrink: 0 },
  topBarBrand: { display: "flex", alignItems: "center", gap: 7 },
  topBarBrandText: { fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", color: "#0B3B36" },
  topBarUser: { display: "flex", alignItems: "center", gap: 8 },
  userBadge: { display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: "#0B3B36", background: "#E7EFEC", padding: "3px 8px", borderRadius: 20 },
  userName: { fontSize: 12, fontWeight: 600, color: "#3C4441" },
  logoutBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, background: "#F6F5F1", border: "1px solid #E8E6DF", borderRadius: 8, color: "#5B635F", cursor: "pointer" },
  content: { flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "20px 16px 90px" },
  bottomNav: { position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", background: "#fff", borderTop: "1px solid #E8E6DF", padding: "6px 4px" },
  navBtn: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 2px", background: "none", border: "none", color: "#8A928F", cursor: "pointer" },
  navBtnActive: { color: "#0B3B36" },
  navLabel: { fontSize: 9.5, fontWeight: 600 },
  comingSoonWrap: { maxWidth: 320, margin: "60px auto 0", textAlign: "center" },
  comingSoonIcon: { width: 54, height: 54, borderRadius: "50%", background: "#F1F1EF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" },
  comingSoonTitle: { fontSize: 16, fontWeight: 700, color: "#1B2320", marginBottom: 6 },
  comingSoonText: { fontSize: 12.5, color: "#8A928F", lineHeight: 1.6 },
};
