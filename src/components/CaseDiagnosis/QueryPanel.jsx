// import { useEffect, useRef, useState } from "react";
// import { Send, X, MessageCircle } from "lucide-react";
// import { api } from "../../utils/api";
// import toast from "react-hot-toast";

// export default function QueryPanel({ appointmentId, queries: initialQueries, token, onClose, onUnreadCleared }) {
//     const [messages,     setMessages]     = useState(initialQueries || []);
//     const [text,         setText]         = useState("");
//     const [sending,      setSending]      = useState(false);
//     const bottomRef = useRef(null);

//     // Clear the unread indicator as soon as the panel opens
//     useEffect(() => {
//         if (!appointmentId || !token) return;
//         api.patch(`/api/appointments/${appointmentId}/queries/read`, {}, token)
//             .then(() => onUnreadCleared?.())
//             .catch(() => {});
//     }, [appointmentId, token]);

//     // Scroll to latest message on open and on new messages
//     useEffect(() => {
//         bottomRef.current?.scrollIntoView({ behavior: "smooth" });
//     }, [messages]);

//     async function handleSend() {
//         const msg = text.trim();
//         if (!msg) return;
//         setSending(true);
//         try {
//             const res = await api.post(`/api/appointments/${appointmentId}/queries`, { message: msg }, token);
//             setMessages(prev => [...prev, res.query]);
//             setText("");
//         } catch (err) {
//             toast.error(err.message || "Failed to send message");
//         } finally {
//             setSending(false);
//         }
//     }

//     function fmtTime(iso) {
//         if (!iso) return "";
//         return new Date(iso).toLocaleString("en-GB", {
//             day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
//         });
//     }

//     return (
//         /* Right-side slide-in panel */
//         <div className="fixed inset-y-0 right-0 w-[420px] bg-white shadow-2xl flex flex-col z-50 border-l border-slate-200">
//             {/* Header */}
//             <div className="flex items-center justify-between p-5 border-b border-slate-200">
//                 <div className="flex items-center gap-2">
//                     <MessageCircle size={20} className="text-blue-600" />
//                     <h2 className="text-lg font-bold text-slate-800">Patient Messages</h2>
//                 </div>
//                 <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-gray-400 hover:text-gray-600">
//                     <X size={18} />
//                 </button>
//             </div>

//             {/* Message list */}
//             <div className="flex-1 overflow-y-auto p-5 space-y-3">
//                 {messages.length === 0 && (
//                     <p className="text-center text-gray-400 text-sm mt-8">No messages yet. Start the conversation.</p>
//                 )}
//                 {messages.map((msg, i) => {
//                     const isDoctor = msg.sender === "doctor";
//                     return (
//                         <div key={msg._id || i} className={`flex ${isDoctor ? "justify-end" : "justify-start"}`}>
//                             <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
//                                 isDoctor
//                                     ? "bg-blue-600 text-white rounded-br-sm"
//                                     : "bg-slate-100 text-slate-800 rounded-bl-sm"
//                             }`}>
//                                 <p className="text-sm leading-relaxed">{msg.message}</p>
//                                 <p className={`text-[11px] mt-1 ${isDoctor ? "text-blue-200" : "text-gray-400"}`}>
//                                     {isDoctor ? "You" : "Patient"} · {fmtTime(msg.created_at)}
//                                 </p>
//                             </div>
//                         </div>
//                     );
//                 })}
//                 <div ref={bottomRef} />
//             </div>

//             {/* Compose bar */}
//             <div className="p-4 border-t border-slate-200">
//                 <div className="flex items-end gap-2">
//                     <textarea
//                         value={text}
//                         onChange={e => setText(e.target.value)}
//                         onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
//                         placeholder="Type a message…"
//                         rows={2}
//                         className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500"
//                     />
//                     <button
//                         type="button"
//                         onClick={handleSend}
//                         disabled={!text.trim() || sending}
//                         className="h-11 w-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition shrink-0"
//                     >
//                         <Send size={16} />
//                     </button>
//                 </div>
//             </div>
//         </div>
//     );
// }
import { useEffect, useRef, useState } from "react";
import { Send, X, MessageCircle } from "lucide-react";
import { api } from "../../utils/api";
import toast from "react-hot-toast";

