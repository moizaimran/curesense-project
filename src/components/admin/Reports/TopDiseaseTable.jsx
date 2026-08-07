import { useSelector } from "react-redux";

export default function TopDiseasesTable() {

    const patients = useSelector(
        (state) => state.admin.patients
    );

    const diseaseCount = {};

    patients.forEach((patient) => {
        diseaseCount[patient.diagnosis] =
            (diseaseCount[patient.diagnosis] || 0) + 1;
    });

    const topDiseases = Object.entries(diseaseCount)
        .map(([disease, count]) => ({
            disease,
            count,
        }))
        .sort((a, b) => b.count - a.count);

    return (

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">

            <h2 className="text-xl font-bold text-slate-800 mb-6">

                Top Diagnosed Diseases

            </h2>

            <table className="w-full">

                <thead>

                    <tr className="border-b">

                        <th className="text-left py-3 text-gray-500">

                            Disease

                        </th>

                        <th className="text-right py-3 text-gray-500">

                            Patients

                        </th>

                    </tr>

                </thead>

                <tbody>

                    {topDiseases.map((item, index) => (

                        <tr
                            key={index}
                            className="border-b last:border-none"
                        >

                            <td className="py-4 font-medium text-slate-800">

                                {item.disease}

                            </td>

                            <td className="py-4 text-right text-[#264296] font-bold">

                                {item.count}

                            </td>

                        </tr>

                    ))}

                </tbody>

            </table>

        </div>

    );

}