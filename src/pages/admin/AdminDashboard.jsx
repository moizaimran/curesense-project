import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { UserCheck, Users, CalendarCheck, Wallet, ShieldCheck, Star, Filter } from "lucide-react";
import PendingDoctorApproval from "../../components/admin/Doctors/PendingDoctorApproval";
import DoctorRatingsTable from "../../components/admin/Dashboard/DoctorRatingsTable";
import PatientsTreatedChart from "../../components/Dashboard/PatientsTreatedChart";
import CaseOverview from "../../components/Dashboard/CaseOverview";
import { selectToken } from "../../features/auth/authSlice";
import { api } from "../../utils/api";
import { formatPKR } from "../../utils/payment";
import { greetingFor } from "../../utils/greeting";

// One KPI tile: sentence-case label, value, optional supporting line.
function Kpi({ label, value, sub, icon, onClick, tone = "text-blue-600 bg-blue-100" }) {
    const body = (
        <>
            <div className="min-w-0">
                <p className="text-gray-500 text-sm font-medium">{label}</p>
                <p className="text-3xl font-semibold text-slate-800 mt-1 truncate">{value}</p>
                {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
            </div>
            <div className={`h-12 w-12 shrink-0 rounded-xl flex items-center justify-center ${tone}`}>{icon}</div>
        </>
    );
    const cls = "bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex justify-between items-start gap-3 text-left";
    return onClick
        ? <button type="button" onClick={onClick} className={`${cls} hover:shadow-lg hover:border-blue-300 transition`}>{body}</button>
        : <div className={cls}>{body}</div>;
}

export default function AdminDashboard() {
    const token    = useSelector(selectToken);
    const navigate = useNavigate();

    const [doctorId, setDoctorId] = useState("");          // "" = all doctors
    const [summary,  setSummary]  = useState(null);
    const [table,    setTable]    = useState({ results: [], top_performers: [] });
    const [error,    setError]    = useState(null);

    // Doctor table (always platform-wide) — also feeds the filter dropdown
    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        api.get("/api/stats/doctors", token)
            .then((d) => { if (!cancelled) setTable(d); })
            .catch((err) => { if (!cancelled) setError(err.message); });
        return () => { cancelled = true; };
    }, [token]);

    // KPI summary for the current filter
    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        const qs = doctorId ? `?doctor_id=${doctorId}` : "";
        api.get(`/api/stats/summary${qs}`, token)
            .then((d) => { if (!cancelled) { setSummary(d); setError(null); } })
            .catch((err) => { if (!cancelled) setError(err.message); });
        return () => { cancelled = true; };
    }, [token, doctorId]);

    const qs = doctorId ? `?doctor_id=${doctorId}` : "";
    const selected = table.results.find((d) => String(d._id) === doctorId);
    const s = summary && (summary.doctor_id || "") === doctorId ? summary : null;   // ignore stale summaries
    const dash = "…";

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-4xl font-bold text-slate-800">{greetingFor()}, Admin 👋</h1>
                <p className="text-gray-500 mt-2">Platform analytics across all doctors.</p>
            </div>

            {/* Filter — one row above everything it scopes */}
            <div className="flex flex-wrap items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
                <Filter size={18} className="text-slate-400" />
                <label htmlFor="doctor-filter" className="text-sm font-semibold text-slate-700">Showing</label>
                <select
                    id="doctor-filter"
                    value={doctorId}
                    onChange={(e) => setDoctorId(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-sm min-w-64 focus:outline-none focus:ring-2 focus:ring-[#264296]"
                >
                    <option value="">All doctors (combined)</option>
                    {[...table.results].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                        <option key={d._id} value={String(d._id)}>{d.name} — {d.specialty}</option>
                    ))}
                </select>
                {doctorId && (
                    <button type="button" onClick={() => setDoctorId("")} className="text-sm font-medium text-red-600 hover:text-red-700">
                        Clear
                    </button>
                )}
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            {/* KPI tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {doctorId ? (
                    <Kpi
                        label="Doctor"
                        value={selected?.name ?? dash}
                        sub={selected ? `${selected.specialty} · fee ${selected.consultation_fee ? formatPKR(selected.consultation_fee) : "free"}` : null}
                        icon={<UserCheck size={24} />}
                    />
                ) : (
                    <Kpi
                        label="Doctors"
                        value={s ? s.doctors.verified : dash}
                        sub={s ? `${s.doctors.pending} awaiting approval · ${s.doctors.total} registered` : null}
                        icon={<UserCheck size={24} />}
                        onClick={() => navigate("/admin/doctors")}
                    />
                )}
                <Kpi
                    label={doctorId ? "Patients seen" : "Patients"}
                    value={s ? s.patients : dash}
                    icon={<Users size={24} />}
                    onClick={doctorId ? undefined : () => navigate("/admin/patients")}
                />
                <Kpi
                    label="Appointments"
                    value={s ? s.appointments.total : dash}
                    sub={s ? `${s.appointments.completed} completed · ${s.appointments.confirmed} active · ${s.appointments.pending_review} awaiting review` : null}
                    icon={<CalendarCheck size={24} />}
                    onClick={() => navigate("/admin/appointments")}
                />
                <Kpi
                    label="Revenue received"
                    value={s ? formatPKR(s.revenue.received) : dash}
                    sub={s ? `${formatPKR(s.revenue.received_this_month)} this month${s.revenue.refund_due.count ? ` · ${formatPKR(s.revenue.refund_due.amount)} refund due` : ""}` : null}
                    icon={<Wallet size={24} />}
                    tone="text-green-700 bg-green-100"
                />
                <Kpi
                    label="Pending payment verifications"
                    value={s ? s.payments.pending_verification.count : dash}
                    sub={s ? `${formatPKR(s.payments.pending_verification.amount)} to verify · ${s.payments.awaiting_patient} awaiting patient payment` : null}
                    icon={<ShieldCheck size={24} />}
                    tone={s?.payments.pending_verification.count ? "text-amber-700 bg-amber-100" : "text-blue-600 bg-blue-100"}
                    onClick={() => navigate("/admin/appointments")}
                />
                <Kpi
                    label={doctorId ? "Average rating" : "Average rating (all doctors)"}
                    value={s ? (s.rating.count ? `★ ${s.rating.average.toFixed(1)}` : "No ratings") : dash}
                    sub={s ? `from ${s.rating.count} patient review${s.rating.count === 1 ? "" : "s"}` : null}
                    icon={<Star size={24} />}
                    tone="text-amber-600 bg-amber-100"
                />
            </div>

            {/* Same charts as the doctor dashboard — combined, or one doctor.
                key= remounts them so a filter change never shows the previous doctor's data. */}
            <PatientsTreatedChart
                key={`treated-${doctorId}`}
                token={token}
                endpoint={`/api/stats/treated${qs}`}
                title={selected ? `Patients Treated — ${selected.name}` : "Patients Treated — All Doctors"}
            />
            <CaseOverview key={`overview-${doctorId}`} token={token} endpoint={`/api/stats/overview${qs}`} />

            <DoctorRatingsTable
                doctors={table.results}
                topPerformers={table.top_performers}
                selectedId={doctorId}
                onSelectDoctor={(id) => { setDoctorId(id); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            />

            <PendingDoctorApproval />
        </div>
    );
}
