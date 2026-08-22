import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { Users, Brain, TriangleAlert, FileCheck, UserRound, ChevronRight } from "lucide-react";
import WelcomeSection from "../components/Dashboard/WelcomeSection";
import SummaryCard from "../components/Dashboard/SummaryCard";
import { selectToken, selectUser } from "../features/auth/authSlice";
import { api } from "../utils/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcAge(dob) {
    if (!dob) return "—";
    return Math.floor((Date.now() - new Date(dob)) / (1000 * 60 * 60 * 24 * 365.25));
}

function fmtSlot(slot) {
    if (!slot) return "—";
    const d = new Date(slot.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    return `${d} · ${slot.start_time}–${slot.end_time}`;
}

const STATUS_META = {
    pending_admin_review: { label: "Pending",   cls: "bg-yellow-100 text-yellow-700" },
    confirmed:            { label: "Ongoing",   cls: "bg-blue-100 text-blue-700"   },
    completed:            { label: "Completed", cls: "bg-green-100 text-green-700" },
    cancelled:            { label: "Cancelled", cls: "bg-red-100 text-red-700"     },
    rejected:             { label: "Rejected",  cls: "bg-red-100 text-red-700"     },
    no_show:              { label: "No Show",   cls: "bg-gray-100 text-gray-700"   },
};

function StatusBadge({ status }) {
    const meta = STATUS_META[status] || { label: status, cls: "bg-gray-100 text-gray-700" };
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${meta.cls}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {meta.label}
        </span>
    );
}

// ── Appointment row used in both preview and tab lists ────────────────────────
function ApptRow({ appt, navigate }) {
    const patient = appt.patient_id;
    return (
        <tr className="border-b border-slate-100 hover:bg-blue-50 transition duration-150">
            <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                    {appt.has_unread_patient_query && (
                        <span
                            className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0 ring-2 ring-green-200"
                            title="Unread patient message"
                        />
                    )}
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <UserRound size={18} className="text-blue-600" />
                    </div>
                    <div>
                        <p className="font-semibold text-slate-800 text-sm">{patient?.name || "—"}</p>
                        <p className="text-xs text-gray-500">
                            {patient?.gender} · {calcAge(patient?.dob)} yrs
                        </p>
                    </div>
                </div>
            </td>
            <td className="px-5 py-4 text-sm text-slate-600">{fmtSlot(appt.requested_slot)}</td>
            <td className="px-5 py-4"><StatusBadge status={appt.status} /></td>
            <td className="px-5 py-4 text-right">
                <button
                    type="button"
                    onClick={() => navigate(`/cases/${appt._id}`, { state: { appointment: appt } })}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                >
                    Open Case →
                </button>
            </td>
        </tr>
    );
}

