import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import {
    ArrowLeft, Brain, FileText, ImageIcon, Flag,
    MessageCircle, CheckCircle2, History, FileCheck,
    ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { selectToken, selectUser } from "../features/auth/authSlice";
import { api } from "../utils/api";
import QueryPanel    from "../components/CaseDiagnosis/QueryPanel";
import FeedbackModal from "../components/CaseDiagnosis/FeedbackModal";
import HistoryModal  from "../components/CaseDiagnosis/HistoryModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcAge(dob) {
    if (!dob) return "—";
    return Math.floor((Date.now() - new Date(dob)) / (1000 * 60 * 60 * 24 * 365.25));
}

function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

const STATUS_META = {
    pending_admin_review: { label: "Pending Review", cls: "bg-yellow-100 text-yellow-700" },
    confirmed:            { label: "Ongoing",        cls: "bg-blue-100 text-blue-700"     },
    completed:            { label: "Completed",      cls: "bg-green-100 text-green-700"   },
    cancelled:            { label: "Cancelled",      cls: "bg-red-100 text-red-700"       },
    rejected:             { label: "Rejected",       cls: "bg-red-100 text-red-700"       },
    no_show:              { label: "No Show",        cls: "bg-gray-100 text-gray-700"     },
};

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ icon, title, children }) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-center gap-3 mb-6">
                <div className="text-blue-600">{icon}</div>
                <h2 className="text-xl font-bold text-slate-800">{title}</h2>
            </div>
            {children}
        </div>
    );
}

// ── Info tile ─────────────────────────────────────────────────────────────────
function InfoTile({ label, value }) {
    return (
        <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
            <p className="font-semibold text-slate-800 mt-1">{value || "—"}</p>
        </div>
    );
}

