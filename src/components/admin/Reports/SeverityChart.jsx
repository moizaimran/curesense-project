import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";

import { useSelector } from "react-redux";

export default function SeverityChart() {

    const patients = useSelector(
        (state) => state.admin.patients
    );

    const severityCount = {};

    patients.forEach((patient) => {
        severityCount[patient.severity] =
            (severityCount[patient.severity] || 0) + 1;
    });

    const data = Object.entries(severityCount).map(
        ([severity, count]) => ({
            name: severity,
            value: count,
        })
    );

    const COLORS = [
        "#EF4444",
        "#F59E0B",
        "#22C55E",
    ];

    return (

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">

            <h2 className="text-xl font-bold text-slate-800 mb-6">

                Case Severity Distribution

            </h2>

            <div className="h-[320px]">

                <ResponsiveContainer width="100%" height="100%">

                    <PieChart>

                        <Pie
                            data={data}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            label
                        >

                            {data.map((entry, index) => (

                                <Cell
                                    key={index}
                                    fill={COLORS[index % COLORS.length]}
                                />

                            ))}

                        </Pie>

                        <Tooltip />

                        <Legend />

                    </PieChart>

                </ResponsiveContainer>

            </div>

        </div>

    );

}