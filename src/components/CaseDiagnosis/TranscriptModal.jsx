import { useEffect, useState } from "react";
import { X, MessageSquareText, Mic } from "lucide-react";
import { api } from "../../utils/api";

// Read-only view of the patient's AI interview (GET /api/sessions/:id).
// Each turn holds the patient's answer and the AI's next question.
export default function TranscriptModal({ sessionId, patientName, token, onClose }) {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);

    useEffect(() => {
        if (!sessionId || !token) return;
        api.get(`/api/sessions/${sessionId}`, token)
            .then(setSession)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [sessionId, token]);

    const turns = session?.transcript ?? [];

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl w-[680px] max-h-[85vh] flex flex-col shadow-xl">
                <div className="flex items-center justify-between p-6 border-b border-slate-200 shrink-0">
                    <div className="flex items-center gap-2">
                        <MessageSquareText size={20} className="text-blue-600" />
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Interview Transcript</h2>
                            <p className="text-sm text-gray-500 mt-0.5">
                                {session?.session_name || "AI consultation"} · {patientName || "Patient"}
                                {turns.length > 0 && ` · ${turns.length} turns`}
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close transcript"
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-gray-400 hover:text-gray-600">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {loading && <p className="text-center text-gray-400">Loading transcript…</p>}
                    {error   && <p className="text-center text-red-500">{error}</p>}
                    {!loading && !error && turns.length === 0 && (
                        <p className="text-center text-gray-400">No transcript is available for this consultation.</p>
                    )}

                    {turns.map(t => {
                        const translated = t.patient_raw && t.patient_raw.trim() !== t.patient_corrected?.trim();
                        return (
                            <div key={t.turn_number} className="space-y-2">
                                <div className="flex justify-end">
                                    <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5">
                                        <p className="text-xs font-semibold text-blue-100 mb-1">
                                            Patient · turn {t.turn_number}
                                        </p>
                                        <p className="text-sm leading-relaxed">{t.patient_corrected}</p>
                                        {translated && (
                                            <p className="text-xs text-blue-100 mt-1.5 italic">Original: “{t.patient_raw}”</p>
                                        )}
                                        {t.voice_message_url && (
                                            <div className="mt-2 flex items-center gap-2">
                                                <Mic size={14} className="text-blue-100 shrink-0" />
                                                <audio controls src={t.voice_message_url} className="h-8 max-w-full" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex justify-start">
                                    <div className="max-w-[80%] bg-slate-100 text-slate-800 rounded-2xl rounded-bl-sm px-4 py-2.5">
                                        <p className="text-xs font-semibold text-slate-500 mb-1">CureSense AI</p>
                                        <p className="text-sm leading-relaxed">{t.assistant_message}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
