import { useState } from "react";
import AuthLayout from "../../components/auth/AuthLayout";
import InputField from "../../components/auth/InputField";
import PasswordInput from "../../components/auth/PasswordInput";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";

const DoctorSignup = () => {
    const navigate = useNavigate();


    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        password: "",
        confirmPassword: "",
        licenseNumber: "",
        specialization: "",
        hospital: "",
        experience: "",
        city: ""
    });



    const handleChange = (e) => {

        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });

    };



    const handleSignup = (e) => {

        e.preventDefault();

        console.log(formData);

        // Backend registration will be connected later

    };



    return (

        <AuthLayout>


            <div>


                {/* Header */}

                <div className="text-center mb-8">

                    <h2 className="text-3xl font-bold text-gray-800">
                        Create Doctor Account
                    </h2>

                    <p className="text-gray-500 mt-2">
                        Join CureSense healthcare network
                    </p>

                </div>



                <form onSubmit={handleSignup}>


                    {/* Two Column Layout */}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">


                        <InputField
                            label="First Name"
                            placeholder="John"
                            value={formData.firstName}
                            onChange={handleChange}
                            name="firstName"
                        />


                        <InputField
                            label="Last Name"
                            placeholder="Smith"
                            value={formData.lastName}
                            onChange={handleChange}
                            name="lastName"
                        />



                        <InputField
                            label="Email Address"
                            type="email"
                            placeholder="doctor@example.com"
                            value={formData.email}
                            onChange={handleChange}
                            name="email"
                        />


                        <InputField
                            label="Phone Number"
                            placeholder="+92 300 1234567"
                            value={formData.phone}
                            onChange={handleChange}
                            name="phone"
                        />


                    </div>



                    <PasswordInput
                        label="Password"
                        value={formData.password}
                        onChange={(e)=>
                            setFormData({
                                ...formData,
                                password:e.target.value
                            })
                        }
                    />


                    <PasswordInput
                        label="Confirm Password"
                        placeholder="Confirm password"
                        value={formData.confirmPassword}
                        onChange={(e)=>
                            setFormData({
                                ...formData,
                                confirmPassword:e.target.value
                            })
                        }
                    />




                    <div className="border-t my-6"></div>



                    <h3 className="font-semibold text-gray-700 mb-4">
                        Professional Information
                    </h3>




                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">


                        <InputField
                            label="Medical License Number"
                            placeholder="ML-12345"
                            value={formData.licenseNumber}
                            onChange={handleChange}
                            name="licenseNumber"
                        />



                        {/* Specialization */}

                        <div className="mb-4">

                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Specialization
                            </label>


                            <select
                                name="specialization"
                                value={formData.specialization}
                                onChange={handleChange}
                                className="
                                    w-full
                                    px-4
                                    py-3
                                    border
                                    border-gray-300
                                    rounded-xl
                                    outline-none
                                    focus:ring-2
                                    focus:ring-blue-500
                                "
                            >

                                <option value="">
                                    Select specialization
                                </option>

                                <option>
                                    Cardiologist
                                </option>

                                <option>
                                    Neurologist
                                </option>

                                <option>
                                    Dermatologist
                                </option>

                                <option>
                                    General Physician
                                </option>

                            </select>


                        </div>



                        <InputField
                            label="Hospital / Clinic"
                            placeholder="City Hospital"
                            value={formData.hospital}
                            onChange={handleChange}
                            name="hospital"
                        />



                        <InputField
                            label="Years of Experience"
                            type="number"
                            placeholder="5"
                            value={formData.experience}
                            onChange={handleChange}
                            name="experience"
                        />



                        <InputField
                            label="City"
                            placeholder="Islamabad"
                            value={formData.city}
                            onChange={handleChange}
                            name="city"
                        />


                    </div>



                    {/* Terms */}

                    <label className="flex gap-2 items-center text-sm text-gray-600 my-5">

                        <input 
                            type="checkbox"
                            className="accent-blue-600"
                        />

                        I agree to CureSense Terms & Privacy Policy

                    </label>





                    <button onClick={()=>navigate('/doctor/login')}
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
                        Create Account
                    </button>



                </form>




                <p className="text-center text-sm text-gray-600 mt-6">

                    Already have an account?

                    <Link 
                        to="/doctor/login"
                       className="text-blue-600 font-semibold ml-1 hover:underline"
                      >
                          Login
                      </Link>
                </p>


            </div>



        </AuthLayout>

    )

}


export default DoctorSignup;