import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from "recharts";

import { useSelector } from "react-redux";

export default function MonthlyChart() {
    const patients = useSelector(
    (state) => state.admin.patients
);
const monthCount = {};

patients.forEach((patient) => {

    const month =
        patient.registrationDate.split(" ")[1];

    monthCount[month] =
        (monthCount[month] || 0) + 1;

});

const data = Object.entries(monthCount).map(
    ([month, patients]) => ({
        month,
        patients,
    })
);

    return (

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">

            <h2 className="text-xl font-bold text-slate-800 mb-6">

                Monthly Patient Registrations

            </h2>

            <div className="h-[320px]">

                <ResponsiveContainer width="100%" height="100%">

                    <BarChart data={data}>

                        <CartesianGrid strokeDasharray="3 3" />

                        <XAxis dataKey="month" />

                        <YAxis />

                        <Tooltip />

                        <Bar
                            dataKey="patients"
                            fill="#264296"
                            radius={[8, 8, 0, 0]}
                        />

                    </BarChart>

                </ResponsiveContainer>

            </div>

        </div>

    );

}