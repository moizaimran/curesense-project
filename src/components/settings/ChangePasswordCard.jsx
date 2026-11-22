import { useState } from "react";
import toast from "react-hot-toast";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { firebaseAuth } from "../../config/firebase";
import { passwordProblem } from "../../utils/passwordRules";

const FIREBASE_ERRORS = {
    "auth/wrong-password":         "Your current password is incorrect.",
    "auth/invalid-credential":     "Your current password is incorrect.",
    "auth/invalid-login-credentials": "Your current password is incorrect.",
    "auth/too-many-requests":      "Too many attempts. Please wait a few minutes and try again.",
    "auth/weak-password":          "That password is too weak. Use at least 8 characters with letters and numbers.",
    "auth/requires-recent-login":  "Please sign out and sign in again, then change your password.",
    "auth/network-request-failed": "Network error — check your connection and try again.",
};

const inputCls = "w-full border border-gray-300 rounded-xl px-4 py-3 pr-11 focus:outline-none focus:ring-2 focus:ring-[#264296]";

function PasswordField({ id, label, value, onChange, autoComplete }) {
    const [show, setShow] = useState(false);
    return (
        <div>
            <label htmlFor={id} className="block text-sm font-medium text-gray-600 mb-2">{label}</label>
            <div className="relative">
                <input id={id} type={show ? "text" : "password"} value={value} onChange={onChange}
                    autoComplete={autoComplete} className={inputCls} />
                <button type="button" onClick={() => setShow((s) => !s)}
                    aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>
        </div>
    );
}

// Change password for email/password accounts (Firebase re-authentication +
// updatePassword). Google sign-in accounts manage their password with Google.
export default function ChangePasswordCard() {
    const [current, setCurrent] = useState("");
    const [next,    setNext]    = useState("");
    const [confirm, setConfirm] = useState("");
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState("");

    const fbUser = firebaseAuth.currentUser;
    const hasPassword = !fbUser || fbUser.providerData.some((p) => p.providerId === "password");

    async function submit(e) {
        e.preventDefault();
        setError("");
        if (!current) return setError("Enter your current password.");
        const problem = passwordProblem(next);
        if (problem) return setError(problem);
        if (next !== confirm) return setError("The new passwords don't match.");
        if (next === current) return setError("Choose a password different from your current one.");

        const user = firebaseAuth.currentUser;
        if (!user?.email) return setError("Your session has expired. Please sign in again.");

        setSaving(true);
        try {
            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
            await updatePassword(user, next);
            setCurrent(""); setNext(""); setConfirm("");
            toast.success("Password changed");
        } catch (err) {
            setError(FIREBASE_ERRORS[err.code] || err.message || "Could not change password.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <KeyRound size={24} className="text-blue-600" /> Change Password
            </h2>

            {!hasPassword ? (
                <p className="text-gray-500 mt-3">
                    You sign in with Google, so there's no CureSense password to change. Manage your password in your Google account.
                </p>
            ) : (
                <form onSubmit={submit} className="mt-6">
                    <div className="grid md:grid-cols-3 gap-6">
                        <PasswordField id="pw-current" label="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
                        <PasswordField id="pw-new" label="New password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
                        <PasswordField id="pw-confirm" label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
                    </div>
                    <p className="text-xs text-gray-400 mt-2">At least 8 characters, including a letter and a number.</p>
                    {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}
                    <button type="submit" disabled={saving}
                        className="mt-6 bg-[#264296] hover:bg-blue-900 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-semibold">
                        {saving ? "Updating…" : "Update Password"}
                    </button>
                </form>
            )}
        </div>
    );
}
