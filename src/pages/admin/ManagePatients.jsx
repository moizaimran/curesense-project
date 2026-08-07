import { Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useSelector } from "react-redux";

import patientPlaceholder from "../../assets/images/patient-avatar.jpg";
import React from 'react'

export default function ManagePatients() {
    const navigate = useNavigate();
    const patients = useSelector(
        (state)=> state.admin.patients
    )
    const [currentPage,setCurrentPage] = useState(1);
    const [search,setSearch] = useState("");
    const [statusFilter,setStatusFilter] = useState("All");
    const patientsPerPage = 5;
    const indexOfLastPatient = currentPage * patientsPerPage;
    const indexOfFirstPatient = indexOfLastPatient - patientsPerPage;
    const filteredPatients =  patients.filter(
        (patient)=>{
            const matchesSearch = patient.name.toLowerCase().includes(search.toLowerCase()) ||
            patient.email.toLowerCase().includes(search.toLowerCase()) ||
            patient.assignedDoctor.toLowerCase().includes(search.toLowerCase());

            const matchesStatus = statusFilter === "All" ||
            patient.accountStatus === statusFilter;
            return   matchesSearch && matchesStatus
        }
    )

    
    const totalPages = Math.ceil(
    filteredPatients.length / patientsPerPage
);

const currentPatients = filteredPatients.slice(
    indexOfFirstPatient,
    indexOfLastPatient
);
  return (
    <div>

        {/* Header */}

        <div className="mb-8">

            <h1 className="text-3xl font-bold text-slate-800">

                Manage Patients

            </h1>

            <p className="text-gray-500 mt-2">

                View and manage all registered patients.

            </p>

        </div>

        {/* Search + Filter */}

        <div className="flex justify-between items-center mb-8">

            <div className="w-[420px]">

                <input

                    type="text"

                    placeholder="Search by patient, email or doctor..."

                    value={search}

                    onChange={(e) => {

                        setSearch(e.target.value);

                        setCurrentPage(1);

                    }}

                    className="w-full px-5 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#264296]"

                />

            </div>

            <select

                value={statusFilter}

                onChange={(e) => {

                    setStatusFilter(e.target.value);

                    setCurrentPage(1);

                }}

                className="px-5 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#264296]"

            >

                <option value="All">All Status</option>

                <option value="Active">Active</option>

                <option value="Suspended">Suspended</option>

            </select>

        </div>

        {/* Patient Cards */}

        <div className="space-y-6">

            {currentPatients.map((patient) => (

                <div

                    key={patient.id}

                    className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition p-6 flex justify-between items-center"

                >

                    {/* Left */}

                    <div className="flex items-center gap-5">

                        <img

                            src={patientPlaceholder}

                            alt={patient.name}

                            className="w-20 h-20 rounded-full object-cover border-4 border-blue-100"

                        />

                        <div>

                            <h2 className="text-xl font-bold text-slate-800">

                                {patient.name}

                            </h2>

                            <p className="text-gray-500 mt-1">

                                {patient.age} Years • {patient.gender}

                            </p>

                            <p className="text-gray-500">

                                Assigned Doctor: {patient.assignedDoctor}

                            </p>

                            <p className="text-gray-500">

                                Registered: {patient.registrationDate}

                            </p>

                        </div>

                    </div>

                    {/* Right */}

                    <div className="flex flex-col items-end gap-4">

                        <span

                            className={`px-4 py-2 rounded-full text-sm font-semibold

                            ${

                                patient.accountStatus === "Active"

                                    ? "bg-green-100 text-green-700"

                                    : "bg-red-100 text-red-700"

                            }`}

                        >

                            {patient.accountStatus}

                        </span>

                        <button

                            onClick={() =>

                                navigate(`/admin/patients/${patient.id}`)

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
