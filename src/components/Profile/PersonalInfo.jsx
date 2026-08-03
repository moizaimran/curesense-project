export default function PersonalInfo({
    profile,
    setProfile,
    isEditing,
}) {
    return (

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

            <h2 className="text-2xl font-bold text-slate-800 mb-8">

                Personal Information

            </h2>

            <div className="grid md:grid-cols-2 gap-8">

                <div>

    <p className="text-sm text-gray-500 mb-2">

        Full Name

    </p>

    <input

        type="text"

        value={profile.name}

        disabled={!isEditing}

        onChange={(e) =>
            setProfile({
                ...profile,
                name: e.target.value,
            })
        }

        className={`w-full border rounded-xl p-4 outline-none transition-all ${
    isEditing
        ? "bg-white border-blue-500 focus:ring-2 focus:ring-blue-300"
        : "bg-slate-50 text-slate-700 cursor-not-allowed"
}`}
    />

</div>

               <div>

    <p className="text-sm text-gray-500 mb-2">

        Email

    </p>

    <input

        type="email"

        value={profile.email}

        disabled={!isEditing}

        onChange={(e) =>
            setProfile({
                ...profile,
                email: e.target.value,
            })
        }

        className={`w-full border rounded-xl p-4 outline-none transition-all ${
    isEditing
        ? "bg-white border-blue-500 focus:ring-2 focus:ring-blue-300"
        : "bg-slate-50 text-slate-700 cursor-not-allowed"
}`}

    />

</div>
                <div>

    <p className="text-sm text-gray-500 mb-2">

        Phone

    </p>

    <input

        type="tel"

        value={profile.phone}

        disabled={!isEditing}

        onChange={(e) =>
            setProfile({
                ...profile,
                phone: e.target.value,
            })
        }

        className={`w-full border rounded-xl p-4 outline-none transition-all ${
    isEditing
        ? "bg-white border-blue-500 focus:ring-2 focus:ring-blue-300"
        : "bg-slate-50 text-slate-700 cursor-not-allowed"
}`}
    />

</div>

                <div>

    <p className="text-sm text-gray-500 mb-2">

        Hospital

    </p>

    <input

        type="text"

        value={profile.hospital}

        disabled={!isEditing}

        onChange={(e) =>
            setProfile({
                ...profile,
                hospital: e.target.value,
            })
        }

        className={`w-full border rounded-xl p-4 outline-none transition-all ${
    isEditing
        ? "bg-white border-blue-500 focus:ring-2 focus:ring-blue-300"
        : "bg-slate-50 text-slate-700 cursor-not-allowed"
}`}
    />

</div>

                <div>

    <p className="text-sm text-gray-500 mb-2">

        Department

    </p>

    <input

        type="text"

        value={profile.department}

        disabled={!isEditing}

        onChange={(e) =>
            setProfile({
                ...profile,
                department: e.target.value,
            })
        }

        className={`w-full border rounded-xl p-4 outline-none transition-all ${
    isEditing
        ? "bg-white border-blue-500 focus:ring-2 focus:ring-blue-300"
        : "bg-slate-50 text-slate-700 cursor-not-allowed"
}`}

    />

</div>

                <div>

    <p className="text-sm text-gray-500 mb-2">

        Specialization

    </p>

    <input

        type="text"

        value={profile.specialization}

        disabled={!isEditing}

        onChange={(e) =>
            setProfile({
                ...profile,
                specialization: e.target.value,
            })
        }

        className={`w-full border rounded-xl p-4 outline-none transition-all ${
    isEditing
        ? "bg-white border-blue-500 focus:ring-2 focus:ring-blue-300"
        : "bg-slate-50 text-slate-700 cursor-not-allowed"
}`}

    />

</div>

               <div>

    <p className="text-sm text-gray-500 mb-2">

        Experience

    </p>

    <input

        type="text"

        value={profile.experience}

        disabled={!isEditing}

        onChange={(e) =>
            setProfile({
                ...profile,
                experience: e.target.value,
            })
        }

       className={`w-full border rounded-xl p-4 outline-none transition-all ${
    isEditing
        ? "bg-white border-blue-500 focus:ring-2 focus:ring-blue-300"
        : "bg-slate-50 text-slate-700 cursor-not-allowed"
}`}

    />

</div>

                <div>

    <p className="text-sm text-gray-500 mb-2">

        LicenseNumber

    </p>

    <input

        type="text"

        value={profile.licenseNumber}

        disabled={!isEditing}

        onChange={(e) =>
            setProfile({
                ...profile,
                licenseNumber: e.target.value,
            })
        }

        className={`w-full border rounded-xl p-4 outline-none transition-all ${
    isEditing
        ? "bg-white border-blue-500 focus:ring-2 focus:ring-blue-300"
        : "bg-slate-50 text-slate-700 cursor-not-allowed"
}`}

    />

</div>
<div>

    <p className="text-sm text-gray-500 mb-2">

        Username
    </p>

    <input

        type="text"

        value={profile.username}

        disabled={!isEditing}

        onChange={(e) =>
            setProfile({
                ...profile,
                username: e.target.value,
            })
        }

       className={`w-full border rounded-xl p-4 outline-none transition-all ${
    isEditing
        ? "bg-white border-blue-500 focus:ring-2 focus:ring-blue-300"
        : "bg-slate-50 text-slate-700 cursor-not-allowed"
}`}

    />

</div>

                

            </div>

        </div>

    );

}

