import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import AuthLayout from "../../components/auth/AuthLayout";
import InputField from "../../components/auth/InputField";
import PasswordInput from "../../components/auth/PasswordInput";
import { loginStart, loginFailure, selectAuthLoading, selectAuthError } from "../../features/auth/authSlice";
import { api } from "../../utils/api";
import { useSpecialties } from "../../utils/useSpecialties";

const DoctorSignup = () => {
    const { specialties, error: specialtiesError } = useSpecialties();
    const navigate  = useNavigate();
    const dispatch  = useDispatch();
    const loading   = useSelector(selectAuthLoading);
    const authError = useSelector(selectAuthError);

    const cnicInputRef = useRef(null);
    const [cnicScan,     setCnicScan]     = useState({ status: "idle", error: null });
    const [cnicImageUrl, setCnicImageUrl] = useState("");

    const handleCnicUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCnicScan({ status: "scanning", error: null });
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const base64 = evt.target.result.split(",")[1];
                const result = await api.post("/api/doctors/verify-cnic", { cnic_image_base64: base64 });
                const parts     = (result.name || "").trim().split(/\s+/);
                const firstName = parts[0]                 || "";
                const lastName  = parts.slice(1).join(" ") || "";
                setFormData((prev) => ({
                    ...prev,
                    firstName,
                    lastName,
                    fatherName: result.father_name || prev.fatherName,
                }));
                setCnicImageUrl(result.cnic_image_url || "");
                setCnicScan({ status: "done", error: null });
            } catch (err) {
                setCnicScan({ status: "error", error: err.message || "Could not read CNIC — please fill the name fields manually." });
            }
        };
        reader.readAsDataURL(file);
    };

    const [formData, setFormData] = useState({
        firstName:            "",
        lastName:             "",
        fatherName:           "",
        email:                "",
        phone:                "",
        password:             "",
        confirmPassword:      "",
        pmdc_number:          "",
        specialization:       "",
        sub_specialty:        "",
        gender:               "",
        hospital:             "",
        experience:           "",
        city:                 "",
        address:              "",
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSignup = async (e) => {
        e.preventDefault();

        if (cnicScan.status !== "done") {
            dispatch(loginFailure("CNIC photo is required. Please upload a clear photo of your CNIC to continue."));
            return;
        }

        // Field-specific validation before hitting the API
        const missing = [];
        if (!formData.firstName.trim())    missing.push("First Name");
        if (!formData.lastName.trim())     missing.push("Last Name");
        if (!formData.fatherName.trim())   missing.push("Father Name");
        if (!formData.email.trim())        missing.push("Email Address");
        if (!formData.phone.trim())        missing.push("Phone Number");
        if (!formData.password)            missing.push("Password");
        if (!formData.pmdc_number.trim())  missing.push("PMDC License Number");
        if (!formData.specialization)      missing.push("Specialization");
        if (!formData.gender)              missing.push("Gender");
        if (!formData.city.trim())         missing.push("City");
        if (missing.length) {
            dispatch(loginFailure(`Please fill in the following required fields: ${missing.join(", ")}`));
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            dispatch(loginFailure("Passwords do not match"));
            return;
        }

        dispatch(loginStart());

        try {
            await api.post("/api/doctors/register", {
                firstName:               formData.firstName,
                lastName:                formData.lastName,
                name_as_per_cnic:        `${formData.firstName.trim()} ${formData.lastName.trim()}`,
                father_name_as_per_cnic: formData.fatherName,
                email:                   formData.email,
                phone:                   formData.phone,
                password:                formData.password,
                confirmPassword:         formData.confirmPassword,
                pmdc_number:             formData.pmdc_number,
                specialty:               formData.specialization,
                sub_specialty:           formData.sub_specialty,
                gender:                  formData.gender,
                hospital_clinic:         formData.hospital,
                experience_years:        formData.experience ? Number(formData.experience) : 0,
                city:                    formData.city,
                address:                 formData.address,
                cnic_image_url:          cnicImageUrl,
            });

            // Send doctor to verify-email page — they must click the link before they can sign in.
            dispatch(loginFailure(null));
            navigate("/doctor/verify-email", { state: { email: formData.email } });
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
                    {/* CNIC photo — required for PMDC identity verification */}
                    <div className={`mb-4 p-4 rounded-xl border-2 transition-colors ${
                        cnicScan.status === "done" ? "border-green-400 bg-green-50" : "border-red-300 bg-red-50"
                    }`}>
                        <div className="flex items-start justify-between mb-1">
                            <p className="text-sm font-semibold text-gray-800">
                                CNIC Photo
                                <span className="ml-2 text-xs font-normal text-red-500">* Required</span>
                            </p>
                            {cnicScan.status === "done" && (
                                <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✓ Scanned</span>
                            )}
                        </div>

                        <p className="text-xs text-gray-500 mb-3">
                            Upload a clear photo of your CNIC. Your name and father&apos;s name will be extracted automatically and used to verify your PMDC registration.
                        </p>

                        <input ref={cnicInputRef} type="file" accept="image/*" className="hidden" onChange={handleCnicUpload} />

                        <button type="button"
                            onClick={() => cnicInputRef.current?.click()}
                            disabled={cnicScan.status === "scanning"}
                            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition">
                            {cnicScan.status === "scanning"
                                ? "Scanning…"
                                : cnicScan.status === "done"
                                ? "Re-upload CNIC"
                                : "Upload CNIC Photo"}
                        </button>

                        {cnicScan.status === "done" && (
                            <p className="mt-2 text-xs text-green-700 font-medium">
                                Name and father&apos;s name extracted — review the fields below and edit if anything was misread.
                            </p>
                        )}
                        {cnicScan.status === "error" && (
                            <p className="mt-2 text-xs text-red-600">{cnicScan.error} Try uploading a clearer photo.</p>
                        )}
                    </div>

                    <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-xs">
                        Enter your name and father&apos;s name <strong>exactly as printed on your CNIC</strong> — these are used to verify your identity against PMDC records.
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputField label="First Name (as per CNIC) *" placeholder="e.g. Hassan" value={formData.firstName} onChange={handleChange} name="firstName" />
                        <InputField label="Last Name (as per CNIC) *"  placeholder="e.g. Raheem"  value={formData.lastName}  onChange={handleChange} name="lastName"  />
                        <InputField label="Father Name (as per CNIC) *" placeholder="e.g. Muhammad Raheem" value={formData.fatherName} onChange={handleChange} name="fatherName" />
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
                            <label className="block text-sm font-medium text-gray-700 mb-1">Specialization *</label>
                            <p className="text-xs text-gray-500 mb-2">Select the specialty that matches your PMDC registration</p>
                            <select name="specialization" value={formData.specialization} onChange={handleChange}
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">Select specialization</option>
                                {specialties.map(s => <option key={s}>{s}</option>)}
                            </select>
                            {specialtiesError && <p className="text-sm text-red-600 mt-1">{specialtiesError}</p>}
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

                    <button type="submit"
                        disabled={loading || cnicScan.status === "scanning" || cnicScan.status !== "done"}
                        className={`w-full py-3 rounded-xl font-semibold transition shadow-md text-white ${
                            cnicScan.status === "done"
                                ? "bg-blue-600 hover:bg-blue-700"
                                : "bg-gray-400 cursor-not-allowed opacity-60"
                        }`}>
                        {loading ? "Creating Account…" : "Create Account"}
                    </button>
                    {cnicScan.status !== "done" && (
                        <p className="text-xs text-center text-gray-400 mt-2">Upload your CNIC photo above to enable registration</p>
                    )}
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
