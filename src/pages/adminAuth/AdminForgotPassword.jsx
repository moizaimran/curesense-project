import { useState } from "react";
import { Link } from "react-router-dom";

import AuthLayout from "../../components/auth/AuthLayout";
import InputField from "../../components/auth/InputField";
import ResetStatus from "../../components/auth/ResetStatus";
import { requestPasswordReset } from "../../utils/auth";

const AdminForgotPassword = () => {

    const [email, setEmail] = useState("");
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);

    const handleSubmit = async (e) => {

        e.preventDefault();
        setSending(true);
        setResult(null);

        try {
            const data = await requestPasswordReset(email);
            setResult({ ok: true, message: data.message });
        } catch (err) {
            setResult({ ok: false, message: err.message });
        } finally {
            setSending(false);
        }

    };

    return (

        <AuthLayout>

            <div>

                <div className="text-center mb-8">

                    <h2 className="text-3xl font-bold text-gray-800">
                        Forgot Password?
                    </h2>

                    <p className="text-gray-500 mt-2">
                        Enter your administrator email address to receive a password reset link.
                    </p>

                </div>

                <ResetStatus result={result} />

                <form onSubmit={handleSubmit}>

                    <InputField
                        label="Admin Email"
                        type="email"
                        name="email"
                        placeholder="admin@curesense.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />

                    <button
                        type="submit"
                        disabled={sending}
                        className="
                            w-full
                            bg-blue-600
                            text-white
                            py-3
                            rounded-xl
                            font-semibold
                            hover:bg-blue-700
                            transition
                            shadow-md
                            disabled:opacity-60
                        "
                    >
                        {sending ? "Sending…" : "Send Reset Link"}
                    </button>

                </form>

                <div className="text-center mt-6">

                    <p className="text-sm text-gray-600">

                        Remember your password?

                        <Link
                            to="/admin/login"
                            className="
                                text-blue-600
                                font-semibold
                                ml-1
                                hover:underline
                            "
                        >
                            Back to Login
                        </Link>

                    </p>

                </div>

            </div>

        </AuthLayout>

    );

};

export default AdminForgotPassword;