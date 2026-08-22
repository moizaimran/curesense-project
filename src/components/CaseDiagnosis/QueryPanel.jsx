import { useEffect, useRef, useState } from "react";
import { Send, X, MessageCircle } from "lucide-react";
import { api } from "../../utils/api";
import toast from "react-hot-toast";

export default function QueryPanel({ appointmentId, queries: initialQueries, token, onClose, onUnreadCleared }) {
    const [messages,     setMessages]     = useState(initialQueries || []);
    const [text,         setText]         = useState("");
    const [sending,      setSending]      = useState(false);
    const bottomRef = useRef(null);

    // Clear the unread indicator as soon as the panel opens
    useEffect(() => {
        if (!appointmentId || !token) return;
        api.patch(`/api/appointments/${appointmentId}/queries/read`, {}, token)
            .then(() => onUnreadCleared?.())
            .catch(() => {});
    }, [appointmentId, token]);

    // Scroll to latest message on open and on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    async function handleSend() {
        const msg = text.trim();
        if (!msg) return;
        setSending(true);
        try {
            const res = await api.post(`/api/appointments/${appointmentId}/queries`, { message: msg }, token);
            setMessages(prev => [...prev, res.query]);
            setText("");
        } catch (err) {
            toast.error(err.message || "Failed to send message");
        } finally {
            setSending(false);
        }
    }

    function fmtTime(iso) {
        if (!iso) return "";
        return new Date(iso).toLocaleString("en-GB", {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
        });
    }

    return (
        /* Right-side slide-in panel */
        <div className="fixed inset-y-0 right-0 w-[420px] bg-white shadow-2xl flex flex-col z-50 border-l border-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
                <div className="flex items-center gap-2">
                    <MessageCircle size={20} className="text-blue-600" />
                    <h2 className="text-lg font-bold text-slate-800">Patient Messages</h2>
                </div>
                <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-gray-400 hover:text-gray-600">
                    <X size={18} />
                </button>
            </div>

            {/* Message list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {messages.length === 0 && (
                    <p className="text-center text-gray-400 text-sm mt-8">No messages yet. Start the conversation.</p>
                )}
                {messages.map((msg, i) => {
                    const isDoctor = msg.sender === "doctor";
                    return (
                        <div key={msg._id || i} className={`flex ${isDoctor ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                                isDoctor
                                    ? "bg-blue-600 text-white rounded-br-sm"
                                    : "bg-slate-100 text-slate-800 rounded-bl-sm"
                            }`}>
                                <p className="text-sm leading-relaxed">{msg.message}</p>
                                <p className={`text-[11px] mt-1 ${isDoctor ? "text-blue-200" : "text-gray-400"}`}>
                                    {isDoctor ? "You" : "Patient"} · {fmtTime(msg.created_at)}
                                </p>
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {/* Compose bar */}
            <div className="p-4 border-t border-slate-200">
                <div className="flex items-end gap-2">
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder="Type a message…"
                        rows={2}
                        className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={!text.trim() || sending}
                        className="h-11 w-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition shrink-0"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
