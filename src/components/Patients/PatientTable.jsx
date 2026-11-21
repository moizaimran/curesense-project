import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
// Redux fake-data usage commented out — component now uses the real API.
// import { useSelector } from "react-redux";
// const patients = useSelector((state) => state.patients.patients);

import { selectToken } from "../../features/auth/authSlice";
import { api } from "../../utils/api";
import { RatingBadge } from "../common/StarRating";

function calcAge(dob) {
    if (!dob) return "—";
    return Math.floor((Date.now() - new Date(dob)) / (1000 * 60 * 60 * 24 * 365.25));
}

function fmtSlot(slot) {
    if (!slot?.date) return "—";
    const d = new Date(slot.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    return `${d} · ${slot.start_time}–${slot.end_time}`;
}

const STATUS_META = {
    confirmed:  { label: "Ongoing",   cls: "bg-blue-100 text-blue-700"   },
    completed:  { label: "Completed", cls: "bg-green-100 text-green-700" },
    cancelled:  { label: "Cancelled", cls: "bg-red-100 text-red-700"     },
    no_show:    { label: "No Show",   cls: "bg-gray-100 text-gray-700"   },
};

function StatusBadge({ status }) {
    const m = STATUS_META[status] || { label: status, cls: "bg-gray-100 text-gray-700" };
    return (
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${m.cls}`}>{m.label}</span>
    );
}

// filters.status label → backend appointment status
const STATUS_MAP = {
    Ongoing:   "confirmed",
    Completed: "completed",
    Cancelled: "cancelled",
    "No Show": "no_show",
};

// "newest" keeps the API order (already latest slot first)
const SORTS = {
    newest: null,
    oldest: (a, b) => (a.requested_slot?.date || "").localeCompare(b.requested_slot?.date || ""),
    name:   (a, b) => (a.patient_id?.name || "").localeCompare(b.patient_id?.name || ""),
};

function needsAttention(appt) {
    return !!(appt.has_unread_patient_query || appt.has_new_test_upload);
}

const DEFAULT_FILTERS = { status: "All", gender: "", dateFrom: "", dateTo: "", needsAttention: false, sort: "newest" };

export default function PatientTable({ search = "", filters = DEFAULT_FILTERS, currentPage, setCurrentPage }) {
    const navigate = useNavigate();
    const token    = useSelector(selectToken);

    const [appointments, setAppointments] = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [error,        setError]        = useState(null);

    // Load all of the doctor's cases once; every filter below is applied client-side.
    useEffect(() => {
        if (!token) return;
        setLoading(true);
        api.get("/api/appointments/doctor", token)
            .then(data => setAppointments(Array.isArray(data) ? data : []))
            .catch(err  => setError(err.message))
            .finally(() => setLoading(false));
    }, [token]);

    const q      = search.trim().toLowerCase();
    const status = STATUS_MAP[filters.status];
    const sortFn = SORTS[filters.sort];
    const matches = appointments
        .filter(a => {
            const p    = a.patient_id || {};
            const date = a.requested_slot?.date || "";
            return (!q || [p.name, p.contact?.email, p.contact?.phone].join(" ").toLowerCase().includes(q))
                && (!status          || a.status === status)
                && (!filters.gender  || (p.gender || "").toLowerCase() === filters.gender)
                && (!filters.dateFrom || date >= filters.dateFrom)
                && (!filters.dateTo   || date <= filters.dateTo)
                && (!filters.needsAttention || needsAttention(a));
        });
    const filtered = sortFn ? [...matches].sort(sortFn) : matches;

    const perPage   = 5;
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    const safePage   = Math.min(currentPage, totalPages);
    const slice      = filtered.slice((safePage - 1) * perPage, safePage * perPage);

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ml-5">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">My Patients</h2>
                    <p className="text-gray-500 mt-1">
                        {loading ? "Appointments with your assigned patients." : `${filtered.length} of ${appointments.length} cases`}
                    </p>
                </div>
            </div>

            {loading && <div className="py-12 text-center text-gray-400">Loading…</div>}
            {!loading && error && <div className="py-12 text-center text-red-500">{error}</div>}

            {!loading && !error && (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200 text-left">
                                    <th className="py-4 text-sm font-semibold text-gray-500">Patient</th>
                                    <th className="py-4 text-sm font-semibold text-gray-500">Age</th>
                                    <th className="py-4 text-sm font-semibold text-gray-500">Gender</th>
                                    <th className="py-4 text-sm font-semibold text-gray-500">Status</th>
                                    <th className="py-4 text-sm font-semibold text-gray-500">Slot</th>
                                    <th className="py-4 text-sm font-semibold text-gray-500">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {slice.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-12 text-center text-gray-400">
                                            No patients found.
                                        </td>
                                    </tr>
                                ) : slice.map(appt => {
                                    const p = appt.patient_id;
                                    return (
                                        <tr key={appt._id} className="border-b border-gray-100 hover:bg-slate-50 transition">
                                            <td className="py-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-lg">
                                                        👤
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-slate-800">{p?.name || "—"}</p>
                                                        {p?.rating?.count > 0 && (
                                                            <RatingBadge rating={p.rating} className="mt-0.5" />
                                                        )}
                                                        {needsAttention(appt) && (
                                                            <span className="text-xs font-semibold text-orange-600">
                                                                {appt.has_unread_patient_query ? "New query" : "New test upload"}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-5 text-gray-600">{calcAge(p?.dob)}</td>
                                            <td className="py-5 text-gray-600 capitalize">{p?.gender || "—"}</td>
                                            <td className="py-5"><StatusBadge status={appt.status} /></td>
                                            <td className="py-5 text-gray-500 text-sm">{fmtSlot(appt.requested_slot)}</td>
                                            <td className="py-5">
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/cases/${appt._id}`, { state: { appointment: appt } })}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                                                >
                                                    Open Case →
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex justify-between items-center mt-6">
                        <button
                            type="button"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={safePage === 1}
                            className="px-4 py-2 border rounded-lg disabled:opacity-50 hover:bg-gray-100"
                        >
                            Previous
                        </button>
                        <div className="flex gap-2">
                            {[...Array(totalPages)].map((_, i) => (
                                <button
                                    type="button" key={i}
                                    onClick={() => setCurrentPage(i + 1)}
                                    className={`w-10 h-10 rounded-lg font-medium transition ${safePage === i + 1 ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"}`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={safePage === totalPages}
                            className="px-4 py-2 border rounded-lg disabled:opacity-50 hover:bg-gray-100"
                        >
                            Next
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
