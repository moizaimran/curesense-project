// Case filters for the doctor's "My Patients" page.
// `filters` shape: see EMPTY_CASE_FILTERS in pages/Patients.jsx.

const fieldCls = `
  w-full rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-lg
  px-4 py-3 text-sm font-medium text-slate-700 shadow-lg shadow-slate-200/60
  transition-all duration-300 hover:border-blue-400
  focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100
`;

function Field({ label, children }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      <span className="block mb-2">{label}</span>
      {children}
    </label>
  );
}

export default function FilterDropDown({ filters, setFilters, onReset, hasFilters }) {
  const set = (key) => (e) =>
    setFilters((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 items-end">
      <Field label="Status">
        <select value={filters.status} onChange={set("status")} className={fieldCls}>
          <option value="All">All Appointments</option>
          <option value="Ongoing">Ongoing</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
          <option value="No Show">No Show</option>
        </select>
      </Field>

      <Field label="Gender">
        <select value={filters.gender} onChange={set("gender")} className={fieldCls}>
          <option value="">Any</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </Field>

      <Field label="Slot from">
        <input type="date" value={filters.dateFrom} max={filters.dateTo || undefined}
          onChange={set("dateFrom")} className={fieldCls} />
      </Field>

      <Field label="Slot to">
        <input type="date" value={filters.dateTo} min={filters.dateFrom || undefined}
          onChange={set("dateTo")} className={fieldCls} />
      </Field>

      <Field label="Sort">
        <select value={filters.sort} onChange={set("sort")} className={fieldCls}>
          <option value="newest">Latest slot first</option>
          <option value="oldest">Earliest slot first</option>
          <option value="name">Patient name (A–Z)</option>
        </select>
      </Field>

      <div className="flex flex-col gap-2 pb-1">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
          <input type="checkbox" checked={filters.needsAttention} onChange={set("needsAttention")}
            className="h-4 w-4 rounded accent-blue-600" />
          Needs attention
        </label>
        <button type="button" onClick={onReset} disabled={!hasFilters}
          className="text-left text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-40">
          Reset filters
        </button>
      </div>
    </div>
  );
}
