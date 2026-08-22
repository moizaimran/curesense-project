import { useState } from "react";
import { X, FileText } from "lucide-react";
import { api } from "../../utils/api";
import toast from "react-hot-toast";

export default function FeedbackModal({ appointmentId, existingFeedback, token, onClose, onSaved }) {
    const [notes,          setNotes]         = useState(existingFeedback?.notes          || "");
    const [recommendation, setRecommendation]= useState(existingFeedback?.recommendation || "");
    const [saving,         setSaving]        = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!notes.trim()) { toast.error("Clinical notes are required"); return; }
        setSaving(true);
        try {
            const res = await api.post(
                `/api/appointments/${appointmentId}/feedback`,
                { notes: notes.trim(), recommendation: recommendation.trim() },
                token
            );
            toast.success("Feedback saved");
            onSaved?.(res.feedback);
            onClose();
        } catch (err) {
            toast.error(err.message || "Failed to save feedback");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl w-[540px] shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <FileText size={20} className="text-blue-600" />
                        <h2 className="text-xl font-bold text-slate-800">
                            {existingFeedback ? "Update Feedback" : "Submit Feedback"}
                        </h2>
                    </div>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-gray-400 hover:text-gray-600">
                        <X size={18} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Clinical Notes <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={5}
                            placeholder="Enter your observations, findings, and clinical assessment…"
                            className="w-full border border-gray-300 rounded-xl p-4 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Recommendation
                        </label>
                        <textarea
                            value={recommendation}
                            onChange={e => setRecommendation(e.target.value)}
                            rows={3}
                            placeholder="Treatment plan, follow-up instructions, referrals…"
                            className="w-full border border-gray-300 rounded-xl p-4 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition"
                        >
                            {saving ? "Saving…" : "Save Feedback"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
