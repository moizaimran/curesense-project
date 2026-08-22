import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { Eye, Search, CheckCircle, XCircle, Clock3, Users, UserCheck, UserX } from "lucide-react";
import DoctorStatCard from "../../components/admin/Doctors/DoctorStatCard";
import doctorPlaceholder from "../../assets/images/doctor-avatar.jpg";
import { selectToken } from "../../features/auth/authSlice";
import { api } from "../../utils/api";

// Map backend status values to display labels + badge colours
const STATUS_DISPLAY = {
    pending:  { label: "Pending",  cls: "bg-yellow-100 text-yellow-700" },
    verified: { label: "Approved", cls: "bg-green-100 text-green-700"  },
    rejected: { label: "Rejected", cls: "bg-red-100 text-red-700"      },
};

export default function ManageDoctors() {
    const navigate = useNavigate();
    const token    = useSelector(selectToken);

    const [doctors,      setDoctors]      = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [error,        setError]        = useState(null);
    const [search,       setSearch]       = useState("");
    const [statusFilter, setStatusFilter] = useState("All");
    const [currentPage,  setCurrentPage]  = useState(1);
    const doctorsPerPage = 5;

    useEffect(() => {
        async function fetchDoctors() {
            try {
                setLoading(true);
                const data = await api.get("/api/doctors/admin/all?limit=200", token);
                setDoctors(data.results || []);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchDoctors();
    }, [token]);

    const filteredDoctors = doctors.filter((doc) => {
        const name = (doc.contact?.email || "") + " " + (doc.specialty || "") + " " + (doc.hospital_clinic || "");
        const matchesSearch = name.toLowerCase().includes(search.toLowerCase())
            || (doc.specialty || "").toLowerCase().includes(search.toLowerCase())
            || (doc.hospital_clinic || "").toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === "All" || doc.status === statusFilter.toLowerCase();
        return matchesSearch && matchesStatus;
    });

    const totalPages      = Math.ceil(filteredDoctors.length / doctorsPerPage);
    const indexOfLast     = currentPage * doctorsPerPage;
    const indexOfFirst    = indexOfLast - doctorsPerPage;
    const currentDoctors  = filteredDoctors.slice(indexOfFirst, indexOfLast);

    const counts = {
        total:    doctors.length,
        pending:  doctors.filter(d => d.status === "pending").length,
        verified: doctors.filter(d => d.status === "verified").length,
        rejected: doctors.filter(d => d.status === "rejected").length,
    };

    if (loading) return <div className="p-8 text-gray-500">Loading doctors…</div>;
    if (error)   return <div className="p-8 text-red-600">Error: {error}</div>;

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-800">Manage Doctors</h1>
                <p className="text-gray-500 mt-2">Review and manage all registered doctors.</p>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-4 gap-6 mb-8">
                <DoctorStatCard title="Total Doctors" value={counts.total}    icon={<Users     size={26} className="text-[#264296]"  />} bgColor="text-[#264296]"  iconBg="bg-blue-100"   />
                <DoctorStatCard title="Pending"        value={counts.pending}  icon={<Clock3    size={26} className="text-yellow-600"/>} bgColor="text-yellow-600" iconBg="bg-yellow-100" />
                <DoctorStatCard title="Approved"       value={counts.verified} icon={<UserCheck size={26} className="text-green-600" />} bgColor="text-green-600"  iconBg="bg-green-100"  />
                <DoctorStatCard title="Rejected"       value={counts.rejected} icon={<UserX     size={26} className="text-red-600"   />} bgColor="text-red-600"    iconBg="bg-red-100"    />
            </div>

            {/* Search + Filter */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-8">
                <div className="flex flex-col lg:flex-row gap-5 justify-between items-center">
                    <div className="relative w-full lg:w-112.5">
                        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" placeholder="Search by specialty or hospital…" value={search}
                            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-12 pr-5 py-3 rounded-xl border border-gray-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#264296] transition" />
                    </div>
                    <div className="flex gap-4 w-full lg:w-auto">
                        <select value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                            className="px-5 py-3 rounded-xl border border-gray-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#264296]">
                            <option value="All">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="verified">Approved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                        <button onClick={() => { setSearch(""); setStatusFilter("All"); setCurrentPage(1); }}
                            className="px-5 py-3 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 font-medium transition">
                            Reset
                        </button>
                    </div>
                </div>
                <div className="flex justify-between items-center mt-5">
                    <p className="text-gray-500">
                        Showing <span className="font-semibold text-[#264296]">{currentDoctors.length}</span> of <span className="font-semibold text-[#264296]">{filteredDoctors.length}</span> doctors
                    </p>
                </div>
            </div>

            {/* Doctor cards */}
            <div className="space-y-6">
                {currentDoctors.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">No doctors match your filters.</div>
                ) : currentDoctors.map((doc) => {
                    const badge = STATUS_DISPLAY[doc.status] || { label: doc.status, cls: "bg-gray-100 text-gray-700" };
                    return (
                        <div key={doc._id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition p-6 flex justify-between items-center">
                            <div className="flex items-center gap-5">
                                <img src={doctorPlaceholder} alt="Doctor" className="w-20 h-20 rounded-full object-cover border-4 border-blue-100" />
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800">{doc.contact?.email || "—"}</h2>
                                    <p className="text-gray-500 mt-1">{doc.specialty}</p>
                                    <p className="text-gray-500">{doc.hospital_clinic}</p>
                                    <p className="text-sm text-blue-700 mt-1">PMDC: {doc.pmdc_number}</p>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-4">
                                <span className={`px-4 py-2 rounded-full text-sm font-semibold ${badge.cls}`}>{badge.label}</span>
                                <button onClick={() => navigate(`/admin/doctors/${doc._id}`)}
                                    className="flex items-center gap-2 bg-[#264296] hover:bg-[#1f3578] text-white px-5 py-3 rounded-xl transition">
                                    <Eye size={18} /> View Details
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-between items-center mt-10">
                    <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}
                        className={`px-5 py-2 rounded-lg font-medium transition ${currentPage === 1 ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-[#264296] text-white hover:bg-[#1f3578]"}`}>
                        ← Previous
                    </button>
                    <div className="flex gap-3">
                        {Array.from({ length: totalPages }, (_, i) => (
                            <button key={i} onClick={() => setCurrentPage(i + 1)}
                                className={`w-10 h-10 rounded-lg font-semibold transition ${currentPage === i + 1 ? "bg-[#264296] text-white" : "bg-gray-100 hover:bg-gray-200"}`}>
                                {i + 1}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}
                        className={`px-5 py-2 rounded-lg font-medium transition ${currentPage === totalPages ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-[#264296] text-white hover:bg-[#1f3578]"}`}>
                        Next →
                    </button>
                </div>
            )}
        </div>
    );
}
