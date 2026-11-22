import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { CalendarCheck, UserRound, Stethoscope, ChevronDown, ChevronUp, CheckCircle2, XCircle } from "lucide-react";
import { selectToken } from "../../features/auth/authSlice";
import { api } from "../../utils/api";
import PaymentInfo from "../../components/admin/Appointments/PaymentInfo";
import { paymentReadyForApproval, PAYMENT_STATUS_META } from "../../utils/payment";

function calcAge(dob) {
    if (!dob) return null;
    return Math.floor((Date.now() - new Date(dob)) / (1000 * 60 * 60 * 24 * 365.25));
}

function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_TABS = [
    { value: "pending_admin_review", label: "Pending Review" },
    { value: "confirmed",            label: "Confirmed" },
    { value: "completed",            label: "Completed" },
    { value: "rejected",             label: "Rejected" },
    { value: "cancelled",            label: "Cancelled" },
    { value: "no_show",              label: "No Show" },
    { value: "all",                  label: "All" },
];

const STATUS_BADGE = {
    pending_admin_review: "bg-yellow-100 text-yellow-800",
    confirmed:            "bg-blue-100 text-blue-700",
    completed:            "bg-green-100 text-green-700",
    rejected:             "bg-red-100 text-red-700",
    cancelled:            "bg-gray-100 text-gray-600",
    no_show:              "bg-gray-100 text-gray-600",
};

const EMPTY_FILTERS = { specialty: "", date_from: "", date_to: "", payment_status: "" };

const fieldCls = "w-full px-4 py-2.5 rounded-xl border border-gray-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#264296] text-sm";

