import React from "react";

export default function FilterDropDown({
  statusFilter,
  setStatusFilter,
}) {
  return (
    <div className="w-60">
      <label className="block mb-2 text-sm font-semibold text-slate-700">
        Filter by Status
      </label>

      <div className="relative">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="
            w-full
            appearance-none
            rounded-2xl
            border border-slate-200
            bg-white/80
            backdrop-blur-lg
            px-5
            py-3
            pr-12
            text-sm
            font-medium
            text-slate-700
            shadow-lg
            shadow-slate-200/60
            transition-all
            duration-300
            hover:border-blue-400
            hover:shadow-xl
            hover:shadow-blue-100/40
            focus:outline-none
            focus:border-blue-500
            focus:ring-4
            focus:ring-blue-100
            cursor-pointer
          "
        >
          <option value="All">All Patients</option>
          <option value="Pending">Pending</option>
          <option value="Reviewed">Reviewed</option>
        </select>

        {/* Custom Arrow */}
        <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 transition-transform duration-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}