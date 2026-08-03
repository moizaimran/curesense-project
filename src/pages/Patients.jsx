import PatientTable from "../components/Patients/PatientTable";
import { useState } from "react"; 
import SearchBar from "../components/Patients/SearchBar";
import FilterDropDown from "../components/Patients/FilterDropDown";
import { useSearchParams } from "react-router-dom";

export default function Patients() {
    const [search,setSearch] = useState("");
    // const [statusFilter, setStatusFilter] = useState("All");
    const [currentPage, setCurrentPage] = useState(1);
    const [searchParams] = useSearchParams();
    const initialStatus = searchParams.get("status") || "All"
    const [statusFilter, setStatusFilter] = useState(initialStatus);
    return (
        <div className="space-y-6" >

            <div>

                {/* <h1 className="text-3xl font-bold text-slate-800 ml-5">
                    Patients
                </h1> */}

                <p className="text-gray-500 mt-2 ml-5">
                    Search, filter and review all registered patients.
                </p>

            </div>
            
            

            <div className="flex justify-between items-center ">

    <SearchBar
        search={search}
        setSearch={setSearch}
    />

    <FilterDropDown
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
    />

</div>
    <PatientTable search={search} statusFilter={statusFilter} currentPage={currentPage} setCurrentPage={setCurrentPage}/>

        </div>
    );
}

