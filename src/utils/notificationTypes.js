import { UserPlus, AlertTriangle, MessageCircle, FlaskConical, Image } from "lucide-react";

// Icon + label per notification type (labels are always shown, never color alone)
export const NOTIFICATION_TYPES = {
    new_case:        { label: "New case",    Icon: UserPlus,      cls: "text-blue-600 bg-blue-50" },
    emergency_case:  { label: "Urgent",      Icon: AlertTriangle, cls: "text-red-600 bg-red-50" },
    patient_message: { label: "Message",     Icon: MessageCircle, cls: "text-green-700 bg-green-50" },
    test_upload:     { label: "Test result", Icon: FlaskConical,  cls: "text-purple-600 bg-purple-50" },
    image_uploaded:  { label: "Image",       Icon: Image,         cls: "text-amber-700 bg-amber-50" },
};

// "just now", "5 min ago", "3 h ago", "2 days ago", or a date
export function timeAgo(iso, now = Date.now()) {
    if (!iso) return "";
    const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
    if (s < 60) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    const d = Math.round(h / 24);
    if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