export default function AppointmentReview() {
    const token = useSelector(selectToken);

    const [appointments, setAppointments] = useState([]);
    const [total,        setTotal]        = useState(0);
    const [loading,      setLoading]      = useState(true);
    const [error,        setError]        = useState(null);

    const [status,       setStatus]       = useState("pending_admin_review");
    const [search,       setSearch]       = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [filters,      setFilters]      = useState(EMPTY_FILTERS);
    const [specialties,  setSpecialties]  = useState([]);

    // per-card state for the inline rejection form
    const [rejecting,  setRejecting]  = useState({});
    // per-card lock while approve call is in flight
    const [approving,  setApproving]  = useState({});

    useEffect(() => {
        api.get("/api/doctors/specialties")
            .then(data => setSpecialties(data.specialties ?? []))
            .catch(() => {});
    }, []);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        if (!token) return;
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ status, limit: 50 });
        if (debouncedSearch) params.set("search", debouncedSearch);
        Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });

        // Ignore responses from superseded requests (e.g. quickly switching tabs)
        let cancelled = false;
        api.get(`/api/appointments/admin?${params}`, token)
            .then(data => {
                if (cancelled) return;
                setAppointments(data.results ?? []);
                setTotal(data.total ?? 0);
            })
            .catch(err => { if (!cancelled) setError(err.message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [token, status, debouncedSearch, filters]);

    const setFilter = (key) => (e) => setFilters(f => ({ ...f, [key]: e.target.value }));
    const hasFilters = search || Object.values(filters).some(Boolean);
    const tabLabel = STATUS_TABS.find(t => t.value === status)?.label ?? status;

    // After approve/reject: drop it from the pending tab, or update it in place elsewhere
    function applyDecision(id, updated) {
        if (status === "pending_admin_review") {
            setAppointments(prev => prev.filter(a => a._id !== id));
            setTotal(prev => Math.max(0, prev - 1));
        } else {
            setAppointments(prev => prev.map(a => a._id === id
                ? { ...a, status: updated.status, payment: updated.payment ?? a.payment }
                : a));
        }
    }

    function updatePayment(id, payment) {
        setAppointments(prev => prev.map(a => a._id === id ? { ...a, payment } : a));
    }

    async function handleApprove(appt) {
        setApproving(prev => ({ ...prev, [appt._id]: true }));
        try {
            const data = await api.patch(`/api/appointments/admin/${appt._id}/review`, { decision: "approve" }, token);
            applyDecision(appt._id, data.appointment ?? { status: "confirmed" });
        } catch (err) {
            alert(`Approval failed: ${err.message}`);
        } finally {
            setApproving(prev => ({ ...prev, [appt._id]: false }));
        }
    }

    function openReject(id) {
        setRejecting(prev => ({ ...prev, [id]: { open: true, reason: "", submitting: false, err: "" } }));
    }

    function closeReject(id) {
        setRejecting(prev => ({ ...prev, [id]: { open: false, reason: "", submitting: false, err: "" } }));
    }

    function setReason(id, reason) {
        setRejecting(prev => ({ ...prev, [id]: { ...prev[id], reason } }));
    }

    async function handleReject(appt) {
        const rj = rejecting[appt._id] ?? {};
        if (!rj.reason?.trim()) {
            setRejecting(prev => ({ ...prev, [appt._id]: { ...prev[appt._id], err: "Rejection reason is required." } }));
            return;
        }
        setRejecting(prev => ({ ...prev, [appt._id]: { ...prev[appt._id], submitting: true, err: "" } }));
        try {
            const data = await api.patch(`/api/appointments/admin/${appt._id}/review`, { decision: "reject", rejection_reason: rj.reason.trim() }, token);
            applyDecision(appt._id, data.appointment ?? { status: "rejected" });
            closeReject(appt._id);
        } catch (err) {
            setRejecting(prev => ({ ...prev, [appt._id]: { ...prev[appt._id], submitting: false, err: err.message } }));
        }
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold text-slate-800">Appointment Review</h1>
                    {!loading && (
                        <span className="bg-yellow-100 text-yellow-800 text-sm font-semibold px-3 py-1 rounded-full">
                            {total} {status === "all" ? "total" : tabLabel.toLowerCase()}
                        </span>
                    )}
                </div>
                <p className="text-gray-500 mt-1">
                    Verify payments and approve or reject appointments before the doctor gains access.
                </p>
            </div>

            {/* Status tabs */}
            <div className="flex flex-wrap gap-2">
                {STATUS_TABS.map(t => (
                    <button
                        key={t.value}
                        type="button"
                        onClick={() => setStatus(t.value)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                            status === t.value
                                ? "bg-[#264296] text-white"
                                : "bg-white border border-gray-200 text-slate-600 hover:bg-slate-50"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Search + filters */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="grid grid-cols-1 lg:grid-cols-6 gap-3 items-end">
                    <label className="text-xs font-semibold text-gray-500 lg:col-span-2">
                        Search
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Patient name / email or doctor name…"
                            className={`${fieldCls} mt-1`}
                        />
                    </label>
                    <label className="text-xs font-semibold text-gray-500">
                        Specialty
                        <select value={filters.specialty} onChange={setFilter("specialty")} className={`${fieldCls} mt-1`}>
                            <option value="">All specialties</option>
                            {specialties.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </label>
                    <label className="text-xs font-semibold text-gray-500">
                        Slot from
                        <input type="date" value={filters.date_from} max={filters.date_to || undefined}
                            onChange={setFilter("date_from")} className={`${fieldCls} mt-1`} />
                    </label>
                    <label className="text-xs font-semibold text-gray-500">
                        Slot to
                        <input type="date" value={filters.date_to} min={filters.date_from || undefined}
                            onChange={setFilter("date_to")} className={`${fieldCls} mt-1`} />
                    </label>
                    <label className="text-xs font-semibold text-gray-500">
                        Payment
                        <select value={filters.payment_status} onChange={setFilter("payment_status")} className={`${fieldCls} mt-1`}>
                            <option value="">Any payment</option>
                            {Object.entries(PAYMENT_STATUS_META).map(([value, m]) => (
                                <option key={value} value={value}>{m.label}</option>
                            ))}
                        </select>
                    </label>
                </div>
                {hasFilters && (
                    <button
                        type="button"
                        onClick={() => { setSearch(""); setFilters(EMPTY_FILTERS); }}
                        className="mt-3 text-sm font-medium text-red-600 hover:text-red-700"
                    >
                        Clear filters
                    </button>
                )}
            </div>

            {loading && (
                <div className="py-20 text-center text-gray-400">Loading…</div>
            )}

            {!loading && error && (
                <div className="py-20 text-center text-red-500">{error}</div>
            )}

            {!loading && !error && appointments.length === 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-24 flex flex-col items-center gap-4">
                    <CalendarCheck size={44} className="text-gray-300" />
                    <p className="text-gray-400 font-medium">
                        {hasFilters
                            ? "No appointments match your filters."
                            : status === "pending_admin_review"
                                ? "No appointments pending review."
                                : status === "all"
                                    ? "No appointments yet."
                                    : `No ${tabLabel.toLowerCase()} appointments.`}
                    </p>
                </div>
            )}

            {!loading && !error && appointments.length > 0 && (
                <div className="space-y-4">
                    {appointments.map(appt => {
                        const p    = appt.patient_id;
                        const d    = appt.doctor_id;
                        const rj   = rejecting[appt._id] ?? {};
                        const busy = approving[appt._id] || rj.submitting;
                        const age  = calcAge(p?.dob);
                        const paymentOk = paymentReadyForApproval(appt.payment);

                        return (
                            <div key={appt._id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                                {/* Top row: Patient | Doctor | Slot | Actions */}
                                <div className="flex flex-col lg:flex-row lg:items-start gap-6">

                                    {/* Patient */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">Patient</p>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                                <UserRound size={20} className="text-[#264296]" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-slate-800 truncate">{p?.name || "—"}</p>
                                                <p className="text-xs text-gray-500">
                                                    {p?.gender && <span className="capitalize">{p.gender}</span>}
                                                    {age != null && <span> · {age} yrs</span>}
                                                </p>
                                                {p?.contact?.email && (
                                                    <p className="text-xs text-gray-400 truncate">{p.contact.email}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Doctor */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">Doctor</p>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                                                <Stethoscope size={20} className="text-green-600" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-slate-800 truncate">
                                                    {d?.user_id?.name || "—"}
                                                </p>
                                                <p className="text-xs text-gray-500 truncate">
                                                    {d?.specialty}
                                                    {d?.hospital_clinic && ` · ${d.hospital_clinic}`}
                                                </p>
                                                {d?.pmdc_number && (
                                                    <p className="text-xs text-gray-400">PMDC: {d.pmdc_number}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Requested Slot */}
                                    <div className="lg:w-52 shrink-0">
                                        <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">Requested Slot</p>
                                        <p className="font-semibold text-slate-800">{fmtDate(appt.requested_slot?.date)}</p>
                                        <p className="text-sm text-gray-500">
                                            {appt.requested_slot?.start_time}–{appt.requested_slot?.end_time}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1">Submitted {fmtDate(appt.created_at)}</p>
                                    </div>

                                    {/* Action buttons — only pending appointments can be reviewed */}
                                    {appt.status !== "pending_admin_review" ? (
                                        <div className="shrink-0 lg:pt-6">
                                            <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${STATUS_BADGE[appt.status] || "bg-gray-100 text-gray-600"}`}>
                                                {STATUS_TABS.find(t => t.value === appt.status)?.label ?? appt.status}
                                            </span>
                                        </div>
                                    ) : (
                                    <div className="flex items-center gap-3 shrink-0 lg:pt-6">
                                        <button
                                            type="button"
                                            disabled={busy || !paymentOk}
                                            title={paymentOk ? undefined : "Waiting for the patient's payment"}
                                            onClick={() => handleApprove(appt)}
                                            className="flex items-center gap-1.5 bg-[#264296] hover:bg-[#1e3480] disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
                                        >
                                            <CheckCircle2 size={16} />
                                            {approving[appt._id]
                                                ? "Approving…"
                                                : appt.payment?.required ? "Verify payment & Approve" : "Approve"}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy && !rj.open}
                                            onClick={() => rj.open ? closeReject(appt._id) : openReject(appt._id)}
                                            className="flex items-center gap-1.5 bg-white hover:bg-red-50 border border-red-200 text-red-600 disabled:opacity-50 px-4 py-2 rounded-xl text-sm font-semibold transition"
                                        >
                                            <XCircle size={16} />
                                            Reject
                                            {rj.open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </button>
                                    </div>
                                    )}
                                </div>

                                {/* Payment — the admin verifies it while approving */}
                                <div className="mt-5 pt-5 border-t border-gray-100">
                                    <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">Payment</p>
                                    <PaymentInfo
                                        appointmentId={appt._id}
                                        payment={appt.payment}
                                        token={token}
                                        onChange={(payment) => updatePayment(appt._id, payment)}
                                    />
                                </div>

                                {/* Inline rejection form */}
                                {rj.open && (
                                    <div className="mt-5 pt-5 border-t border-gray-100">
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                                            Rejection reason <span className="text-red-500">*</span>
                                        </label>
                                        <textarea
                                            rows={3}
                                            value={rj.reason}
                                            onChange={e => setReason(appt._id, e.target.value)}
                                            placeholder="Explain why this appointment is being rejected…"
                                            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                                        />
                                        {rj.err && (
                                            <p className="text-red-500 text-sm mt-1">{rj.err}</p>
                                        )}
                                        <div className="flex gap-3 mt-3">
                                            <button
                                                type="button"
                                                disabled={rj.submitting}
                                                onClick={() => handleReject(appt)}
                                                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-semibold transition"
                                            >
                                                {rj.submitting ? "Rejecting…" : "Confirm Rejection"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => closeReject(appt._id)}
                                                className="text-gray-500 hover:text-gray-700 px-4 py-2 rounded-xl text-sm font-medium transition"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
