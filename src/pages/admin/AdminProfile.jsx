import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateProfile } from "../../features/admin/adminSlice";
import { useNavigate } from "react-router-dom";

import patientPlaceholder from "../../assets/images/patient-avatar.jpg";

export default function AdminProfile() {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const profile = useSelector((state) => state.admin.profile);

    const [formData, setFormData] = useState(profile);

    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handlePasswordChange = (e) => {
        const { name, value } = e.target;

        setPasswordData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleSave = () => {
        dispatch(updateProfile(formData));
        alert("Profile Updated Successfully");
    };

    const handlePasswordUpdate = () => {
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            alert("Passwords do not match");
            return;
        }

        alert("Password Updated Successfully");

        setPasswordData({
            currentPassword: "",
            newPassword: "",
            confirmPassword: "",
        });
    };

    return (
        <div className="space-y-8">

            {/* Header */}

            <div>
                <h1 className="text-3xl font-bold text-slate-800">
                    My Profile
                </h1>

                <p className="text-gray-500 mt-2">
                    Manage your administrator account.
                </p>
            </div>

            {/* Main Card */}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

                <div className="grid grid-cols-12 gap-10">

                    {/* LEFT */}

                    <div className="col-span-4 border-r border-gray-200 pr-8">

                        <div className="flex flex-col items-center">

                            <img
                                src={patientPlaceholder}
                                alt="Admin"
                                className="w-40 h-40 rounded-full object-cover border-4 border-blue-100"
                            />

                            <h2 className="text-2xl font-bold mt-6">
                                {profile.name}
                            </h2>

                            <p className="text-gray-500 mt-2">
                                {profile.role}
                            </p>

                            <span className="mt-4 px-4 py-2 rounded-full bg-green-100 text-green-700 font-semibold">
                                {profile.accountStatus}
                            </span>

                        </div>

                    </div>

                    {/* RIGHT */}
<div className="col-span-8 space-y-8">

    {/* Profile Information */}

    <div>

        <h2 className="text-2xl font-bold text-slate-800 mb-6">
            Profile Information
        </h2>

        <div className="grid grid-cols-2 gap-6">

            <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                    Full Name
                </label>

                <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#264296]"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                    Email
                </label>

                <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#264296]"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                    Phone Number
                </label>

                <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#264296]"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                    Role
                </label>

                <input
                    type="text"
                    value={profile.role}
                    disabled
                    className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-3"
                />
            </div>

        </div>

        <button
            onClick={handleSave}
            className="mt-8 bg-[#264296] hover:bg-blue-900 text-white px-8 py-3 rounded-xl font-semibold"
        >
            Save Changes
        </button>

    </div>

    <hr className="border-gray-200" />

    {/* Change Password */}

    <div>

        <h2 className="text-2xl font-bold text-slate-800 mb-6">
            Change Password
        </h2>

        <div className="grid grid-cols-3 gap-6">

            <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                    Current Password
                </label>

                <input
                    type="password"
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#264296]"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                    New Password
                </label>

                <input
                    type="password"
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handlePasswordChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#264296]"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                    Confirm Password
                </label>

                <input
                    type="password"
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={handlePasswordChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#264296]"
                />
            </div>

        </div>

        <button
            onClick={handlePasswordUpdate}
            className="mt-8 bg-[#264296] hover:bg-blue-900 text-white px-8 py-3 rounded-xl font-semibold"
        >
            Update Password
        </button>

    </div>

    <hr className="border-gray-200" />

    {/* Account Information */}

    <div>

        <h2 className="text-2xl font-bold text-slate-800 mb-6">
            Account Information
        </h2>

        <div className="grid grid-cols-3 gap-8">

            <div>
                <p className="text-sm text-gray-500">
                    Joined Date
                </p>

                <p className="font-semibold text-slate-800 mt-1">
                    {profile.joinedDate}
                </p>
            </div>

            <div>
                <p className="text-sm text-gray-500">
                    Last Login
                </p>

                <p className="font-semibold text-slate-800 mt-1">
                    {profile.lastLogin}
                </p>
            </div>

            <div>
                <p className="text-sm text-gray-500">
                    Account Status
                </p>

                <p className="font-semibold text-green-600 mt-1">
                    {profile.accountStatus}
                </p>
            </div>

        </div>

    </div>

    <hr className="border-gray-200" />

    {/* Logout */}

    <div className="flex justify-end">

        <button  onClick={()=>navigate('/admin/login')} className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-xl font-semibold">
            Logout
        </button>

    </div>

</div>
                    


{/* Logout */}



                    </div>

                </div>

            </div>

        

    );

}
                   