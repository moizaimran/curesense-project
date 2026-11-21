import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { Eye, Search, CheckCircle, XCircle, Clock3, Users, UserCheck, UserX, ShieldCheck, ShieldAlert, ShieldX, ShieldOff } from "lucide-react";

const PMDC_BADGE = {
    auto_approved: { label: "PMDC: Auto Approved", cls: "bg-green-100 text-green-700",   Icon: ShieldCheck },
    flagged:       { label: "PMDC: Needs Review",  cls: "bg-yellow-100 text-yellow-700",  Icon: ShieldAlert },
    rejected:      { label: "PMDC: Mismatch",      cls: "bg-red-100 text-red-700",        Icon: ShieldX     },
    pending:       { label: "PMDC: Checking…",     cls: "bg-gray-100 text-gray-500",      Icon: ShieldOff   },
};

function PmdcBadge({ verification }) {
    const decision = verification?.decision || "pending";
    const { label, cls, Icon } = PMDC_BADGE[decision] || PMDC_BADGE.pending;
    const pct = verification?.confidence != null
        ? ` (${Math.round(verification.confidence * 100)}%)`
        : "";
    return (
        <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${cls}`}>
            <Icon size={13} />{label}{pct}
        </span>
    );
}
import DoctorStatCard from "../../components/admin/Doctors/DoctorStatCard";
import doctorPlaceholder from "../../assets/images/doctor-avatar.jpg";
import { selectToken } from "../../features/auth/authSlice";
import { api } from "../../utils/api";
import { RatingBadge } from "../../components/common/StarRating";

// Map backend status values to display labels + badge colours
const STATUS_DISPLAY = {
    pending:  { label: "Pending",  cls: "bg-yellow-100 text-yellow-700" },
    verified: { label: "Approved", cls: "bg-green-100 text-green-700"  },
    rejected: { label: "Rejected", cls: "bg-red-100 text-red-700"      },
};

const SORTS = {
    newest:     (a, b) => new Date(b.created_at) - new Date(a.created_at),
    oldest:     (a, b) => new Date(a.created_at) - new Date(b.created_at),
    experience: (a, b) => (b.experience_years || 0) - (a.experience_years || 0),
    name:       (a, b) => doctorName(a).localeCompare(doctorName(b)),
    rating:     (a, b) => (b.rating?.average || 0) - (a.rating?.average || 0)
                       || (b.rating?.count || 0) - (a.rating?.count || 0),
};

function doctorName(doc) {
    return doc.user_id?.name || doc.name_as_per_cnic || doc.contact?.email || "—";
}

function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

const selectCls = "px-4 py-3 rounded-xl border border-gray-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#264296] text-sm";

export default function ManageDoctors() {
    const navigate = useNavigate();
    const token    = useSelector(selectToken);

    const [doctors,      setDoctors]      = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [error,        setError]        = useState(null);
    const [search,       setSearch]       = useState("");
    const [statusFilter, setStatusFilter] = useState("All");
    const [specialty,    setSpecialty]    = useState("All");
    const [city,         setCity]         = useState("All");
    const [gender,       setGender]       = useState("All");
    const [pmdcFilter,   setPmdcFilter]   = useState("All");
    const [minRating,    setMinRating]    = useState("All");
    const [sortBy,       setSortBy]       = useState("newest");
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

    const specialties = uniqueSorted(doctors.map(d => d.specialty));
    const cities      = uniqueSorted(doctors.map(d => d.location?.city));

    const q = search.trim().toLowerCase();
    const filteredDoctors = doctors
        .filter((doc) => {
            const haystack = [
                doctorName(doc), doc.contact?.email, doc.pmdc_number,
                doc.specialty, doc.hospital_clinic, doc.location?.city,
            ].join(" ").toLowerCase();
            return (!q || haystack.includes(q))
                && (statusFilter === "All" || doc.status === statusFilter)
                && (specialty    === "All" || doc.specialty === specialty)
                && (city         === "All" || doc.location?.city === city)
                && (gender       === "All" || doc.gender === gender)
                && (pmdcFilter   === "All" || (doc.pmdc_verification?.decision || "pending") === pmdcFilter)
                && (minRating    === "All"
                    || (minRating === "none"
                        ? !doc.rating?.count
                        : doc.rating?.count > 0 && doc.rating.average >= Number(minRating)));
        })
        .sort(SORTS[sortBy]);

    // Any filter change sends the user back to page 1
    const onFilter = (setter) => (e) => { setter(e.target.value); setCurrentPage(1); };

    function resetFilters() {
        setSearch(""); setStatusFilter("All"); setSpecialty("All"); setCity("All");
        setGender("All"); setPmdcFilter("All"); setMinRating("All"); setSortBy("newest"); setCurrentPage(1);
    }

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
                <div className="flex flex-col lg:flex-row gap-4 justify-between items-center">
                    <div className="relative w-full lg:flex-1">
                        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" placeholder="Search by name, email, PMDC no., specialty, hospital or city…" value={search}
                            onChange={onFilter(setSearch)}
                            className="w-full pl-12 pr-5 py-3 rounded-xl border border-gray-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#264296] transition" />
                    </div>
                    <select value={sortBy} onChange={onFilter(setSortBy)} className={selectCls} aria-label="Sort doctors">
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                        <option value="experience">Most experienced</option>
                        <option value="name">Name (A–Z)</option>
                        <option value="rating">Highest rated</option>
                    </select>
                    <button onClick={resetFilters}
                        className="px-5 py-3 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 font-medium transition">
                        Reset
                    </button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mt-4">
                    <select value={statusFilter} onChange={onFilter(setStatusFilter)} className={selectCls} aria-label="Status">
                        <option value="All">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="verified">Approved</option>
                        <option value="rejected">Rejected</option>
                    </select>
                    <select value={specialty} onChange={onFilter(setSpecialty)} className={selectCls} aria-label="Specialty">
                        <option value="All">All Specialties</option>
                        {specialties.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={city} onChange={onFilter(setCity)} className={selectCls} aria-label="City">
                        <option value="All">All Cities</option>
                        {cities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={gender} onChange={onFilter(setGender)} className={selectCls} aria-label="Gender">
                        <option value="All">Any Gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                    </select>
                    <select value={pmdcFilter} onChange={onFilter(setPmdcFilter)} className={selectCls} aria-label="PMDC check">
                        <option value="All">Any PMDC Result</option>
                        <option value="auto_approved">PMDC: Auto Approved</option>
                        <option value="flagged">PMDC: Needs Review</option>
                        <option value="rejected">PMDC: Mismatch</option>
                        <option value="pending">PMDC: Checking</option>
                    </select>
                    <select value={minRating} onChange={onFilter(setMinRating)} className={selectCls} aria-label="Rating">
                        <option value="All">Any Rating</option>
                        <option value="4.5">4.5★ &amp; up</option>
                        <option value="4">4★ &amp; up</option>
                        <option value="3">3★ &amp; up</option>
                        <option value="none">No ratings yet</option>
                    </select>
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
                                    <h2 className="text-xl font-bold text-slate-800">{doctorName(doc)}</h2>
                                    <p className="text-gray-400 text-sm">{doc.contact?.email}</p>
                                    <p className="text-gray-500 mt-1">{doc.specialty}</p>
                                    <p className="text-gray-500">{[doc.hospital_clinic, doc.location?.city].filter(Boolean).join(" · ")}</p>
                                    <p className="text-sm text-blue-700 mt-1">PMDC: {doc.pmdc_number}</p>
                                    <RatingBadge rating={doc.rating} className="mt-1" />
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-3">
                                <span className={`px-4 py-2 rounded-full text-sm font-semibold ${badge.cls}`}>{badge.label}</span>
                                <PmdcBadge verification={doc.pmdc_verification} />
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
