import PatientTable from "../components/Patients/PatientTable";
import { useState } from "react";
import SearchBar from "../components/Patients/SearchBar";
import FilterDropDown from "../components/Patients/FilterDropDown";
import { useSearchParams } from "react-router-dom";

const EMPTY_CASE_FILTERS = {
    status: "All",          // "All" | "Ongoing" | "Completed" | "Cancelled" | "No Show"
    gender: "",             // "" | "male" | "female"
    dateFrom: "",           // YYYY-MM-DD (requested slot)
    dateTo: "",
    needsAttention: false,  // unread patient query or new test upload
    sort: "newest",         // "newest" | "oldest" | "name"
};

export default function Patients() {
    const [searchParams] = useSearchParams();
    const [search, setSearchRaw] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    // Dashboard links can preselect a status, e.g. /patients?status=Completed
    const [filters, setFiltersRaw] = useState({
        ...EMPTY_CASE_FILTERS,
        status: searchParams.get("status") || "All",
    });

    // Any search/filter change goes back to page 1
    const setSearch  = (v) => { setSearchRaw(v);  setCurrentPage(1); };
    const setFilters = (v) => { setFiltersRaw(v); setCurrentPage(1); };

    const hasFilters = !!search
        || Object.entries(EMPTY_CASE_FILTERS).some(([k, v]) => filters[k] !== v);

    return (
        <div className="space-y-6">
            <p className="text-gray-500 mt-2 ml-5">
                Search, filter and review all your patients' cases.
            </p>

            <div className="space-y-5 ml-5">
                <SearchBar search={search} setSearch={setSearch} />
                <FilterDropDown
                    filters={filters}
                    setFilters={setFilters}
                    hasFilters={hasFilters}
                    onReset={() => { setSearch(""); setFilters(EMPTY_CASE_FILTERS); }}
                />
            </div>

            <PatientTable
                search={search}
                filters={filters}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
            />
        </div>
    );
}
