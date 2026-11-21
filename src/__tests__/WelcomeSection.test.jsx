import { describe, test, expect } from "vitest";
import { screen } from "@testing-library/react";
import WelcomeSection from "../components/Dashboard/WelcomeSection";
import { greetingFor, doctorDisplayName } from "../utils/greeting";
import { renderWithProviders } from "../test-utils";

const at = (h) => new Date(2026, 10, 21, h, 0, 0);

describe("WelcomeSection", () => {
    test("greeting follows the time of day", () => {
        expect(greetingFor(at(8))).toBe("Good Morning");
        expect(greetingFor(at(11))).toBe("Good Morning");
        expect(greetingFor(at(12))).toBe("Good Afternoon");
        expect(greetingFor(at(16))).toBe("Good Afternoon");
        expect(greetingFor(at(17))).toBe("Good Evening");
        expect(greetingFor(at(23))).toBe("Good Evening");
    });

    test("never prints Dr. twice", () => {
        expect(doctorDisplayName("Dr. Sara Ahmed")).toBe("Dr. Sara Ahmed");
        expect(doctorDisplayName("dr Sara Ahmed")).toBe("Dr. Sara Ahmed");
        expect(doctorDisplayName("Hassan Raheem")).toBe("Dr. Hassan Raheem");
        expect(doctorDisplayName("")).toBe("Doctor");
        expect(doctorDisplayName(undefined)).toBe("Doctor");
    });

    test("shows the logged-in doctor's name", () => {
        renderWithProviders(<WelcomeSection />, {
            initialState: { auth: { token: "t", user: { name: "Dr. Sara Ahmed", role: "doctor" } } },
        });
        expect(screen.getByRole("heading")).toHaveTextContent(/Dr\. Sara Ahmed/);
        expect(screen.getByRole("heading")).not.toHaveTextContent(/Ahmed Khan/);
    });
});
