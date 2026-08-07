import { X } from "lucide-react";

export default function CertificateModal({
    isOpen,
    onClose,
    certificate,
}) {

    if (!isOpen) return null;

    return (

        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">

            <div className="bg-white rounded-2xl shadow-xl w-[90%] max-w-5xl h-[90vh] overflow-hidden">

                {/* Header */}

                <div className="flex justify-between items-center px-6 py-4 border-b">

                    <h2 className="text-xl font-bold text-slate-800">

                        PMDC Certificate

                    </h2>

                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-gray-100 transition"
                    >
                        <X size={22} />
                    </button>

                </div>

                {/* PDF */}

                <iframe
                    src={certificate}
                    title="PMDC Certificate"
                    className="w-full h-full"
                />

            </div>

        </div>

    );
}