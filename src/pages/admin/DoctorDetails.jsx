import { useNavigate, useParams } from "react-router-dom";
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
    ArrowLeft,
    CheckCircle,
    XCircle,
    Clock3,
} from "lucide-react";

import {
    approveDoctor,
    rejectDoctor,
} from "../../features/admin/adminSlice";

import CertificateModal from "../../components/admin/Doctors/CertificateModel";

import doctorPlaceholder from "../../assets/images/doctor-avatar.jpg";

function InfoItem({ title, value }) {
    return (
        <div>
            <p className="text-sm text-gray-500">{title}</p>

            <p className="mt-1 text-lg font-semibold text-slate-800">
                {value}
            </p>
        </div>
    );
}

export default function DoctorDetails() {

    const dispatch = useDispatch();

    const navigate = useNavigate();

    const { id } = useParams();

    const doctors = useSelector(
        (state) => state.admin.doctors
    );

    const doctor = doctors.find(
        (doctor) => doctor.id === Number(id)
    );

    const [showCertificate, setShowCertificate] = useState(false);

    const [showApproveModal, setShowApproveModal] = useState(false);

    const [showRejectModal, setShowRejectModal] = useState(false);

    const [rejectReason, setRejectReason] = useState("");

    return (

        <div className="space-y-8">

            {/* Back Button */}

            <button

                onClick={() => navigate(-1)}

                className="flex items-center gap-2 text-[#264296] hover:underline"

            >

                <ArrowLeft size={18} />

                Back to Manage Doctors

            </button>

            {/* Heading */}

            <div>

                <h1 className="text-3xl font-bold text-slate-800">

                    Doctor Details

                </h1>

                <p className="text-gray-500 mt-2">

                    Review doctor's information before approval.

                </p>

            </div>

            {/* Main Card */}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

                <div className="grid grid-cols-12 gap-10">

                    {/* LEFT */}

                    <div className="col-span-4 border-r border-gray-200 pr-8">

                        <div className="flex flex-col items-center">

                            <img

                                src={doctorPlaceholder}

                                alt={doctor.name}

                                className="w-40 h-40 rounded-full object-cover border-4 border-blue-100"

                            />

                            <h2 className="text-2xl font-bold text-slate-800 mt-6">

                                {doctor.name}

                            </h2>

                            <p className="text-gray-500 mt-2">

                                {doctor.specialization}

                            </p>

                            <span

                                className={`mt-6 px-5 py-2 rounded-full text-sm font-semibold flex items-center gap-2

                                ${
                                    doctor.status === "Approved"

                                        ? "bg-green-100 text-green-700"

                                        : doctor.status === "Rejected"

                                        ? "bg-red-100 text-red-700"

                                        : "bg-yellow-100 text-yellow-700"
                                }`}

                            >

                                {doctor.status === "Approved" && (
                                    <CheckCircle size={16} />
                                )}

                                {doctor.status === "Rejected" && (
                                    <XCircle size={16} />
                                )}

                                {doctor.status === "Pending" && (
                                    <Clock3 size={16} />
                                )}

                                {doctor.status}

                            </span>

                        </div>

                    </div>

                    {/* RIGHT */}

                    <div className="col-span-8 space-y-8">

                        <div>

                            <h3 className="text-xl font-bold text-slate-800 mb-5">

                                Personal Information

                            </h3>

                            <div className="grid grid-cols-2 gap-6">

                                <InfoItem title="Full Name" value={doctor.name} />

                                <InfoItem title="Email" value={doctor.email} />

                                <InfoItem title="Phone" value={doctor.phone} />

                                <InfoItem title="Username" value={doctor.username} />

                            </div>

                        </div>

                        <hr />

                        <div>

                            <h3 className="text-xl font-bold text-slate-800 mb-5">

                                Professional Information

                            </h3>

                            <div className="grid grid-cols-2 gap-6">

                                <InfoItem title="Hospital" value={doctor.hospital} />

                                <InfoItem title="Department" value={doctor.department} />

                                <InfoItem title="Specialization" value={doctor.specialization} />

                                <InfoItem title="Experience" value={doctor.experience} />

                                <InfoItem title="PMDC License" value={doctor.licenseNumber} />

                                <InfoItem title="Registration Date" value="18 July 2026" />

                            </div>

                        </div>

                    </div>

                </div>

            </div>

            <hr />

            {/* PMDC Certificate */}

            <div>

                <h3 className="text-xl font-bold text-slate-800 mb-5">

                    PMDC Certificate

                </h3>

                <div className="border border-dashed border-gray-300 rounded-2xl p-6 flex justify-between items-center bg-slate-50">

                    <div>

                        <p className="font-semibold text-slate-800">

                            PMDC Registration Certificate

                        </p>

                        <p className="text-sm text-gray-500 mt-1">

                            Uploaded by doctor during registration

                        </p>

                    </div>

                    <button

                        onClick={() => setShowCertificate(true)}

                        className="bg-[#264296] hover:bg-[#1f3578] text-white px-5 py-3 rounded-xl font-medium"

                    >

                        View Certificate

                    </button>

                </div>

            </div>

            <hr />
                        {/* Approval Actions */}

            <div>

                <h3 className="text-xl font-bold text-slate-800 mb-5">

                    Approval Actions

                </h3>

                {doctor.status === "Pending" && (

                    <div className="flex justify-end gap-4">

                        <button

                            onClick={() => setShowRejectModal(true)}

                            className="px-8 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition"

                        >

                            Reject

                        </button>

                        <button

                            onClick={() => setShowApproveModal(true)}

                            className="px-8 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold transition"

                        >

                            Approve

                        </button>

                    </div>

                )}

            </div>

            {/* Certificate Modal */}

            <CertificateModal

                isOpen={showCertificate}

                onClose={() => setShowCertificate(false)}

                certificate={doctor.certificate}

            />

            {/* Approve Modal */}

            {showApproveModal && (

                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">

                    <div className="bg-white rounded-2xl w-[420px] p-8">

                        <h2 className="text-2xl font-bold text-slate-800">

                            Approve Doctor

                        </h2>

                        <p className="mt-4 text-gray-500">

                            Are you sure you want to approve

                            <span className="font-semibold text-slate-700">

                                {" "}{doctor.name}

                            </span>

                            ?

                        </p>

                        <div className="flex justify-end gap-4 mt-8">

                            <button

                                onClick={() => setShowApproveModal(false)}

                                className="px-5 py-2 rounded-lg border"

                            >

                                Cancel

                            </button>

                            <button

                                onClick={() => {

                                    dispatch(approveDoctor(doctor.id));

                                    setShowApproveModal(false);

                                }}

                                className="px-5 py-2 rounded-lg bg-green-600 text-white"

                            >

                                Approve

                            </button>

                        </div>

                    </div>

                </div>

            )}

            {/* Reject Modal */}

            {showRejectModal && (

                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">

                    <div className="bg-white rounded-2xl w-[500px] p-8">

                        <h2 className="text-2xl font-bold text-slate-800">

                            Reject Doctor

                        </h2>

                        <p className="text-gray-500 mt-3">

                            Please provide a reason for rejection.

                        </p>

                        <textarea

                            rows="5"

                            value={rejectReason}

                            onChange={(e) =>
                                setRejectReason(e.target.value)
                            }

                            placeholder="Write rejection reason..."

                            className="w-full mt-5 border rounded-xl p-4 outline-none focus:ring-2 focus:ring-red-500"

                        />

                        <div className="flex justify-end gap-4 mt-8">

                            <button

                                onClick={() => {

                                    setShowRejectModal(false);

                                    setRejectReason("");

                                }}

                                className="px-5 py-2 rounded-lg border"

                            >

                                Cancel

                            </button>

                            <button

                                disabled={!rejectReason.trim()}

                                onClick={() => {

                                    dispatch(

                                        rejectDoctor({

                                            id: doctor.id,

                                            reason: rejectReason,

                                        })

                                    );

                                    setShowRejectModal(false);

                                    setRejectReason("");

                                }}

                                className="px-5 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50"

                            >

                                Reject

                            </button>

                        </div>

                    </div>

                </div>

            )}

        </div>

    );

}