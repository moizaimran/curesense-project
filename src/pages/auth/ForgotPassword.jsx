import { useState } from "react";
import { Link } from "react-router-dom";

import AuthLayout from "../../components/auth/AuthLayout";
import InputField from "../../components/auth/InputField";


const ForgotPassword = () => {


    const [email, setEmail] = useState("");



    const handleSubmit = (e) => {

        e.preventDefault();

        console.log(email);

        // Backend reset password API will come later

    };



    return (

        <AuthLayout>


            <div>


                {/* Header */}

                <div className="text-center mb-8">

                    <h2 className="text-3xl font-bold text-gray-800">
                        Forgot Password?
                    </h2>


                    <p className="text-gray-500 mt-2">
                        Enter your email and we will help you reset your password.
                    </p>


                </div>





                <form onSubmit={handleSubmit}>


                    <InputField

                        label="Email Address"

                        type="email"

                        placeholder="doctor@example.com"

                        value={email}

                        onChange={(e)=>setEmail(e.target.value)}

                    />



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
                        Send Reset Link
                    </button>



                </form>




                <div className="text-center mt-6">


                    <p className="text-sm text-gray-600">

                        Remember your password?


                        <Link

                            to="/doctor/login"

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

    )

}


export default ForgotPassword;