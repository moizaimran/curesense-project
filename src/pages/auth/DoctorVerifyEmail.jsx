import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import AuthLayout from "../../components/auth/AuthLayout";
import { api } from "../../utils/api";

const DoctorVerifyEmail = () => {
    const location = useLocation();
    const email    = location.state?.email || "";

    const [status, setStatus] = useState("idle"); // idle | sending | sent | error
    const [error,  setError]  = useState("");

    const handleResend = async () => {
        if (!email) {
            setError("Email address not found — please go back and register again.");
            return;
        }
        setStatus("sending");
        setError("");
        try {
            await api.post("/api/doctors/resend-verification", { email });
            setStatus("sent");
        } catch (err) {
            setError(err.message || "Failed to resend. Please try again.");
            setStatus("error");
        }
    };

    return (
        <AuthLayout>
            <div className="text-center">
                {/* Icon */}
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
                        <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-gray-800 mb-2">Check your email</h2>
                <p className="text-gray-500 text-sm mb-1">We sent a verification link to</p>
                {email && (
                    <p className="text-blue-600 font-semibold text-sm mb-6 break-all">{email}</p>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
                    <p className="text-sm text-blue-800 font-medium mb-2">What to do next:</p>
                    <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                        <li>Open the email from CureSense in your inbox</li>
                        <li>Click the <strong>Verify Email</strong> button in the email</li>
                        <li>You will be redirected back here to sign in</li>
                    </ol>
                    <p className="text-xs text-blue-500 mt-3">
                        Don&apos;t see it? Check your spam or junk folder.
                    </p>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6 text-sm text-amber-800">
                    Your account is also <strong>pending admin approval</strong> of your PMDC registration.
                    You will receive a second email once an admin reviews your profile.
                </div>

                {status === "sent" && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
                        Verification email resent! Check your inbox.
                    </div>
                )}
                {(status === "error" || error) && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                        {error}
                    </div>
                )}

                <button
                    onClick={handleResend}
                    disabled={status === "sending" || status === "sent"}
                    className="w-full py-3 rounded-xl font-semibold transition text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 mb-3">
                    {status === "sending" ? "Sending…" : status === "sent" ? "Email sent ✓" : "Resend verification email"}
                </button>

                <Link to="/doctor/login" className="block text-sm text-gray-500 hover:text-blue-600 transition">
                    Back to sign in
                </Link>
            </div>
        </AuthLayout>
    );
};

export default DoctorVerifyEmail;
