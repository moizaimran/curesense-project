import { useEffect, useState } from "react";
import { X, History } from "lucide-react";
import { api } from "../../utils/api";

const STATUS_META = {
    pending_admin_review: { label: "Pending",   cls: "bg-yellow-100 text-yellow-700" },
    confirmed:            { label: "Ongoing",   cls: "bg-blue-100 text-blue-700"   },
    completed:            { label: "Completed", cls: "bg-green-100 text-green-700" },
    cancelled:            { label: "Cancelled", cls: "bg-red-100 text-red-700"     },
    rejected:             { label: "Rejected",  cls: "bg-red-100 text-red-700"     },
    no_show:              { label: "No Show",   cls: "bg-gray-100 text-gray-700"   },
};

export default function HistoryModal({ patientId, patientName, doctorProfileId, token, onClose }) {
    const [history, setHistory]   = useState([]);
    const [loading, setLoading]   = useState(true);
    const [error,   setError]     = useState(null);

    useEffect(() => {
        if (!patientId || !token) return;
        const params = doctorProfileId ? `?doctor_id=${doctorProfileId}` : "";
        api.get(`/api/patients/${patientId}/appointments${params}`, token)
            .then(data => setHistory(data))
            .catch(err  => setError(err.message))
            .finally(() => setLoading(false));
    }, [patientId, token, doctorProfileId]);

    function fmtDate(slot) {
        if (!slot) return "—";
        return new Date(slot.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl w-[580px] max-h-[80vh] flex flex-col shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-200 shrink-0">
                    <div className="flex items-center gap-2">
                        <History size={20} className="text-blue-600" />
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Visit History</h2>
                            <p className="text-sm text-gray-500 mt-0.5">All appointments with {patientName || "this patient"}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-gray-400 hover:text-gray-600">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading && <p className="text-center text-gray-400">Loading history…</p>}
                    {error   && <p className="text-center text-red-500">{error}</p>}
                    {!loading && !error && history.length === 0 && (
                        <p className="text-center text-gray-400">No visit history found.</p>
                    )}
                    {!loading && !error && history.length > 0 && (
                        <div className="space-y-3">
                            {history.map(appt => {
                                const meta = STATUS_META[appt.status] || { label: appt.status, cls: "bg-gray-100 text-gray-700" };
                                return (
                                    <div
                                        key={appt._id}
                                        className="flex items-center justify-between bg-slate-50 rounded-xl px-5 py-4 border border-slate-100"
                                    >
                                        <div>
                                            <p className="font-semibold text-slate-800 text-sm">
                                                {fmtDate(appt.requested_slot)} · {appt.requested_slot?.start_time}–{appt.requested_slot?.end_time}
                                            </p>
                                            {appt.feedback?.notes && (
                                                <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                                                    Notes: {appt.feedback.notes}
                                                </p>
                                            )}
                                        </div>
                                        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${meta.cls}`}>
                                            {meta.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
