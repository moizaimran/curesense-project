import { useState } from "react";
import { X, FileText, Plus, Trash2 } from "lucide-react";
import { api } from "../../utils/api";
import toast from "react-hot-toast";

export default function FeedbackModal({ appointmentId, existingFeedback, token, onClose, onSaved }) {
    const [notes,          setNotes]         = useState(existingFeedback?.notes          || "");
    const [recommendation, setRecommendation]= useState(existingFeedback?.recommendation || "");
    const [testInput,      setTestInput]     = useState("");
    const [testsRequested, setTestsRequested]= useState(existingFeedback?.tests_requested || []);
    const [saving,         setSaving]        = useState(false);

    function addTest() {
        const trimmed = testInput.trim();
        if (!trimmed || testsRequested.includes(trimmed)) {
            setTestInput("");
            return;
        }
        setTestsRequested(prev => [...prev, trimmed]);
        setTestInput("");
    }

    function removeTest(test) {
        setTestsRequested(prev => prev.filter(t => t !== test));
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!notes.trim()) { toast.error("Clinical notes are required"); return; }
        setSaving(true);
        try {
            const res = await api.post(
                `/api/appointments/${appointmentId}/feedback`,
                {
                    notes: notes.trim(),
                    recommendation: recommendation.trim(),
                    tests_requested: testsRequested,
                },
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
            <div className="bg-white rounded-2xl w-[540px] shadow-xl max-h-[90vh] overflow-y-auto">
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

                    {/* ── Tests Requested ──────────────────────────────────── */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Tests Requested
                        </label>
                        <p className="text-xs text-gray-400 mb-2">
                            Add any lab tests or scans you want the patient to get done. They'll be able to upload the results back to you.
                        </p>

                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={testInput}
                                onChange={e => setTestInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        addTest();
                                    }
                                }}
                                placeholder="e.g. Complete Blood Count"
                                className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                type="button"
                                onClick={addTest}
                                className="px-4 py-2.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition"
                            >
                                <Plus size={16} />
                            </button>
                        </div>

                        {testsRequested.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {testsRequested.map(test => (
                                    <span
                                        key={test}
                                        className="flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1.5 rounded-lg text-xs font-medium"
                                    >
                                        {test}
                                        <button
                                            type="button"
                                            onClick={() => removeTest(test)}
                                            className="hover:text-blue-900"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
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