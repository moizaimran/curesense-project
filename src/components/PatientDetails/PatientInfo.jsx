export default function PatientInfo({patient}) {

    return (

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

            <div className="flex items-center gap-6">

                <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-4xl">

                    👤

                </div>

                <div>

                    <h1 className="text-3xl font-bold text-slate-800">

                        {patient.name}

                    </h1>

                    <p className="text-gray-500 mt-2">

                        Patient ID: PT-{patient.id}

                    </p>

                </div>

            </div>

            <div className="grid grid-cols-4 gap-6 mt-8">

                <div>

                    <p className="text-gray-500 text-sm">

                        Age

                    </p>

                    <p className="font-semibold text-slate-800">

                        {patient.age}

                    </p>

                </div>

                <div>

                    <p className="text-gray-500 text-sm">

                        Gender

                    </p>

                    <p className="font-semibold">

                        {patient.gender}

                    </p>

                </div>

                <div>

                    <p className="text-gray-500 text-sm">

                        Blood Group

                    </p>

                    <p className="font-semibold">

                        {patient.bloodGroup}

                    </p>

                </div>

                <div>

                    <p className="text-gray-500 text-sm">

                        Contact

                    </p>

                    <p className="font-semibold">

                        +92 300 1234567

                    </p>

                </div>

            </div>

        </div>

    );

}