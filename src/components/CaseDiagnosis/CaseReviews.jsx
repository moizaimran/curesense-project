import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Star } from "lucide-react";
import StarRating from "../common/StarRating";
import { api } from "../../utils/api";

const COMMENT_MAX = 1000;

function fmtDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Shown on a completed case: the patient's review of the doctor (read-only)
// and the doctor's own rating/feedback on the patient (editable).
export default function CaseReviews({ appointmentId, patientName, token }) {
    const [loading,       setLoading]       = useState(true);
    const [error,         setError]         = useState(null);
    const [patientReview, setPatientReview] = useState(null);
    const [myReview,      setMyReview]      = useState(null);

    const [rating,  setRating]  = useState(0);
    const [comment, setComment] = useState("");
    const [editing, setEditing] = useState(false);
    const [saving,  setSaving]  = useState(false);

    useEffect(() => {
        if (!token || !appointmentId) return;
        let cancelled = false;
        api.get(`/api/appointments/${appointmentId}/reviews`, token)
            .then((data) => {
                if (cancelled) return;
                setPatientReview(data.patient_review);
                setMyReview(data.doctor_review);
                setRating(data.doctor_review?.rating || 0);
                setComment(data.doctor_review?.comment || "");
                setEditing(!data.doctor_review);
            })
            .catch((err) => { if (!cancelled) setError(err.message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [appointmentId, token]);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!rating) {
            toast.error("Please select a star rating");
            return;
        }
        setSaving(true);
        try {
            const data = await api.post(
                `/api/appointments/${appointmentId}/review`,
                { rating, comment: comment.trim() },
                token
            );
            setMyReview(data.review);
            setEditing(false);
            toast.success("Your feedback has been saved");
        } catch (err) {
            toast.error(err.message || "Could not save feedback");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-center gap-3 mb-6">
                <Star size={24} className="text-blue-600" />
                <h2 className="text-xl font-bold text-slate-800">Ratings &amp; Feedback</h2>
            </div>

            {loading && <p className="text-gray-400 text-sm">Loading…</p>}
            {!loading && error && <p className="text-red-500 text-sm">{error}</p>}

            {!loading && !error && (
                <div className="grid md:grid-cols-2 gap-6">
                    {/* Patient → doctor */}
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-5">
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">
                            {patientName ? `${patientName}'s review of you` : "Patient's review of you"}
                        </p>
                        {patientReview ? (
                            <>
                                <StarRating value={patientReview.rating} label="Patient's rating" />
                                {patientReview.comment && (
                                    <p className="text-slate-700 text-sm mt-3 whitespace-pre-line">“{patientReview.comment}”</p>
                                )}
                                <p className="text-xs text-gray-400 mt-3">{fmtDate(patientReview.updated_at || patientReview.created_at)}</p>
                            </>
                        ) : (
                            <p className="text-gray-400 text-sm">The patient hasn't left a review yet.</p>
                        )}
                    </div>

                    {/* Doctor → patient */}
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-5">
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                            Your feedback on the patient
                        </p>
                        <p className="text-xs text-gray-400 mb-3">Only visible to doctors and admins — not to the patient.</p>

                        {editing ? (
                            <form onSubmit={handleSubmit} className="space-y-3">
                                <StarRating value={rating} onChange={setRating} label="Rate this patient" />
                                <textarea
                                    rows={3}
                                    maxLength={COMMENT_MAX}
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="e.g. punctual, followed instructions, shared complete history… (optional)"
                                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                                />
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-400">{comment.length}/{COMMENT_MAX}</span>
                                    <div className="flex gap-2">
                                        {myReview && (
                                            <button
                                                type="button"
                                                onClick={() => { setEditing(false); setRating(myReview.rating); setComment(myReview.comment || ""); }}
                                                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                        <button
                                            type="submit"
                                            disabled={saving || !rating}
                                            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition"
                                        >
                                            {saving ? "Saving…" : myReview ? "Update" : "Submit"}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        ) : (
                            <>
                                <StarRating value={myReview.rating} label="Your rating" />
                                {myReview.comment && (
                                    <p className="text-slate-700 text-sm mt-3 whitespace-pre-line">“{myReview.comment}”</p>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setEditing(true)}
                                    className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
                                >
                                    Edit feedback
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
