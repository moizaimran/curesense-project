export default function SummaryCard({ title, value, icon, onClick }) {
    const cls = "bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex justify-between items-center hover:shadow-lg transition duration-300";
    const inner = (
        <>
            <div>
                <p className="text-gray-500 text-sm font-medium">{title}</p>
                <h2 className="text-4xl font-bold text-slate-800 mt-2">{value}</h2>
            </div>
            <div className="h-14 w-14 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                {icon}
            </div>
        </>
    );

    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={`${cls} w-full text-left cursor-pointer hover:border-blue-300`}>
                {inner}
            </button>
        );
    }
    return <div className={cls}>{inner}</div>;
}