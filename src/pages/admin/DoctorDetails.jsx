import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { ArrowLeft, CheckCircle, XCircle, Clock3 } from "lucide-react";
import CertificateModal from "../../components/admin/Doctors/CertificateModel";
import doctorPlaceholder from "../../assets/images/doctor-avatar.jpg";
import { selectToken } from "../../features/auth/authSlice";
import { api } from "../../utils/api";

function InfoItem({ title, value }) {
    return (
        <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="mt-1 text-lg font-semibold text-slate-800">{value || "—"}</p>
        </div>
    );
}

const STATUS_BADGE = {
    pending:  { label: "Pending",  cls: "bg-yellow-100 text-yellow-700", icon: Clock3       },
    verified: { label: "Approved", cls: "bg-green-100 text-green-700",   icon: CheckCircle  },
    rejected: { label: "Rejected", cls: "bg-red-100 text-red-700",       icon: XCircle      },
};

export default function DoctorDetails() {
    const { id }   = useParams();
    const navigate = useNavigate();
    const token    = useSelector(selectToken);

    const [doctor,           setDoctor]           = useState(null);
    const [loading,          setLoading]          = useState(true);
    const [error,            setError]            = useState(null);
    const [actionLoading,    setActionLoading]    = useState(false);
    const [showCertificate,  setShowCertificate]  = useState(false);
    const [showApproveModal, setShowApproveModal] = useState(false);
    const [showRejectModal,  setShowRejectModal]  = useState(false);
    const [rejectReason,     setRejectReason]     = useState("");

    useEffect(() => {
        async function fetchDoctor() {
            try {
                setLoading(true);
                // Admin endpoint returns full profile including sensitive fields
                const data = await api.get(`/api/doctors/${id}`, token);
                setDoctor(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchDoctor();
    }, [id, token]);

    const handleApprove = async () => {
        setActionLoading(true);
        try {
            const res = await api.patch(`/api/doctors/admin/${id}/verify`, { decision: "approve" }, token);
            setDoctor(res.profile);
            setShowApproveModal(false);
        } catch (err) {
            alert(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        if (!rejectReason.trim()) return;
        setActionLoading(true);
        try {
            const res = await api.patch(`/api/doctors/admin/${id}/verify`, { decision: "reject", rejection_reason: rejectReason }, token);
            setDoctor(res.profile);
            setShowRejectModal(false);
            setRejectReason("");
        } catch (err) {
            alert(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-gray-500">Loading doctor profile…</div>;
    if (error)   return <div className="p-8 text-red-600">Error: {error}</div>;
    if (!doctor) return null;

    const badge = STATUS_BADGE[doctor.status] || { label: doctor.status, cls: "bg-gray-100 text-gray-700", icon: Clock3 };
    const BadgeIcon = badge.icon;

    return (
        <div className="space-y-8">
            <button type="button" onClick={() => navigate(-1)}
                className="flex items-center gap-2 text-[#264296] hover:underline">
                <ArrowLeft size={18} /> Back to Manage Doctors
            </button>

            <div>
                <h1 className="text-3xl font-bold text-slate-800">Doctor Details</h1>
                <p className="text-gray-500 mt-2">Review doctor's information before approval.</p>
            </div>

            {/* Main card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                <div className="grid grid-cols-12 gap-10">
                    {/* Left */}
                    <div className="col-span-4 border-r border-gray-200 pr-8">
                        <div className="flex flex-col items-center">
                            <img src={doctorPlaceholder} alt="Doctor" className="w-40 h-40 rounded-full object-cover border-4 border-blue-100" />
                            <h2 className="text-2xl font-bold text-slate-800 mt-6">{doctor.specialty}</h2>
                            <p className="text-gray-500 mt-2">{doctor.hospital_clinic}</p>
                            <span className={`mt-6 px-5 py-2 rounded-full text-sm font-semibold flex items-center gap-2 ${badge.cls}`}>
                                <BadgeIcon size={16} /> {badge.label}
                            </span>
                        </div>
                    </div>

                    {/* Right */}
                    <div className="col-span-8 space-y-8">
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 mb-5">Contact Information</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <InfoItem title="Email"  value={doctor.contact?.email} />
                                <InfoItem title="Phone"  value={doctor.contact?.phone} />
                                <InfoItem title="City"   value={doctor.location?.city} />
                                <InfoItem title="Address" value={doctor.location?.address} />
                            </div>
                        </div>

                        <hr />

                        <div>
                            <h3 className="text-xl font-bold text-slate-800 mb-5">Professional Information</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <InfoItem title="Specialty"       value={doctor.specialty} />
                                <InfoItem title="Sub-Specialty"   value={doctor.sub_specialty} />
                                <InfoItem title="Hospital/Clinic" value={doctor.hospital_clinic} />
                                <InfoItem title="Experience"      value={doctor.experience_years != null ? `${doctor.experience_years} years` : null} />
                                <InfoItem title="PMDC License"    value={doctor.pmdc_number} />
                                <InfoItem title="Gender"          value={doctor.gender} />
                            </div>
                        </div>

                        {/* Education */}
                        {doctor.education?.length > 0 && (
                            <>
                                <hr />
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800 mb-5">Education</h3>
                                    <div className="space-y-3">
                                        {doctor.education.map((edu, i) => (
                                            <div key={i} className="flex items-center gap-3 text-slate-700">
                                                <span className="font-semibold">{edu.degree}</span>
                                                <span className="text-gray-400">·</span>
                                                <span>{edu.institution}</span>
                                                <span className="text-gray-400">·</span>
                                                <span>{edu.year}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Rejection reason (shown if rejected) */}
                        {doctor.status === "rejected" && doctor.rejection_reason && (
                            <>
                                <hr />
                                <div>
                                    <h3 className="text-xl font-bold text-red-700 mb-2">Rejection Reason</h3>
                                    <p className="text-gray-700">{doctor.rejection_reason}</p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <hr />

            {/* PMDC Certificate */}
            <div>
                <h3 className="text-xl font-bold text-slate-800 mb-5">PMDC Certificate</h3>
                <div className="border border-dashed border-gray-300 rounded-2xl p-6 flex justify-between items-center bg-slate-50">
                    <div>
                        <p className="font-semibold text-slate-800">PMDC Registration Certificate</p>
                        <p className="text-sm text-gray-500 mt-1">Uploaded by doctor during registration</p>
                    </div>
                    <button type="button" onClick={() => setShowCertificate(true)}
                        className="bg-[#264296] hover:bg-[#1f3578] text-white px-5 py-3 rounded-xl font-medium">
                        View Certificate
                    </button>
                </div>
            </div>

            <hr />

            {/* Approval actions — only shown while pending */}
            {doctor.status === "pending" && (
                <div>
                    <h3 className="text-xl font-bold text-slate-800 mb-5">Approval Actions</h3>
                    <div className="flex justify-end gap-4">
                        <button type="button" onClick={() => setShowRejectModal(true)}
                            className="px-8 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition">
                            Reject
                        </button>
                        <button type="button" onClick={() => setShowApproveModal(true)}
                            className="px-8 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold transition">
                            Approve
                        </button>
                    </div>
                </div>
            )}

            {/* Certificate modal */}
            <CertificateModal isOpen={showCertificate} onClose={() => setShowCertificate(false)}
                certificate={doctor.pmdc_certificate_url} />

            {/* Approve modal */}
            {showApproveModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl w-[420px] p-8">
                        <h2 className="text-2xl font-bold text-slate-800">Approve Doctor</h2>
                        <p className="mt-4 text-gray-500">
                            Approve <span className="font-semibold text-slate-700">{doctor.contact?.email}</span>?
                            They will immediately appear in patient search results.
                        </p>
                        <div className="flex justify-end gap-4 mt-8">
                            <button type="button" onClick={() => setShowApproveModal(false)}
                                className="px-5 py-2 rounded-lg border">Cancel</button>
                            <button type="button" onClick={handleApprove} disabled={actionLoading}
                                className="px-5 py-2 rounded-lg bg-green-600 text-white disabled:opacity-60">
                                {actionLoading ? "Approving…" : "Approve"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject modal */}
            {showRejectModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl w-[500px] p-8">
                        <h2 className="text-2xl font-bold text-slate-800">Reject Doctor</h2>
                        <p className="text-gray-500 mt-3">Please provide a reason for rejection.</p>
                        <textarea rows="5" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Write rejection reason…"
                            className="w-full mt-5 border rounded-xl p-4 outline-none focus:ring-2 focus:ring-red-500" />
                        <div className="flex justify-end gap-4 mt-8">
                            <button type="button" onClick={() => { setShowRejectModal(false); setRejectReason(""); }}
                                className="px-5 py-2 rounded-lg border">Cancel</button>
                            <button type="button" disabled={!rejectReason.trim() || actionLoading} onClick={handleReject}
                                className="px-5 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50">
                                {actionLoading ? "Rejecting…" : "Reject"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
