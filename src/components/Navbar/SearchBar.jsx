import { useState } from "react";
import { Search } from "lucide-react";

export default function SearchBar() {
    const [search, setSearch] = useState("");

    return (
    <div className="relative w-96">

        <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
        />

        <input
            type="text"
            value={search}
            placeholder="Search patients by name or ID..."
            onChange={(e) => setSearch(e.target.value)}
            className="
                w-full
                rounded-xl
                border
                border-gray-200
                bg-gray-50
                py-3
                pl-11
                pr-4
                text-sm
                outline-none
                transition
                focus:border-blue-500
                focus:bg-white
                focus:ring-2
                focus:ring-blue-100
            "
        />

    </div>
);
}