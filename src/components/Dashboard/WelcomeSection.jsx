import { useSelector } from "react-redux";
import { selectUser } from "../../features/auth/authSlice";
import { greetingFor, doctorDisplayName } from "../../utils/greeting";

export default function WelcomeSection() {
    const user = useSelector(selectUser);

    return (
        <section>
            <h2>
                {greetingFor()}, {doctorDisplayName(user?.name)} 👋
            </h2>
            <p>
                Here's an overview of today's activities.
            </p>
        </section>
    );
}
