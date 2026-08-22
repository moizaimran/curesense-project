import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import AuthLayout from "../../components/auth/AuthLayout";
import InputField from "../../components/auth/InputField";
import PasswordInput from "../../components/auth/PasswordInput";
import { loginStart, loginSuccess, loginFailure, selectAuthLoading, selectAuthError } from "../../features/auth/authSlice";
import { api } from "../../utils/api";

const DoctorLogin = () => {
    const navigate  = useNavigate();
    const dispatch  = useDispatch();
    const loading   = useSelector(selectAuthLoading);
    const authError = useSelector(selectAuthError);

    const location = useLocation();

    const [email,    setEmail]    = useState("");
    const [password, setPassword] = useState("");

    const handleLogin = async (e) => {
        e.preventDefault();
        dispatch(loginStart());

        try {
            const data = await api.post("/api/auth/login", { email, password });

            // Only let doctors through this form
            if (data.user.role !== "doctor") {
                dispatch(loginFailure("This login is for doctors only"));
                return;
            }

            dispatch(loginSuccess({ token: data.token, user: data.user }));
            navigate("/");
        } catch (err) {
            dispatch(loginFailure(err.message));
        }
    };

    return (
        <AuthLayout>
            <div>
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-gray-800">Welcome Back Doctor</h2>
                    <p className="text-gray-500 mt-2">Sign in to access your CureSense dashboard</p>
                </div>

                {location.state?.registered && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
                        Account created! Your profile is pending admin verification — you'll be able to log in once approved.
                    </div>
                )}

                {authError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                        {authError}
                    </div>
                )}

                <form onSubmit={handleLogin}>
                    <InputField label="Email Address" type="email" placeholder="doctor@example.com"
                        value={email} onChange={(e) => setEmail(e.target.value)} />

                    <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />

                    <div className="flex justify-between items-center mb-6">
                        <label className="flex items-center gap-2 text-sm text-gray-600">
                            <input type="checkbox" className="w-4 h-4 accent-blue-600" />
                            Remember me
                        </label>
                        <Link to="/doctor/forgot-password" className="text-sm text-blue-600 hover:underline">
                            Forgot Password?
                        </Link>
                    </div>

                    <button type="submit" disabled={loading}
                        className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition shadow-md disabled:opacity-60">
                        {loading ? "Signing in…" : "Login"}
                    </button>
                </form>

                <p className="text-center text-sm text-gray-600 mt-6">
                    Don't have an account?
                    <Link to="/doctor/signup" className="text-blue-600 font-semibold ml-1 hover:underline">
                        Create Account
                    </Link>
                </p>
            </div>
        </AuthLayout>
    );
};

export default DoctorLogin;
