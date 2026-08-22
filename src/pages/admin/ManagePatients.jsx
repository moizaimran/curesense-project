import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { Eye, Users } from "lucide-react";
import patientPlaceholder from "../../assets/images/patient-avatar.jpg";
import { selectToken } from "../../features/auth/authSlice";
import { api } from "../../utils/api";

function calcAge(dob) {
    if (!dob) return "—";
    return Math.floor((Date.now() - new Date(dob)) / (1000 * 60 * 60 * 24 * 365.25));
}

function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

export default function ManagePatients() {
    const navigate = useNavigate();
    const token    = useSelector(selectToken);

    const [patients,     setPatients]     = useState([]);
    const [total,        setTotal]        = useState(0);
    const [loading,      setLoading]      = useState(true);
    const [error,        setError]        = useState(null);
    const [search,       setSearch]       = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [currentPage,  setCurrentPage]  = useState(1);
    const patientsPerPage = 10;

    // Debounce search input
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 350);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch]);

    useEffect(() => {
        if (!token) return;
        setLoading(true);
        const params = new URLSearchParams({
            page:  currentPage,
            limit: patientsPerPage,
            ...(debouncedSearch ? { search: debouncedSearch } : {}),
        });
        api.get(`/api/patients?${params}`, token)
            .then(data => {
                setPatients(data.results || []);
                setTotal(data.total || 0);
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [token, currentPage, debouncedSearch]);

    const totalPages = Math.ceil(total / patientsPerPage);

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-800">Manage Patients</h1>
                <p className="text-gray-500 mt-2">View all registered patients.</p>
            </div>

            <div className="flex justify-between items-center mb-8">
                <div className="w-[420px]">
                    <input
                        type="text"
                        placeholder="Search by name or email…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full px-5 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#264296]"
                    />
                </div>
                <span className="text-sm text-gray-500 font-medium">
                    {total} patient{total !== 1 ? "s" : ""} registered
                </span>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="text-center py-16 text-gray-400">Loading patients…</div>
            ) : patients.length === 0 ? (
                <div className="text-center py-16">
                    <Users size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-400">No patients found.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {patients.map((patient) => (
                        <div
                            key={patient._id}
                            className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition p-6 flex justify-between items-center"
                        >
                            <div className="flex items-center gap-5">
                                <img
                                    src={patientPlaceholder}
                                    alt={patient.name}
                                    className="w-16 h-16 rounded-full object-cover border-4 border-blue-100"
                                />
                                <div>
                                    <h2 className="text-lg font-bold text-slate-800">{patient.name}</h2>
                                    <p className="text-gray-500 text-sm mt-0.5">
                                        {patient.gender} · {calcAge(patient.dob)} yrs
                                    </p>
                                    <p className="text-gray-400 text-sm">{patient.contact?.email}</p>
                                    <p className="text-gray-400 text-sm">
                                        Registered: {fmtDate(patient.created_at)}
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => navigate(`/admin/patients/${patient._id}`)}
                                className="flex items-center gap-2 bg-[#264296] hover:bg-[#1f3578] text-white px-5 py-3 rounded-xl transition"
                            >
                                <Eye size={18} />
                                View Details
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-between items-center mt-10">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className={`px-5 py-2 rounded-lg font-medium transition ${
                            currentPage === 1
                                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                : "bg-[#264296] text-white hover:bg-[#1f3578]"
                        }`}
                    >
                        ← Previous
                    </button>

                    <div className="flex gap-3">
                        {Array.from({ length: totalPages }, (_, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrentPage(i + 1)}
                                className={`w-10 h-10 rounded-lg font-semibold transition ${
                                    currentPage === i + 1
                                        ? "bg-[#264296] text-white"
                                        : "bg-gray-100 hover:bg-gray-200"
                                }`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className={`px-5 py-2 rounded-lg font-medium transition ${
                            currentPage === totalPages
                                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                : "bg-[#264296] text-white hover:bg-[#1f3578]"
                        }`}
                    >
                        Next →
                    </button>
                </div>
            )}
        </div>
    );
}
