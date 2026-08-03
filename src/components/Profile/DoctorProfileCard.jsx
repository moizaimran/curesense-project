import { Stethoscope } from "lucide-react";

export default function DoctorProfileCard({ doctor }) {

    return (

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

            <div className="flex items-center gap-8">

                <img
                    src={doctor.profileImage}
                    alt={doctor.name}
                    className="w-36 h-36 rounded-full object-cover border-4 border-blue-100"
                />

                <div>

                    <h2 className="text-3xl font-bold text-slate-800">
                        {doctor.name}
                    </h2>

                    <div className="flex items-center gap-2 mt-3 text-blue-600">

                        <Stethoscope size={20} />

                        <span className="font-semibold">

                            {doctor.specialization}

                        </span>

                    </div>

                    <p className="text-gray-500 mt-3">

                        {doctor.hospital}

                    </p>

                </div>

            </div>

        </div>

    );

}