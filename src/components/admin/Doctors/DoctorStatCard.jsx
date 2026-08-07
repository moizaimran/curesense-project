export default function DoctorStatCard({
    title,
    value,
    icon,
    bgColor,
    iconBg,
}) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-between hover:shadow-md transition">

            <div>

                <p className="text-gray-500 text-sm">

                    {title}

                </p>

                <h2 className="text-3xl font-bold text-slate-800 mt-2">

                    {value}

                </h2>

            </div>

            <div
                className={`w-14 h-14 rounded-xl flex items-center justify-center ${iconBg}`}
            >
                <div className={bgColor}>

                    {icon}

                </div>

            </div>

        </div>
    );
}