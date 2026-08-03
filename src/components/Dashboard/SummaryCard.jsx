export default function SummaryCard({ title, value, icon }) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex justify-between items-center hover:shadow-lg transition duration-300">

    <div>

        <p className="text-gray-500 text-sm font-medium">
            {title}
        </p>

        <h2 className="text-4xl font-bold text-slate-800 mt-2">
            {value}
        </h2>

    </div>

    <div className="h-14 w-14 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">

        {icon}

    </div>

</div>
    );
}