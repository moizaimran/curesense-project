import {
    Eye,
    Search,
    CheckCircle,
    XCircle,
    Clock3,
    Users,
    UserCheck,
    UserX,
    UserPlus,
} from "lucide-react";

import { useNavigate } from "react-router-dom";
import { useState } from "react";

import DoctorStatCard from "../../components/admin/Doctors/DoctorStatCard";


import doctorPlaceholder from "../../assets/images/doctor-avatar.jpg";
import { useSelector } from "react-redux";


export default function ManageDoctors() {

    const navigate = useNavigate();

    const [currentPage, setCurrentPage] = useState(1);
    const [search , setSearch] = useState("");
    const [statusFilter,setStatusFilter] = useState("All");

    const doctorsPerPage = 5;

    const indexOfLastDoctor = currentPage * doctorsPerPage;

    const indexOfFirstDoctor =
        indexOfLastDoctor - doctorsPerPage;
        const adminDoctor =useSelector(
            (state)=> state.admin.doctors
        )

    const filteredDoctors = adminDoctor.filter((doctor) => {

    const matchesSearch =
        doctor.name.toLowerCase().includes(search.toLowerCase()) ||
        doctor.specialization.toLowerCase().includes(search.toLowerCase()) ||
        doctor.hospital.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
        statusFilter === "All" ||
        doctor.status === statusFilter;

    return matchesSearch && matchesStatus;

});

const totalPages = Math.ceil(
    filteredDoctors.length / doctorsPerPage
);

const currentDoctors = filteredDoctors.slice(
    indexOfFirstDoctor,
    indexOfLastDoctor
);
    return (

        <div>

            {/* Header */}

            <div className="mb-8">

                <h1 className="text-3xl font-bold text-slate-800">

                    Manage Doctors

                </h1>

                <p className="text-gray-500 mt-2">

                    Review and manage all registered doctors.

                </p>

            </div>
            <div className="grid grid-cols-4 gap-6 mb-8">

    <DoctorStatCard

        title="Total Doctors"

        value={adminDoctor.length}

        icon={<Users size={26} className="text-[#264296]" />}

        bgColor="text-[#264296]"

        iconBg="bg-blue-100"

    />

    <DoctorStatCard

        title="Pending"

        value={
            adminDoctor.filter(
                (doctor) => doctor.status === "Pending"
            ).length
        }

        icon={<Clock3 size={26} className="text-yellow-600" />}

        bgColor="text-yellow-600"

        iconBg="bg-yellow-100"

    />

    <DoctorStatCard

        title="Approved"

        value={
            adminDoctor.filter(
                (doctor) => doctor.status === "Approved"
            ).length
        }

        icon={<UserCheck size={26} className="text-green-600" />}

        bgColor="text-green-600"

        iconBg="bg-green-100"

    />

    <DoctorStatCard

        title="Rejected"

        value={
            adminDoctor.filter(
                (doctor) => doctor.status === "Rejected"
            ).length
        }

        icon={<UserX size={26} className="text-red-600" />}

        bgColor="text-red-600"

        iconBg="bg-red-100"

    />

</div>
            {/* Search + Filters */}

<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-8">

    <div className="flex flex-col lg:flex-row gap-5 justify-between items-center">

        {/* Search */}

        <div className="relative w-full lg:w-112.5">

            <Search
                size={20}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <input

                type="text"

                placeholder="Search by doctor, specialization or hospital..."

                value={search}

                onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                }}

                className="w-full pl-12 pr-5 py-3 rounded-xl border border-gray-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#264296] transition"

            />

        </div>

        {/* Filters */}

        <div className="flex gap-4 w-full lg:w-auto">

            <select

                value={statusFilter}

                onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                }}

                className="px-5 py-3 rounded-xl border border-gray-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#264296]"

            >

                <option value="All">All Status</option>

                <option value="Pending">Pending</option>

                <option value="Approved">Approved</option>

                <option value="Rejected">Rejected</option>

            </select>

            <button

                onClick={() => {

                    setSearch("");

                    setStatusFilter("All");

                    setCurrentPage(1);

                }}

                className="px-5 py-3 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 font-medium transition"

            >

                Reset Filters

            </button>

        </div>

    </div>

    {/* Footer */}

    <div className="flex justify-between items-center mt-5">

        <p className="text-gray-500">

            Showing

            <span className="font-semibold text-[#264296]">

                {" "}
                {currentDoctors.length}

            </span>

            {" "}of{" "}

            <span className="font-semibold text-[#264296]">

                {filteredDoctors.length}

            </span>

            {" "}Registered Doctors

        </p>

        <p className="text-sm text-gray-400">

            Use search or filters to quickly find doctors.

        </p>

    </div>