// ── Preview table (shown on overview, limit 5 rows) ───────────────────────────
function PreviewTable({ title, rows, onViewAll, navigate, emptyMsg }) {
    return (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-800">{title}</h2>
                <button type="button" onClick={onViewAll} className="text-blue-600 text-sm font-semibold hover:text-blue-700 flex items-center gap-1">
                    View All <ChevronRight size={16} />
                </button>
            </div>
            {rows.length === 0 ? (
                <p className="text-gray-400 text-sm py-4 text-center">{emptyMsg}</p>
            ) : (
                <table className="w-full">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Patient</th>
                            <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Appointment</th>
                            <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Status</th>
                            <th className="px-5 py-3" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(a => <ApptRow key={a._id} appt={a} navigate={navigate} />)}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// ── Full tab table (no row limit) ─────────────────────────────────────────────
function TabTable({ rows, loading, error, emptyMsg, navigate }) {
    if (loading) return <div className="py-12 text-center text-gray-400">Loading…</div>;
    if (error)   return <div className="py-12 text-center text-red-500">{error}</div>;
    if (rows.length === 0) return <div className="py-12 text-center text-gray-400">{emptyMsg}</div>;
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full">
                <thead className="bg-slate-50">
                    <tr>
                        <th className="text-left px-5 py-4 text-xs uppercase tracking-wider text-gray-500">Patient</th>
                        <th className="text-left px-5 py-4 text-xs uppercase tracking-wider text-gray-500">Appointment</th>
                        <th className="text-left px-5 py-4 text-xs uppercase tracking-wider text-gray-500">Status</th>
                        <th className="px-5 py-4" />
                    </tr>
                </thead>
                <tbody>
                    {rows.map(a => <ApptRow key={a._id} appt={a} navigate={navigate} />)}
                </tbody>
            </table>
        </div>
    );
}

// ── Tab button ────────────────────────────────────────────────────────────────
function Tab({ label, active, onClick, badge }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2 ${
                active
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600"
            }`}
        >
            {label}
            {badge > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${active ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"}`}>
                    {badge}
                </span>
            )}
        </button>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Dashboard() {
    const navigate       = useNavigate();
    const token          = useSelector(selectToken);
    const user           = useSelector(selectUser);
    const profileId      = user?.doctor_profile?.id;
    const tabSectionRef  = useRef(null);

    const [summary,          setSummary]         = useState({ total_patients: 0, ongoing: 0, pending_new: 0, completed: 0 });
    const [summaryLoading,   setSummaryLoading]  = useState(true);
    const [previewOngoing,   setPreviewOngoing]  = useState([]);
    const [previewCompleted, setPreviewCompleted]= useState([]);
    const [previewLoading,   setPreviewLoading]  = useState(true);

    const [activeTab,  setActiveTab]  = useState(null); // null = overview; else "all"|"new"|"ongoing"|"completed"
    const [tabData,    setTabData]    = useState([]);
    const [tabLoading, setTabLoading] = useState(false);
    const [tabError,   setTabError]   = useState(null);

    // ── Fetch summary counts ──────────────────────────────────────────────────
    useEffect(() => {
        if (!profileId || !token) return;
        setSummaryLoading(true);
        api.get(`/api/doctors/${profileId}/dashboard-summary`, token)
            .then(d => setSummary(d))
            .catch(() => {})
            .finally(() => setSummaryLoading(false));
    }, [profileId, token]);

    // ── Fetch overview preview lists (top 5 ongoing + top 5 completed) ────────
    useEffect(() => {
        if (!token) return;
        setPreviewLoading(true);
        Promise.all([
            api.get("/api/appointments/doctor?status=confirmed", token),
            api.get("/api/appointments/doctor?status=completed", token),
        ])
            .then(([ongoing, completed]) => {
                const sortUnread = arr =>
                    [...arr].sort((a, b) => (b.has_unread_patient_query ? 1 : 0) - (a.has_unread_patient_query ? 1 : 0));
                setPreviewOngoing(sortUnread(ongoing).slice(0, 5));
                setPreviewCompleted(completed.slice(0, 5));
            })
            .catch(() => {})
            .finally(() => setPreviewLoading(false));
    }, [token]);

    // ── Fetch full list when tab changes ──────────────────────────────────────
    useEffect(() => {
        if (!activeTab || !token) return;
        setTabLoading(true);
        setTabError(null);
        const statusMap = { new: "confirmed", ongoing: "confirmed", completed: "completed" };
        const status    = statusMap[activeTab];
        const url       = status ? `/api/appointments/doctor?status=${status}` : "/api/appointments/doctor";

        api.get(url, token)
            .then(data => {
                if (activeTab === "all") {
                    // Deduplicate by patient — show each patient once (latest appointment)
                    const seen = new Set();
                    const unique = data.filter(a => {
                        const pid = a.patient_id?._id;
                        if (!pid || seen.has(pid)) return false;
                        seen.add(pid);
                        return true;
                    });
                    setTabData(unique);
                } else if (activeTab === "new") {
                    // Cases the doctor hasn't opened yet (freshly approved or new)
                    setTabData(data.filter(a => !a.doctor_viewed));
                } else {
                    // Sort unread messages to the top, then by date
                    const sorted = [...data].sort(
                        (a, b) => (b.has_unread_patient_query ? 1 : 0) - (a.has_unread_patient_query ? 1 : 0)
                    );
                    setTabData(sorted);
                }
            })
            .catch(err => setTabError(err.message))
            .finally(() => setTabLoading(false));
    }, [activeTab, token]);

    function switchTab(tab) {
        setActiveTab(tab);
        setTimeout(() => tabSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }

    const TAB_EMPTY = {
        all:       "No assigned patients yet.",
        new:       "No new cases — all caught up.",
        ongoing:   "No ongoing appointments.",
        completed: "No completed appointments yet.",
    };

    return (
        <div className="p-8 space-y-8">
            <WelcomeSection />

            {/* ── Summary Cards ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-6">
                <SummaryCard
                    title="Total Assigned Patients"
                    value={summaryLoading ? "…" : summary.total_patients}
                    icon={<Users size={32} />}
                    onClick={() => switchTab("all")}
                />
                <SummaryCard
                    title="Pending / New"
                    value={summaryLoading ? "…" : summary.pending_new}
                    icon={<TriangleAlert size={32} />}
                    onClick={() => switchTab("new")}
                />
                <SummaryCard
                    title="Ongoing Diagnoses"
                    value={summaryLoading ? "…" : summary.ongoing}
                    icon={<Brain size={32} />}
                    onClick={() => switchTab("ongoing")}
                />
                <SummaryCard
                    title="Completed Cases"
                    value={summaryLoading ? "…" : summary.completed}
                    icon={<FileCheck size={32} />}
                    onClick={() => switchTab("completed")}
                />
            </div>

            {/* ── Overview Preview Lists ─────────────────────────────────────── */}
            {!activeTab && (
                <>
                    {previewLoading ? (
                        <div className="text-center text-gray-400 py-8">Loading cases…</div>
                    ) : (
                        <div className="space-y-6">
                            <PreviewTable
                                title="Ongoing Cases"
                                rows={previewOngoing}
                                onViewAll={() => switchTab("ongoing")}
                                navigate={navigate}
                                emptyMsg="No ongoing appointments yet."
                            />
                            <PreviewTable
                                title="Recently Completed"
                                rows={previewCompleted}
                                onViewAll={() => switchTab("completed")}
                                navigate={navigate}
                                emptyMsg="No completed appointments yet."
                            />
                        </div>
                    )}
                </>
            )}

            {/* ── Tab Section ────────────────────────────────────────────────── */}
            <div ref={tabSectionRef} className="space-y-5">
                <div className="flex gap-3 flex-wrap">
                    {[
                        { key: "all",       label: "All Patients"                                        },
                        { key: "new",       label: "Pending / New",   badge: summary.pending_new         },
                        { key: "ongoing",   label: "Ongoing",         badge: summary.ongoing             },
                        { key: "completed", label: "Completed"                                           },
                    ].map(({ key, label, badge }) => (
                        <Tab
                            key={key}
                            label={label}
                            active={activeTab === key}
                            badge={badge}
                            onClick={() => activeTab === key ? setActiveTab(null) : setActiveTab(key)}
                        />
                    ))}
                    {activeTab && (
                        <button
                            type="button"
                            onClick={() => setActiveTab(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 ml-auto self-center"
                        >
                            ← Back to overview
                        </button>
                    )}
                </div>

                {activeTab && (
                    <TabTable
                        rows={tabData}
                        loading={tabLoading}
                        error={tabError}
                        emptyMsg={TAB_EMPTY[activeTab]}
                        navigate={navigate}
                    />
                )}
            </div>
        </div>
    );
}
