import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import AuthLayout from "../../components/auth/AuthLayout";
import InputField from "../../components/auth/InputField";
import PasswordInput from "../../components/auth/PasswordInput";
import { loginStart, loginSuccess, loginFailure, selectAuthLoading, selectAuthError } from "../../features/auth/authSlice";
import { api } from "../../utils/api";

const AdminLogin = () => {
    const navigate  = useNavigate();
    const dispatch  = useDispatch();
    const loading   = useSelector(selectAuthLoading);
    const authError = useSelector(selectAuthError);

    const [email,    setEmail]    = useState("");
    const [password, setPassword] = useState("");

    const handleLogin = async (e) => {
        e.preventDefault();
        dispatch(loginStart());

        try {
            const data = await api.post("/api/auth/login", { email, password });

            if (data.user.role !== "admin") {
                dispatch(loginFailure("This login is for admins only"));
                return;
            }

            dispatch(loginSuccess({ token: data.token, user: data.user }));
            navigate("/admin");
        } catch (err) {
            dispatch(loginFailure(err.message));
        }
    };

    return (
        <AuthLayout>
            <div>
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-gray-800">Welcome Back Admin</h2>
                    <p className="text-gray-500 mt-2">Login to access the CureSense Admin Dashboard</p>
                </div>

                {authError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                        {authError}
                    </div>
                )}

                <form onSubmit={handleLogin}>
                    <InputField label="Email Address" type="email" name="email"
                        placeholder="admin@curesense.com" value={email}
                        onChange={(e) => setEmail(e.target.value)} />

                    <PasswordInput name="password" value={password}
                        onChange={(e) => setPassword(e.target.value)} />

                    <div className="flex justify-between items-center mb-6">
                        <label className="flex items-center gap-2 text-sm text-gray-600">
                            <input type="checkbox" className="w-4 h-4 accent-blue-600" />
                            Remember Me
                        </label>
                        <Link to="/admin/forgot-password" className="text-sm text-blue-600 hover:underline">
                            Forgot Password?
                        </Link>
                    </div>

                    <button type="submit" disabled={loading}
                        className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition shadow-md disabled:opacity-60">
                        {loading ? "Signing in…" : "Login"}
                    </button>
                </form>
            </div>
        </AuthLayout>
    );
};

export default AdminLogin;
