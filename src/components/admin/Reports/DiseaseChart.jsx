import React from "react";
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    Legend,
} from "recharts";
import { useSelector } from "react-redux";

export default function DiseaseChart() {

    const patients = useSelector(
        (state) => state.admin.patients
    );

    // Count each disease
    const diseaseCount = {};

    patients.forEach((patient) => {
        diseaseCount[patient.diagnosis] =
            (diseaseCount[patient.diagnosis] || 0) + 1;
    });

    // Convert object into array for Recharts
    const data = Object.entries(diseaseCount).map(
        ([disease, count]) => ({
            name: disease,
            value: count,
        })
    );

    const COLORS = [
        "#264296",
        "#4CAF50",
        "#FF9800",
        "#F44336",
        "#9C27B0",
        "#03A9F4",
        "#00BCD4",
        "#795548",
    ];

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">

            <h2 className="text-xl font-bold text-slate-800 mb-6">
                Disease Distribution
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