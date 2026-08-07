import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ArrowLeft } from "lucide-react";

import {
    activatePatient,
    suspendPatient,
} from "../../features/admin/AdminSlice";

import patientPlaceholder from "../../assets/images/patient-avatar.jpg";

function InfoItem({ title, value }) {
    return (
        <div>
            <p className="text-sm text-gray-500">
                {title}
            </p>

            <p className="mt-1 text-lg font-semibold text-slate-800">
                {value}
            </p>
        </div>
    );
}

export default function PatientDetail() {

    const dispatch = useDispatch();

    const navigate = useNavigate();

    const { id } = useParams();

    const patients = useSelector(
        (state) => state.admin.patients
    );

    const patient = patients.find(
        (patient) => patient.id === Number(id)
    );

    const [showSuspendModal, setShowSuspendModal] = useState(false);

    const [showActivateModal, setShowActivateModal] = useState(false);

    return (

        <div className="space-y-8">

            <button

                onClick={() => navigate(-1)}

                className="flex items-center gap-2 text-[#264296] hover:underline"

            >

                <ArrowLeft size={18} />

                Back to Manage Patients

            </button>

            <div>

                <h1 className="text-3xl font-bold text-slate-800">

                    Patient Details

                </h1>

                <p className="text-gray-500 mt-2">

                    View patient's account information.

                </p>

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

                            <h2 className="text-2xl font-bold text-slate-800 mt-6">

                                {patient.name}

                            </h2>

                            <p className="text-gray-500 mt-2">

                                {patient.gender} • {patient.age} Years

                            </p>

                            <span

                                className={`mt-6 px-5 py-2 rounded-full text-sm font-semibold

                                ${

                                    patient.accountStatus === "Active"

                                        ? "bg-green-100 text-green-700"

                                        : "bg-red-100 text-red-700"

                                }`}

                            >

                                {patient.accountStatus}

                            </span>

                        </div>

                    </div>

                    {/* RIGHT */}

                    <div className="col-span-8 space-y-8">

                        {/* Personal Information */}

                        <div>

                            <h3 className="text-xl font-bold text-slate-800 mb-5">

                                Personal Information

                            </h3>

                            <div className="grid grid-cols-2 gap-6">

                                <InfoItem
                                    title="Full Name"
                                    value={patient.name}
                                />

                                <InfoItem
                                    title="Age"
                                    value={patient.age}
                                />

                                <InfoItem
                                    title="Gender"
                                    value={patient.gender}
                                />

                                <InfoItem
                                    title="Blood Group"
                                    value={patient.bloodGroup}
                                />

                            </div>

                        </div>

                        <hr />

                        {/* Contact */}

                        <div>

                            <h3 className="text-xl font-bold text-slate-800 mb-5">

                                Contact Information

                            </h3>

                            <div className="grid grid-cols-2 gap-6">

                                <InfoItem
                                    title="Email"
                                    value={patient.email}
                                />

                                <InfoItem
                                    title="Phone"
                                    value={patient.phone}
                                />

                                <InfoItem
                                    title="CNIC"
                                    value={patient.cnic}
                                />

                                <InfoItem
                                    title="Address"
                                    value={patient.address}
                                />

                            </div>

                        </div>

                        <hr />

                        {/* Account */}

                        <div>

                            <h3 className="text-xl font-bold text-slate-800 mb-5">

                                Account Information

                            </h3>

                            <div className="grid grid-cols-2 gap-6">

                                <InfoItem
                                    title="Registration Date"
                                    value={patient.registrationDate}
                                />

                                <InfoItem
                                    title="Last Login"
                                    value={patient.lastLogin}
                                />

                                <InfoItem
                                    title="Assigned Doctor"
                                    value={patient.assignedDoctor}
                                />

                                <InfoItem
                                    title="Account Status"
                                    value={patient.accountStatus}
                                />

                            </div>

                        </div>

                    </div>

                </div>

            </div>

            <hr />

            {/* Account Actions */}

            <div>

                <h3 className="text-xl font-bold text-slate-800 mb-5">

                    Account Actions

                </h3>

                <div className="flex justify-end">

                    {patient.accountStatus === "Active" ? (

                        <button

                            onClick={() =>
                                setShowSuspendModal(true)
                            }

                            className="px-8 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold"

                        >

                            Suspend Account

                        </button>

                    ) : (

                        <button

                            onClick={() =>
                                setShowActivateModal(true)
                            }

                            className="px-8 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold"

                        >

                            Activate Account

                        </button>

                    )}

                </div>

            </div>
            {/* Suspend Modal */}

{showSuspendModal && (

    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">

        <div className="bg-white rounded-2xl w-[420px] p-8">

            <h2 className="text-2xl font-bold text-slate-800">

                Suspend Patient

            </h2>

            <p className="mt-4 text-gray-500">

                Are you sure you want to suspend

                <span className="font-semibold text-slate-700">

                    {" "}{patient.name}

                </span>

                ?

            </p>

            <div className="flex justify-end gap-4 mt-8">

                <button

                    onClick={() => setShowSuspendModal(false)}

                    className="px-5 py-2 rounded-lg border"

                >

                    Cancel

                </button>

                <button

                    onClick={() => {

                        dispatch(suspendPatient(patient.id));

                        setShowSuspendModal(false);

                    }}

                    className="px-5 py-2 rounded-lg bg-red-600 text-white"

                >

                    Suspend

                </button>

            </div>

        </div>

    </div>

)}

{/* Activate Modal */}

{showActivateModal && (

    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">

        <div className="bg-white rounded-2xl w-[420px] p-8">

            <h2 className="text-2xl font-bold text-slate-800">

                Activate Patient

            </h2>

            <p className="mt-4 text-gray-500">

                Are you sure you want to activate

                <span className="font-semibold text-slate-700">

                    {" "}{patient.name}

                </span>

                ?

            </p>

            <div className="flex justify-end gap-4 mt-8">

                <button

                    onClick={() => setShowActivateModal(false)}

                    className="px-5 py-2 rounded-lg border"

                >

                    Cancel

                </button>

                <button

                    onClick={() => {

                        dispatch(activatePatient(patient.id));

                        setShowActivateModal(false);

                    }}

                    className="px-5 py-2 rounded-lg bg-green-600 text-white"

                >

                    Activate

                </button>

            </div>

        </div>

    </div>

)}

</div>

    );

}