export default function QueryPanel({
    appointmentId,
    queries: initialQueries,
    token,
    onClose,
    onUnreadCleared,
    onDoctorMessageSent,
}) {
    const [messages, setMessages] = useState(initialQueries || []);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const bottomRef = useRef(null);

    // When the doctor opens the query panel, patient messages are marked as read.
    useEffect(() => {
        if (!appointmentId || !token) return;

        api.patch(`/api/appointments/${appointmentId}/queries/read`, {}, token)
            .then(() => onUnreadCleared?.())
            .catch(() => {});
    }, [appointmentId, token]);

    // Keep the conversation scrolled to the latest message.
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    async function handleSend() {
        const msg = text.trim();
        if (!msg || sending) return;

        setSending(true);

        try {
            const res = await api.post(
                `/api/appointments/${appointmentId}/queries`,
                { message: msg },
                token
            );

            const sentQuery = res?.query;

            if (sentQuery) {
                setMessages(prev => [...prev, sentQuery]);

                // IMPORTANT:
                // This tells CaseDiagnosis that the doctor has sent the first query.
                // CaseDiagnosis then immediately changes the UI from Pending/New
                // to Ongoing. The message itself is already persisted by the API,
                // so the status derivation also survives refresh.
                onDoctorMessageSent?.(sentQuery);
            }

            setText("");
        } catch (err) {
            toast.error(err.message || "Failed to send message");
        } finally {
            setSending(false);
        }
    }

    function handleKeyDown(e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    function fmtTime(iso) {
        if (!iso) return "";

        return new Date(iso).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    return (
        <>
            <div
                className="fixed inset-0 bg-slate-900/20 z-40"
                onClick={onClose}
                aria-hidden="true"
            />

            <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white shadow-2xl flex flex-col z-50 border-l border-slate-200">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                            <MessageCircle size={20} className="text-blue-600" />
                        </div>

                        <div>
                            <h2 className="font-bold text-slate-800">Patient Query</h2>
                            <p className="text-xs text-slate-500">
                                Send a question or clarification to the patient
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                        aria-label="Close query panel"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-5 py-5 bg-slate-50">
                    {messages.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-center">
                            <div className="max-w-[260px]">
                                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
                                    <MessageCircle size={22} className="text-blue-600" />
                                </div>
                                <p className="font-semibold text-slate-700">No messages yet</p>
                                <p className="text-sm text-slate-500 mt-1">
                                    Write your first query below. After it is sent, this case will move to Ongoing.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {messages.map((message, index) => {
                                const isDoctor = message?.sender === "doctor";

                                return (
                                    <div
                                        key={message?._id || `${message?.created_at || "message"}-${index}`}
                                        className={`flex ${isDoctor ? "justify-end" : "justify-start"}`}
                                    >
                                        <div className={`max-w-[82%] ${isDoctor ? "text-right" : "text-left"}`}>
                                            <div
                                                className={`inline-block px-4 py-3 rounded-2xl text-sm leading-relaxed text-left ${
                                                    isDoctor
                                                        ? "bg-blue-600 text-white rounded-br-md"
                                                        : "bg-white text-slate-700 border border-slate-200 rounded-bl-md"
                                                }`}
                                            >
                                                {message?.message}
                                            </div>

                                            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400">
                                                <span>{isDoctor ? "You" : "Patient"}</span>
                                                <span>•</span>
                                                <span>{fmtTime(message?.created_at)}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            <div ref={bottomRef} />
                        </div>
                    )}
                </div>

                {/* Composer */}
                <div className="border-t border-slate-200 bg-white p-4">
                    <div className="flex items-end gap-3">
                        <textarea
                            value={text}
                            onChange={e => setText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={3}
                            maxLength={2000}
                            placeholder="Write your query to the patient..."
                            className="flex-1 resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                        />

                        <button
                            type="button"
                            onClick={handleSend}
                            disabled={sending || !text.trim()}
                            className="w-11 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white flex items-center justify-center transition shrink-0"
                            aria-label="Send query"
                        >
                            <Send size={16} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between mt-2 px-1">
                        <p className="text-[11px] text-slate-400">
                            Press Enter to send · Shift + Enter for a new line
                        </p>
                        <p className="text-[11px] text-slate-400">
                            {text.length}/2000
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}
