import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import AuthLayout from "../../components/auth/AuthLayout";
import InputField from "../../components/auth/InputField";
import PasswordInput from "../../components/auth/PasswordInput";

const AdminLogin = () => {

    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const handleLogin = (e) => {

        e.preventDefault();

        // Temporary Login
        if (
            email === "admin@curesense.com" &&
            password === "admin123"
        ) {

            navigate("/admin");

        } else {

            alert("Invalid Admin Credentials");

        }

    };

    return (

        <AuthLayout>

            <div>

                {/* Header */}

                <div className="text-center mb-8">

                    <h2 className="text-3xl font-bold text-gray-800">
                        Welcome Back Admin
                    </h2>

                    <p className="text-gray-500 mt-2">
                        Login to access the CureSense Admin Dashboard
                    </p>

                </div>

                <form onSubmit={handleLogin}>

                    <InputField
                        label="Email Address"
                        type="email"
                        name="email"
                        placeholder="admin@curesense.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />

                    <PasswordInput
                        name="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />

                    <div className="flex justify-between items-center mb-6">

                        <label className="flex items-center gap-2 text-sm text-gray-600">

                            <input
                                type="checkbox"
                                className="w-4 h-4 accent-blue-600"
                            />

                            Remember Me

                        </label>

                        <Link
                            to="/admin/forgot-password"
                            className="text-sm text-blue-600 hover:underline"
                        >
                            Forgot Password?
                        </Link>

                    </div>

                    <button
                        type="submit"
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
                        "
                    >
                        Login
                    </button>

                </form>

            </div>

        </AuthLayout>

    );

};

export default AdminLogin;