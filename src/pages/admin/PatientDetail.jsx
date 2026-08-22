import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { ArrowLeft, UserPlus } from "lucide-react";
import patientPlaceholder from "../../assets/images/patient-avatar.jpg";
import { selectToken } from "../../features/auth/authSlice";
import { api } from "../../utils/api";

function InfoItem({ title, value }) {
    return (
        <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="mt-1 text-lg font-semibold text-slate-800">{value || "—"}</p>
        </div>
    );
}

function calcAge(dob) {
    if (!dob) return "—";
    return Math.floor((Date.now() - new Date(dob)) / (1000 * 60 * 60 * 24 * 365.25));
}

function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

export default function PatientDetail() {
    const { id }   = useParams();
    const navigate = useNavigate();
    const token    = useSelector(selectToken);

    const [patient,   setPatient]   = useState(null);
    const [loading,   setLoading]   = useState(true);
    const [error,     setError]     = useState(null);

    // Assign-doctor section state
    const [doctors,        setDoctors]        = useState([]);
    const [selectedDoctor, setSelectedDoctor] = useState("");
    const [assigning,      setAssigning]      = useState(false);
    const [assignMsg,      setAssignMsg]      = useState(null); // { ok: bool, text: string }

    useEffect(() => {
        if (!token || !id) return;
        api.get(`/api/patients/${id}`, token)
            .then(data => setPatient(data))
            .catch(err  => setError(err.message))
            .finally(() => setLoading(false));
        // Load verified doctors for the assign dropdown
        api.get("/api/doctors?status=verified&limit=100", token)
            .then(data => setDoctors(data.results ?? []))
            .catch(() => {});
    }, [id, token]);

    async function handleAssign(e) {
        e.preventDefault();
        if (!selectedDoctor) return;
        setAssigning(true);
        setAssignMsg(null);
        try {
            const doc = doctors.find(d => d._id === selectedDoctor);
            await api.post("/api/auth/assign", {
                doctor_user_id: doc?.user_id?._id || doc?.user_id,
                patient_id:     id,
            }, token);
            setAssignMsg({ ok: true, text: `Patient successfully assigned to ${doc?.user_id?.name || "the doctor"}.` });
            setSelectedDoctor("");
        } catch (err) {
            setAssignMsg({ ok: false, text: err.message });
        } finally {
            setAssigning(false);
        }
    }

    if (loading) return <div className="p-8 text-gray-400">Loading patient…</div>;
    if (error)   return <div className="p-8 text-red-500">Error: {error}</div>;
    if (!patient) return null;

    return (
        <div className="space-y-8">
            <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-2 text-[#264296] hover:underline">
                <ArrowLeft size={18} />
                Back to Manage Patients
            </button>

            <div>
                <h1 className="text-3xl font-bold text-slate-800">Patient Details</h1>
                <p className="text-gray-500 mt-2">View patient's account information.</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                <div className="grid grid-cols-12 gap-10">
                    {/* LEFT */}
                    <div className="col-span-4 border-r border-gray-200 pr-8">
                        <div className="flex flex-col items-center">
                            <img
                                src={patientPlaceholder}
                                alt={patient.name}
                                className="w-40 h-40 rounded-full object-cover border-4 border-blue-100"
                            />
                            <h2 className="text-2xl font-bold text-slate-800 mt-6">{patient.name}</h2>
                            <p className="text-gray-500 mt-2">
                                {patient.gender} · {calcAge(patient.dob)} yrs
                            </p>
                        </div>
                    </div>

                    {/* RIGHT */}
                    <div className="col-span-8 space-y-8">
                        {/* Personal Information */}
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 mb-5">Personal Information</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <InfoItem title="Full Name"    value={patient.name} />
                                <InfoItem title="Age"          value={`${calcAge(patient.dob)} years`} />
                                <InfoItem title="Gender"       value={patient.gender} />
                                <InfoItem title="Date of Birth" value={fmtDate(patient.dob)} />
                            </div>
                        </div>

                        <hr />

                        {/* Contact */}
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 mb-5">Contact Information</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <InfoItem title="Email" value={patient.contact?.email} />
                                <InfoItem title="Phone" value={patient.contact?.phone} />
                            </div>
                        </div>

                        <hr />

                        {/* Medical */}
                        {(patient.medical_conditions?.length > 0 || patient.allergies?.length > 0 || patient.current_medications?.length > 0) && (
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 mb-5">Medical Information</h3>
                                <div className="space-y-4">
                                    {patient.medical_conditions?.length > 0 && (
                                        <InfoItem title="Medical Conditions" value={patient.medical_conditions.join(", ")} />
                                    )}
                                    {patient.allergies?.length > 0 && (
                                        <InfoItem title="Allergies" value={patient.allergies.join(", ")} />
                                    )}
                                    {patient.current_medications?.length > 0 && (
                                        <InfoItem title="Current Medications" value={patient.current_medications.join(", ")} />
                                    )}
                                </div>
                            </div>
                        )}

                        <hr />

                        {/* Account */}
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 mb-5">Account Information</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <InfoItem title="Registration Date" value={fmtDate(patient.created_at)} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Assign Doctor */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                <div className="flex items-center gap-3 mb-6">
                    <UserPlus size={20} className="text-[#264296]" />
                    <h3 className="text-xl font-bold text-slate-800">Assign Doctor</h3>
                </div>
                <p className="text-gray-500 text-sm mb-5">
                    Directly assign a verified doctor to this patient, bypassing the standard appointment review flow.
                    Use this for administrative overrides only.
                </p>

                {assignMsg && (
                    <div className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium ${assignMsg.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                        {assignMsg.text}
                    </div>
                )}

                <form onSubmit={handleAssign} className="flex items-end gap-4">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-600 mb-2">Select Doctor</label>
                        <select
                            value={selectedDoctor}
                            onChange={e => setSelectedDoctor(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#264296]"
                            required
                        >
                            <option value="">— Choose a verified doctor —</option>
                            {doctors.map(doc => (
                                <option key={doc._id} value={doc._id}>
                                    {doc.user_id?.name || "Unknown"} · {doc.specialty}{doc.hospital_clinic ? ` · ${doc.hospital_clinic}` : ""}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="submit" disabled={assigning || !selectedDoctor}
                        className="bg-[#264296] hover:bg-[#1e3480] disabled:opacity-50 text-white px-6 py-3 rounded-xl font-semibold text-sm transition shrink-0"
                    >
                        {assigning ? "Assigning…" : "Assign"}
                    </button>
                </form>
            </div>
        </div>
    );
}
