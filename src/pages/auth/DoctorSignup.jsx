import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import AuthLayout from "../../components/auth/AuthLayout";
import InputField from "../../components/auth/InputField";
import PasswordInput from "../../components/auth/PasswordInput";
import { loginStart, loginFailure, selectAuthLoading, selectAuthError } from "../../features/auth/authSlice";
import { api } from "../../utils/api";

const SPECIALTIES = [
  "Cardiologist",
  "Neurologist",
  "Dermatologist",
  "General Physician",
  "Orthopedic Surgeon",
  "Pediatrician",
  "Psychiatrist",
  "Radiologist",
  "Ophthalmologist",
  "ENT Specialist",
  "Gynecologist",
  "Urologist",
];

const DoctorSignup = () => {
    const navigate  = useNavigate();
    const dispatch  = useDispatch();
    const loading   = useSelector(selectAuthLoading);
    const authError = useSelector(selectAuthError);

    const [formData, setFormData] = useState({
        firstName:       "",
        lastName:        "",
        email:           "",
        phone:           "",
        password:        "",
        confirmPassword: "",
        pmdc_number:     "",
        specialization:  "",
        sub_specialty:   "",
        gender:          "",
        hospital:        "",
        experience:      "",
        city:            "",
        address:         "",
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        dispatch(loginStart());

        try {
            await api.post("/api/doctors/register", {
                firstName:        formData.firstName,
                lastName:         formData.lastName,
                email:            formData.email,
                phone:            formData.phone,
                password:         formData.password,
                confirmPassword:  formData.confirmPassword,
                pmdc_number:      formData.pmdc_number,
                specialty:        formData.specialization,
                sub_specialty:    formData.sub_specialty,
                gender:           formData.gender,
                hospital_clinic:  formData.hospital,
                experience_years: formData.experience ? Number(formData.experience) : 0,
                city:             formData.city,
                address:          formData.address,
            });

            // Don't auto-login — send doctor to login page with a success note.
            // Admin must verify their PMDC before they can access the dashboard.
            dispatch(loginFailure(null));
            navigate("/doctor/login", { state: { registered: true } });
        } catch (err) {
            dispatch(loginFailure(err.message));
        }
    };

    return (
        <AuthLayout>
            <div>
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-gray-800">Create Doctor Account</h2>
                    <p className="text-gray-500 mt-2">Join CureSense healthcare network</p>
                </div>

                {authError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                        {authError}
                    </div>
                )}

                <form onSubmit={handleSignup}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputField label="First Name" placeholder="John" value={formData.firstName} onChange={handleChange} name="firstName" />
                        <InputField label="Last Name"  placeholder="Smith" value={formData.lastName}  onChange={handleChange} name="lastName"  />
                        <InputField label="Email Address" type="email" placeholder="doctor@example.com" value={formData.email} onChange={handleChange} name="email" />
                        <InputField label="Phone Number" placeholder="+92 300 1234567" value={formData.phone} onChange={handleChange} name="phone" />
                    </div>

                    <PasswordInput label="Password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                    <PasswordInput label="Confirm Password" placeholder="Confirm password" value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} />

                    <div className="border-t my-6"></div>
                    <h3 className="font-semibold text-gray-700 mb-4">Professional Information</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputField label="PMDC License Number" placeholder="PMDC-12345" value={formData.pmdc_number} onChange={handleChange} name="pmdc_number" />

                        {/* Specialization */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Specialization</label>
                            <select name="specialization" value={formData.specialization} onChange={handleChange}
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">Select specialization</option>
                                {SPECIALTIES.map(s => <option key={s}>{s}</option>)}
                            </select>
                        </div>

                        <InputField label="Sub-Specialty (optional)" placeholder="e.g. Interventional Cardiology" value={formData.sub_specialty} onChange={handleChange} name="sub_specialty" />

                        {/* Gender */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                            <select name="gender" value={formData.gender} onChange={handleChange}
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">Select gender</option>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                            </select>
                        </div>

                        <InputField label="Hospital / Clinic" placeholder="City Hospital" value={formData.hospital} onChange={handleChange} name="hospital" />
                        <InputField label="Years of Experience" type="number" placeholder="5" value={formData.experience} onChange={handleChange} name="experience" />
                        <InputField label="City" placeholder="Islamabad" value={formData.city} onChange={handleChange} name="city" />
                        <InputField label="Clinic Address (optional)" placeholder="Street, Area" value={formData.address} onChange={handleChange} name="address" />
                    </div>

                    <label className="flex gap-2 items-center text-sm text-gray-600 my-5">
                        <input type="checkbox" className="accent-blue-600" required />
                        I agree to CureSense Terms & Privacy Policy
                    </label>

                    <button type="submit" disabled={loading}
                        className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition shadow-md disabled:opacity-60">
                        {loading ? "Creating Account…" : "Create Account"}
                    </button>
                </form>

                <p className="text-center text-sm text-gray-600 mt-6">
                    Already have an account?
                    <Link to="/doctor/login" className="text-blue-600 font-semibold ml-1 hover:underline">Login</Link>
                </p>
            </div>
        </AuthLayout>
    );
};

export default DoctorSignup;
