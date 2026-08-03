import { useState } from "react";
import AuthLayout from "../../components/auth/AuthLayout";
import InputField from "../../components/auth/InputField";
import PasswordInput from "../../components/auth/PasswordInput";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";


const DoctorLogin = () => {

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const navigate = useNavigate();


    const handleLogin = (e) => {
        e.preventDefault();

        console.log({
            email,
            password
        });

        // Backend authentication will be connected later
    };


    return (

        <AuthLayout>

            <div>

                {/* Header */}
                <div className="text-center mb-8">

                    <h2 className="text-3xl font-bold text-gray-800">
                        Welcome Back Doctor
                    </h2>

                    <p className="text-gray-500 mt-2">
                        Sign in to access your CureSense dashboard
                    </p>

                </div>



                <form onSubmit={handleLogin}>


                    <InputField
                        label="Email Address"
                        type="email"
                        placeholder="doctor@example.com"
                        value={email}
                        onChange={(e)=>setEmail(e.target.value)}
                    />


                    <PasswordInput
                        value={password}
                        onChange={(e)=>setPassword(e.target.value)}
                    />



                    {/* Remember + Forgot */}
                    <div className="flex justify-between items-center mb-6">


                        <label className="flex items-center gap-2 text-sm text-gray-600">

                            <input 
                                type="checkbox"
                                className="w-4 h-4 accent-blue-600"
                            />

                            Remember me

                        </label>



                        <Link
    to="/doctor/forgot-password"
    className="text-sm text-blue-600 hover:underline"
>
    Forgot Password?
</Link>


                    </div>




                    {/* Login Button */}
                    <button onClick={()=>navigate("/")}
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



                {/* Signup Link */}
                <p className="text-center text-sm text-gray-600 mt-6">

                    Don't have an account?

                   
                   <Link 
                        to="/doctor/signup"
                       className="text-blue-600 font-semibold ml-1 hover:underline"
                       >
                       Create Account
                     </Link>

                </p>


            </div>


        </AuthLayout>

    )
}


export default DoctorLogin;