</div>

            {/* Doctor Cards */}

            <div className="space-y-6">

                {currentDoctors.map((doctor) => (

                    <div

                        key={doctor.id}

                        className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition p-6 flex justify-between items-center"

                    >

                        {/* Left */}

                        <div className="flex items-center gap-5">

    <img
        src={doctorPlaceholder}
        alt={doctor.name}
        className="w-20 h-20 rounded-full object-cover border-4 border-blue-100"
    />

    <div>

        <h2 className="text-xl font-bold text-slate-800">

            {doctor.name}

        </h2>

        <p className="text-gray-500 mt-1">

            {doctor.specialization}

        </p>

        <p className="text-gray-500">

            {doctor.hospital}

        </p>

    </div>

</div>
                        {/* Right */}

                        <div className="flex flex-col items-end gap-4">

                            <span

                                className={`px-4 py-2 rounded-full text-sm font-semibold

                                ${
                                    doctor.status === "Approved"

                                        ? "bg-green-100 text-green-700"

                                        : doctor.status === "Rejected"

                                        ? "bg-red-100 text-red-700"

                                        : "bg-yellow-100 text-yellow-700"

                                }`}

                            >

                                {doctor.status}

                            </span>

                            <button

                                onClick={() =>
                                    navigate(`/admin/doctors/${doctor.id}`)
                                }

                                className="flex items-center gap-2 bg-[#264296] hover:bg-[#1f3578] text-white px-5 py-3 rounded-xl transition"

                            >

                                <Eye size={18} />

                                View Details

                            </button>

                        </div>

                    </div>

                ))}

            </div>

            {/* Pagination */}

            <div className="flex justify-between items-center mt-10">

                <button

                    onClick={() =>
                        setCurrentPage(currentPage - 1)
                    }

                    disabled={currentPage === 1}

                    className={`px-5 py-2 rounded-lg font-medium transition

                    ${
                        currentPage === 1

                            ? "bg-gray-200 text-gray-400 cursor-not-allowed"

                            : "bg-[#264296] text-white hover:bg-[#1f3578]"

                    }`}

                >

                    ← Previous

                </button>

                <div className="flex gap-3">

                    {Array.from(
                        { length: totalPages },
                        (_, index) => (

                            <button

                                key={index}

                                onClick={() =>
                                    setCurrentPage(index + 1)
                                }

                                className={`w-10 h-10 rounded-lg font-semibold transition

                                ${
                                    currentPage === index + 1

                                        ? "bg-[#264296] text-white"

                                        : "bg-gray-100 hover:bg-gray-200"

                                }`}

                            >

                                {index + 1}

                            </button>

                        )
                    )}

                </div>

                <button

                    onClick={() =>
                        setCurrentPage(currentPage + 1)
                    }

                    disabled={currentPage === totalPages}

                    className={`px-5 py-2 rounded-lg font-medium transition

                    ${
                        currentPage === totalPages

                            ? "bg-gray-200 text-gray-400 cursor-not-allowed"

                            : "bg-[#264296] text-white hover:bg-[#1f3578]"

                    }`}

                >

                    Next →

                </button>

            </div>

        </div>

    );

}