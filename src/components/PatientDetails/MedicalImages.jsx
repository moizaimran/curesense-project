import React, { useState } from "react";
import { ImageIcon, Eye } from "lucide-react";

export default function MedicalImages({ patient }) {
    const [selectedImage, setSelectedImage] = useState(null);

    return (
        <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mt-6">

                <div className="flex items-center gap-3 mb-8">

                    <ImageIcon
                        className="text-blue-600"
                        size={28}
                    />

                    <div>

                        <h2 className="text-2xl font-bold text-slate-800">
                            Medical Images
                        </h2>

                        <p className="text-gray-500 mt-1">
                            Uploaded diagnostic images with AI analysis.
                        </p>

                    </div>

                </div>

                <div className="grid md:grid-cols-2 gap-6">

                    {patient.medicalImages.map((image) => (

                        <div
                            key={image.id}
                            className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg transition"
                        >

                            {/* Image Preview */}

                            <div className="h-56 bg-slate-100 overflow-hidden">

                                <img
                                    src={image.fileName}
                                    alt={image.type}
                                    className="w-full h-full object-cover"
                                />

                            </div>

                            {/* Card Body */}

                            <div className="p-6">

                                <div className="flex justify-between items-start">

                                    <div>

                                        <h3 className="text-xl font-semibold text-slate-800">
                                            {image.type}
                                        </h3>

                                        <p className="text-sm text-gray-500 mt-1">
                                            Uploaded: {image.uploaded}
                                        </p>

                                    </div>

                                </div>

                                <div className="border-t my-5"></div>

                                <div className="space-y-5">

                                    <div className="flex justify-between">

                                        <span className="text-gray-500">
                                            CNN Prediction
                                        </span>

                                        <span className="font-semibold text-blue-700">
                                            {image.prediction}
                                        </span>

                                    </div>

                                    <div className="flex justify-between">

                                        <span className="text-gray-500">
                                            Confidence
                                        </span>

                                        <span className="font-semibold text-green-600">
                                            {image.confidence}
                                        </span>

                                    </div>

                                    <div className="flex justify-between items-center">

                                        <span className="text-gray-500">
                                            Doctor Review
                                        </span>

                                        <span
                                            className={`px-3 py-1 rounded-full text-sm font-medium ${
                                                image.doctorReview === "Confirmed"
                                                    ? "bg-green-100 text-green-700"
                                                    : "bg-yellow-100 text-yellow-700"
                                            }`}
                                        >
                                            {image.doctorReview}
                                        </span>

                                    </div>

                                </div>

                                <button
                                    onClick={() => setSelectedImage(image)}
                                    className="w-full mt-8 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl transition"
                                >

                                    <Eye size={18} />

                                    View Full Image

                                </button>

                            </div>

                        </div>

                    ))}

                </div>

            </div>

            {/* Image Popup */}

            {selectedImage && (

                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">

                    <div className="bg-white rounded-2xl p-6 w-[90%] max-w-5xl relative">

                        {/* Close Button */}

                        <button
                            onClick={() => setSelectedImage(null)}
                            className="absolute top-4 right-4 text-3xl font-bold text-gray-500 hover:text-red-600"
                        >
                            ×
                        </button>

                        <h2 className="text-2xl font-bold text-slate-800 mb-6">
                            {selectedImage.type}
                        </h2>

                        <div className="h-125 bg-slate-100 rounded-xl overflow-hidden">

                            <img
                                src={selectedImage.fileName}
                                alt={selectedImage.type}
                                className="w-full h-full object-contain"
                            />

                        </div>

                        <div className="grid grid-cols-2 gap-6 mt-6">

                            <div>

                                <p className="text-gray-500 text-sm">
                                    CNN Prediction
                                </p>

                                <p className="font-semibold text-lg">
                                    {selectedImage.prediction}
                                </p>

                            </div>

                            <div>

                                <p className="text-gray-500 text-sm">
                                    Confidence
                                </p>

                                <p className="font-semibold text-lg text-green-600">
                                    {selectedImage.confidence}
                                </p>

                            </div>

                            <div>

                                <p className="text-gray-500 text-sm">
                                    Uploaded
                                </p>

                                <p className="font-semibold">
                                    {selectedImage.uploaded}
                                </p>

                            </div>

                            <div>

                                <p className="text-gray-500 text-sm">
                                    Doctor Review
                                </p>

                                <p className="font-semibold">
                                    {selectedImage.doctorReview}
                                </p>

                            </div>

                        </div>

                    </div>

                </div>

            )}

        </>
    );
}