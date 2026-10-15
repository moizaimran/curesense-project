import { useEffect, useState } from "react";
import { api } from "./api";

// The backend owns the specialty list (GET /api/doctors/specialties) so registration,
// profile edits and AI referrals all use the same names.
export function useSpecialties() {
    const [specialties, setSpecialties] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.get("/api/doctors/specialties")
            .then((data) => setSpecialties(data.specialties || []))
            .catch(() => setError("Could not load specialties. Please refresh the page."));
    }, []);

    return { specialties, error };
}
