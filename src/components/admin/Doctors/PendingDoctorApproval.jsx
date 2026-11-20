import { useEffect, useState } from "react";
import { UserCircle, Eye, ShieldCheck, ShieldAlert, ShieldX, ShieldOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectToken } from "../../../features/auth/authSlice";
import { api } from "../../../utils/api";

const PMDC_BADGE = {
    auto_approved: { label: "PMDC: Auto Approved", cls: "bg-green-100 text-green-700",  Icon: ShieldCheck },
    flagged:       { label: "PMDC: Needs Review",  cls: "bg-yellow-100 text-yellow-700", Icon: ShieldAlert },
    rejected:      { label: "PMDC: Mismatch",      cls: "bg-red-100 text-red-700",       Icon: ShieldX     },
    pending:       { label: "PMDC: Checking…",     cls: "bg-gray-100 text-gray-500",     Icon: ShieldOff   },
};

function PmdcBadge({ verification }) {
    const decision = verification?.decision || "pending";
    const { label, cls, Icon } = PMDC_BADGE[decision] || PMDC_BADGE.pending;
    const pct = verification?.confidence != null
        ? ` (${Math.round(verification.confidence * 100)}%)`
        : "";
    return (
        <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${cls}`}>
            <Icon size={13} />{label}{pct}
        </span>
    );
}

export default function PendingDoctorApprovals() {
    const navigate = useNavigate();
    const token    = useSelector(selectToken);

    const [doctors,  setDoctors]  = useState([]);
    const [loading,  setLoading]  = useState(true);

    useEffect(() => {
        if (!token) return;
        api.get("/api/doctors/admin/all?status=pending&limit=5", token)
            .then(data => setDoctors(data.results || []))
            .catch(() => setDoctors([]))
            .finally(() => setLoading(false));
    }, [token]);

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mt-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">
                        Pending Doctor Approval Requests
                    </h2>
                    <p className="text-gray-500 mt-1">
                        Review newly registered doctors before granting access.
                    </p>
                </div>
                <button
                    onClick={() => navigate("/admin/doctors")}
                    className="text-[#264296] font-semibold hover:underline"
                >
                    View All →
                </button>
            </div>

            <div className="space-y-5">
                {loading ? (
                    <p className="text-center text-gray-400 py-8">Loading…</p>
                ) : doctors.length === 0 ? (
                    <div className="text-center py-12">
                        <h3 className="text-xl font-semibold text-slate-700">No Pending Approval Requests</h3>
                        <p className="text-gray-500 mt-2">All registered doctors have been reviewed.</p>
                    </div>
                ) : (
                    doctors.map((doctor) => (
                        <div
                            key={doctor._id}
                            className="border border-gray-200 rounded-2xl p-6 flex justify-between items-center hover:shadow-md transition"
                        >
                            <div className="flex items-center gap-5">
                                <UserCircle size={60} className="text-[#264296]" />
                                <div>
                                    <h3 className="text-xl font-semibold text-slate-800">
                                        {doctor.user_id?.name || "—"}
                                    </h3>
                                    <p className="text-gray-500">{doctor.specialty}</p>
                                    <p className="text-gray-500">{doctor.hospital_clinic}</p>
                                    <p className="text-sm text-blue-700 mt-1">
                                        PMDC: {doctor.pmdc_number}
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <span className="px-4 py-2 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-700">
                                    Pending
                                </span>
                                <PmdcBadge verification={doctor.pmdc_verification} />
                                <button
                                    onClick={() => navigate(`/admin/doctors/${doctor._id}`)}
                                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl"
                                >
                                    <Eye size={18} />
                                    View
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