// ── Plausibility badge ────────────────────────────────────────────────────────
function PlausibilityBadge({ value }) {
    const styles = { likely: "bg-green-100 text-green-700", possible: "bg-yellow-100 text-yellow-700", unlikely: "bg-red-100 text-red-700" };
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${styles[value] || "bg-gray-100 text-gray-700"}`}>
            {value}
        </span>
    );
}

// ── Upload type label ─────────────────────────────────────────────────────────
function UploadTypeBadge({ type }) {
    const labels = { pdf: "PDF / Report", xray: "X-Ray", ct_mri: "CT / MRI" };
    return (
        <span className="bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full text-xs font-semibold">
            {labels[type] || type}
        </span>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CaseDiagnosis() {
    const { appointmentId } = useParams();
    const location           = useLocation();
    const navigate           = useNavigate();
    const token              = useSelector(selectToken);
    const user               = useSelector(selectUser);
    const profileId          = user?.doctor_profile?.id;

    const [appt,     setAppt]     = useState(location.state?.appointment || null);
    const [report,   setReport]   = useState(null);
    const [images,   setImages]   = useState([]);
    const [loading,  setLoading]  = useState(!location.state?.appointment);
    const [error,    setError]    = useState(null);
    const [hasUnread, setHasUnread] = useState(false);

    const [showQuery,    setShowQuery]    = useState(false);
    const [showFeedback, setShowFeedback] = useState(false);
    const [showHistory,  setShowHistory]  = useState(false);

    const isOngoing   = appt?.status === "confirmed";
    const isCompleted = appt?.status === "completed";
    const patientId   = appt?.patient_id?._id;

    // ── Fetch appointment if navigated directly (no location.state) ───────────
    useEffect(() => {
        if (appt || !token) return;
        setLoading(true);
        api.get(`/api/appointments/${appointmentId}`, token)
            .then(data => setAppt(data))
            .catch(err  => setError(err.message))
            .finally(() => setLoading(false));
    }, [appointmentId, token]);

    // ── Poll appointment status every 30 s so patient-initiated cancels and
    //    other external status changes are reflected without a manual refresh. ──
    useEffect(() => {
        if (!token || !appointmentId) return;
        const id = setInterval(() => {
            api.get(`/api/appointments/${appointmentId}`, token)
                .then(data => setAppt(prev => {
                    // Only update if status changed — avoids unnecessary re-renders
                    if (!prev || prev.status === data.status) return prev;
                    return { ...prev, ...data };
                }))
                .catch(() => {});
        }, 30_000);
        return () => clearInterval(id);
    }, [token, appointmentId]);

    // ── Set initial unread state ───────────────────────────────────────────────
    useEffect(() => {
        if (appt) setHasUnread(!!appt.has_unread_patient_query);
    }, [appt]);

    // ── Fetch linked report ───────────────────────────────────────────────────
    useEffect(() => {
        const reportId = appt?.report_id?._id || appt?.report_id;
        if (!reportId || !token) return;
        api.get(`/api/reports/${reportId}`, token)
            .then(data => setReport(data))
            .catch(() => {});
    }, [appt, token]);

    // ── Fetch patient images (analysis text only — no raw file URLs) ──────────
    useEffect(() => {
        if (!patientId || !token) return;
        api.get(`/api/images/patient/${patientId}`, token)
            .then(data => setImages(Array.isArray(data) ? data : []))
            .catch(() => setImages([]));
    }, [patientId, token]);

    // ── Mark Complete ─────────────────────────────────────────────────────────
    async function handleComplete() {
        if (!window.confirm("Mark this appointment as completed?")) return;
        try {
            await api.post(`/api/appointments/${appointmentId}/complete`, {}, token);
            setAppt(prev => ({ ...prev, status: "completed" }));
            toast.success("Appointment marked as completed");
        } catch (err) {
            toast.error(err.message || "Failed to mark complete");
        }
    }

    if (loading) return <div className="p-8 text-gray-400">Loading case…</div>;
    if (error)   return <div className="p-8 text-red-500">Error: {error}</div>;
    if (!appt)   return null;

    const patient = appt.patient_id;
    const slot    = appt.requested_slot;
    const statusMeta = STATUS_META[appt.status] || { label: appt.status, cls: "bg-gray-100 text-gray-700" };
    const dr        = appt.doctor_report || report?.doctor_report;
    const ps        = appt.patient_summary || report?.patient_summary;
    const diagnoses = report?.interpreted_diagnoses || [];
    const flags     = report?.flags || [];

    return (
        <div className="bg-slate-100 min-h-screen p-8 space-y-6">
            {/* ── Back + header ─────────────────────────────────────────────── */}
            <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-2 text-blue-600 hover:underline text-sm font-medium">
                <ArrowLeft size={16} /> Back
            </button>

            {/* ── Patient header card ───────────────────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                <div className="flex items-start justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-3xl">
                            👤
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">{patient?.name || "Patient"}</h1>
                            <p className="text-gray-500 text-sm mt-1">
                                {patient?.gender} · {calcAge(patient?.dob)} yrs · {patient?.contact?.phone || patient?.contact?.email || ""}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`px-4 py-2 rounded-full text-sm font-semibold ${statusMeta.cls}`}>
                            {statusMeta.label}
                        </span>
                        {hasUnread && (
                            <span className="flex items-center gap-1.5 text-green-600 text-xs font-semibold bg-green-50 px-3 py-1.5 rounded-full">
                                <span className="w-2 h-2 rounded-full bg-green-500" />
                                Unread message
                            </span>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-6 mt-6 pt-6 border-t border-slate-100">
                    <InfoTile label="Appointment Date" value={fmtDate(slot?.date)} />
                    <InfoTile label="Time Slot" value={slot ? `${slot.start_time} – ${slot.end_time}` : "—"} />
                    <InfoTile label="Specialty" value={appt.doctor_id?.specialty} />
                </div>
            </div>

            {/* ── Action bar ───────────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={() => setShowHistory(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 text-slate-700 text-sm font-medium transition"
                >
                    <History size={16} /> Visit History
                </button>

                <button
                    type="button"
                    onClick={() => setShowFeedback(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 text-slate-700 text-sm font-medium transition"
                >
                    <FileText size={16} />
                    {appt.feedback ? "Update Feedback" : "Add Feedback"}
                    {appt.feedback && <span className="w-2 h-2 rounded-full bg-green-500" title="Feedback submitted" />}
                </button>

                {isOngoing && (
                    <>
                        <button
                            type="button"
                            onClick={() => setShowQuery(true)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition ${
                                hasUnread
                                    ? "bg-green-600 hover:bg-green-700 text-white"
                                    : "border border-slate-200 bg-white hover:border-blue-300 text-slate-700"
                            }`}
                        >
                            <MessageCircle size={16} />
                            {hasUnread ? "View Unread Message" : "Messages"}
                            {hasUnread && <span className="w-2 h-2 rounded-full bg-white" />}
                        </button>

                        <button
                            type="button"
                            onClick={handleComplete}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition ml-auto"
                        >
                            <CheckCircle2 size={16} /> Mark Complete
                        </button>
                    </>
                )}
            </div>

            {/* ── Completed: show feedback + query thread read-only ─────────── */}
            {isCompleted && appt.feedback && (
                <Section icon={<FileCheck size={24} />} title="Doctor Feedback">
                    <div className="space-y-4">
                        {appt.feedback.notes && (
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Clinical Notes</p>
                                <p className="text-slate-700 bg-slate-50 rounded-xl p-4 text-sm leading-relaxed">{appt.feedback.notes}</p>
                            </div>
                        )}
                        {appt.feedback.recommendation && (
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Recommendation</p>
                                <p className="text-slate-700 bg-slate-50 rounded-xl p-4 text-sm leading-relaxed">{appt.feedback.recommendation}</p>
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {/* ── Completed: query thread read-only ────────────────────────── */}
            {isCompleted && appt.queries?.length > 0 && (
                <Section icon={<MessageCircle size={24} />} title="Message Thread">
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {appt.queries.map((msg, i) => {
                            const isDoctor = msg.sender === "doctor";
                            return (
                                <div key={msg._id || i} className={`flex ${isDoctor ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                                        isDoctor ? "bg-blue-600 text-white rounded-br-sm" : "bg-slate-100 text-slate-800 rounded-bl-sm"
                                    }`}>
                                        <p>{msg.message}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Section>
            )}

            {/* ── Clinical Summary ──────────────────────────────────────────── */}
            {report && (
                <Section icon={<Brain size={24} />} title="Clinical Summary">
                    {report.doctor_report?.interviewClinicalSummary ? (
                        <div className="space-y-5">
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Interview Summary</p>
                                <p className="text-sm text-slate-700 leading-relaxed bg-blue-50 rounded-xl p-4">
                                    {report.doctor_report.interviewClinicalSummary}
                                </p>
                            </div>
                            {report.doctor_report.retrievalAndMedicationSummary && (
                                <div>
                                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Retrieval & Medication Summary</p>
                                    <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-4">
                                        {report.doctor_report.retrievalAndMedicationSummary}
                                    </p>
                                </div>
                            )}
                            {report.doctor_report.recommendedSpecialty && (
                                <div className="flex items-center gap-3">
                                    <p className="text-sm font-semibold text-slate-700">Recommended Specialty:</p>
                                    <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                                        {report.doctor_report.recommendedSpecialty}
                                    </span>
                                </div>
                            )}
                            {report.doctor_report.guidelineConsiderations?.length > 0 && (
                                <div>
                                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Guideline Considerations</p>
                                    <ul className="space-y-2">
                                        {report.doctor_report.guidelineConsiderations.map((g, i) => (
                                            <li key={i} className="flex items-start gap-2 text-sm">
                                                <ChevronRight size={14} className="text-blue-500 mt-0.5 shrink-0" />
                                                <span className="text-slate-700">{g.point}
                                                    {g.citation && <span className="text-gray-400 ml-1">({g.citation})</span>}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {report.doctor_report.medicationFlags?.length > 0 && (
                                <div>
                                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Medication Flags</p>
                                    <div className="flex flex-wrap gap-2">
                                        {report.doctor_report.medicationFlags.map((m, i) => (
                                            <span key={i} className="bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-lg text-xs">
                                                {m.drug}: {m.flag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-gray-400 text-sm">No clinical summary available yet.</p>
                    )}
                </Section>
            )}

            {/* ── Patient Complaint ─────────────────────────────────────────── */}
            {report?.patient_summary?.patientComplaintSummary && (
                <Section icon={<FileText size={24} />} title="Patient Complaint">
                    <div className="space-y-4">
                        <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-4">
                            {report.patient_summary.patientComplaintSummary}
                        </p>
                        {report.patient_summary.appointmentGuidance?.length > 0 && (
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Appointment Guidance</p>
                                <ul className="space-y-1.5">
                                    {report.patient_summary.appointmentGuidance.map((g, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                                            <ChevronRight size={14} className="text-blue-500 mt-0.5 shrink-0" />
                                            {g.point}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {report.patient_summary.medicationNotes?.length > 0 && (
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Medication Notes</p>
                                <div className="flex flex-wrap gap-2">
                                    {report.patient_summary.medicationNotes.map((m, i) => (
                                        <span key={i} className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-xs">
                                            {m.drug}: {m.note}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {/* ── AI Diagnoses ──────────────────────────────────────────────── */}
            {diagnoses.length > 0 && (
                <Section icon={<Brain size={24} />} title="AI Diagnosis Candidates">
                    <div className="space-y-4">
                        {diagnoses.map((d, i) => (
                            <div key={i} className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-bold text-slate-800">{d.disease}</h3>
                                    <PlausibilityBadge value={d.plausibility} />
                                </div>
                                {d.clinicalReason && (
                                    <p className="text-sm text-slate-600 leading-relaxed">{d.clinicalReason}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* ── Medical Images (analysis text only) ──────────────────────── */}
            {images.length > 0 && (
                <Section icon={<ImageIcon size={24} />} title="Medical Scan Analysis">
                    <div className="grid md:grid-cols-2 gap-4">
                        {images.map(img => (
                            <div key={img.id} className="border border-slate-200 rounded-xl p-5 bg-slate-50">
                                <div className="flex items-center justify-between mb-3">
                                    <UploadTypeBadge type={img.upload_type} />
                                    {img.flagged_abnormal && (
                                        <span className="bg-red-100 text-red-700 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
                                            <Flag size={11} /> Abnormal
                                        </span>
                                    )}
                                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                                        img.status === "complete"    ? "bg-green-100 text-green-700"  :
                                        img.status === "processing"  ? "bg-yellow-100 text-yellow-700" :
                                                                       "bg-gray-100 text-gray-600"
                                    }`}>{img.status}</span>
                                </div>
                                <p className="text-xs text-gray-400 mb-3">{img.original_filename}</p>
                                {img.status === "complete" && img.analysis_result && (
                                    <div className="space-y-2 text-sm">
                                        {img.analysis_result.findings && (
                                            <div>
                                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Findings</p>
                                                <p className="text-slate-700 leading-relaxed">{img.analysis_result.findings}</p>
                                            </div>
                                        )}
                                        {img.analysis_result.impression && (
                                            <div>
                                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Impression</p>
                                                <p className="text-slate-700 font-medium">{img.analysis_result.impression}</p>
                                            </div>
                                        )}
                                        {img.analysis_result.summary && (
                                            <div>
                                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Summary</p>
                                                <p className="text-slate-700">{img.analysis_result.summary}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {img.status === "processing" && (
                                    <p className="text-xs text-yellow-600">Analysis in progress…</p>
                                )}
                                {img.status === "error" && (
                                    <p className="text-xs text-red-500">{img.error_message || "Analysis failed"}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* ── Flags ─────────────────────────────────────────────────────── */}
            {flags.length > 0 && (
                <Section icon={<Flag size={24} className="text-red-500" />} title="Case Flags">
                    <div className="flex flex-wrap gap-2">
                        {flags.map((f, i) => (
                            <span key={i} className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-lg text-sm font-medium">
                                <Flag size={13} /> {f}
                            </span>
                        ))}
                    </div>
                </Section>
            )}

            {/* ── No report yet ─────────────────────────────────────────────── */}
            {!report && !loading && (
                <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center text-gray-400">
                    No AI report linked to this appointment yet.
                </div>
            )}

            {/* ── Modals / panels ───────────────────────────────────────────── */}
            {showQuery && (
                <QueryPanel
                    appointmentId={appointmentId}
                    queries={appt.queries || []}
                    token={token}
                    onClose={() => setShowQuery(false)}
                    onUnreadCleared={() => setHasUnread(false)}
                />
            )}

            {showFeedback && (
                <FeedbackModal
                    appointmentId={appointmentId}
                    existingFeedback={appt.feedback}
                    token={token}
                    onClose={() => setShowFeedback(false)}
                    onSaved={(feedback) => setAppt(prev => ({ ...prev, feedback }))}
                />
            )}

            {showHistory && (
                <HistoryModal
                    patientId={patientId}
                    patientName={patient?.name}
                    doctorProfileId={profileId}
                    token={token}
                    onClose={() => setShowHistory(false)}
                />
            )}
        </div>
    );
}
