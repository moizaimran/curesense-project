import { NOTIFICATION_TYPES } from "../../utils/notificationTypes";

export default function NotificationIcon({ type, size = 20 }) {
    const meta = NOTIFICATION_TYPES[type] || NOTIFICATION_TYPES.new_case;
    const { Icon } = meta;
    return (
        <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${meta.cls}`}>
            <Icon size={size} aria-hidden="true" />
        </span>
    );
}
