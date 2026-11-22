import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Bell } from "lucide-react";
import { api } from "../../utils/api";

// Copy per role — the same three settings, described in terms of what that
// person actually receives.
const OPTIONS = {
    doctor: [
        { key: "appointment_updates", label: "New cases",         hint: "When an admin approves a new appointment with you." },
        { key: "messages",            label: "Patient messages",  hint: "When a patient sends a message on one of your cases." },
    ],
    // Admins currently only receive payment emails — no dead toggles.
    admin: [
        { key: "payment_updates",     label: "Payments to verify", hint: "When a patient pays by card or submits an EasyPaisa/JazzCash transaction." },
    ],
};

function Toggle({ id, checked, onChange, disabled }) {
    return (
        <button
            id={id}
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50 ${checked ? "bg-blue-600" : "bg-gray-300"}`}
        >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? "translate-x-6" : "translate-x-1"}`} />
        </button>
    );
}

// Email notification preferences (saved instantly on toggle).
export default function NotificationSettings({ role = "doctor", token }) {
    const [prefs,  setPrefs]  = useState(null);
    const [saving, setSaving] = useState(null);
    const [error,  setError]  = useState("");

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        api.get("/api/auth/me/notifications", token)
            .then((d) => { if (!cancelled) setPrefs(d.email); })
            .catch((err) => { if (!cancelled) setError(err.message); });
        return () => { cancelled = true; };
    }, [token]);

    async function toggle(key, value) {
        const before = prefs;
        setPrefs({ ...prefs, [key]: value });   // optimistic
        setSaving(key);
        try {
            const d = await api.patch("/api/auth/me/notifications", { email: { [key]: value } }, token);
            setPrefs(d.email);
        } catch (err) {
            setPrefs(before);
            toast.error(err.message || "Could not save setting");
        } finally {
            setSaving(null);
        }
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Bell size={24} className="text-blue-600" /> Email Notifications
            </h2>
            <p className="text-gray-500 text-sm mt-1">
                Choose which emails you get. Security emails (verification, password reset, account approval) are always sent.
            </p>

            {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
            {!prefs && !error && <p className="text-sm text-gray-400 mt-4">Loading…</p>}

            {prefs && (
                <ul className="mt-6 divide-y divide-gray-100">
                    {(OPTIONS[role] || OPTIONS.doctor).map((o) => (
                        <li key={o.key} className="flex items-center justify-between gap-6 py-4">
                            <label htmlFor={`notif-${o.key}`} className="cursor-pointer">
                                <span className="block font-semibold text-slate-800">{o.label}</span>
                                <span className="block text-sm text-gray-500">{o.hint}</span>
                            </label>
                            <Toggle id={`notif-${o.key}`} checked={prefs[o.key]} disabled={saving === o.key} onChange={(v) => toggle(o.key, v)} />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
