import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CaseReviews from "../components/CaseDiagnosis/CaseReviews";

vi.mock("../utils/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
import { api } from "../utils/api";

const mount = () => render(<CaseReviews appointmentId="appt1" patientName="Sara Ahmed" token="tok" />);

beforeEach(() => vi.clearAllMocks());

describe("CaseReviews", () => {
    test("shows the patient's review and a form for the doctor when nothing submitted yet", async () => {
        api.get.mockResolvedValue({
            patient_review: { rating: 4, comment: "Very helpful", created_at: "2026-11-01T00:00:00Z" },
            doctor_review: null,
        });
        mount();
        expect(await screen.findByText("“Very helpful”")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Patient's rating: 4 out of 5" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
        expect(api.get).toHaveBeenCalledWith("/api/appointments/appt1/reviews", "tok");
    });

    test("shows a placeholder when the patient has not reviewed", async () => {
        api.get.mockResolvedValue({ patient_review: null, doctor_review: null });
        mount();
        expect(await screen.findByText("The patient hasn't left a review yet.")).toBeInTheDocument();
    });

    test("doctor picks stars, writes a comment and submits", async () => {
        const user = userEvent.setup();
        api.get.mockResolvedValue({ patient_review: null, doctor_review: null });
        api.post.mockResolvedValue({ review: { rating: 5, comment: "Punctual" } });
        mount();

        await user.click(await screen.findByRole("radio", { name: "5 stars" }));
        await user.type(screen.getByPlaceholderText(/punctual/i), "  Punctual  ");
        await user.click(screen.getByRole("button", { name: "Submit" }));

        expect(api.post).toHaveBeenCalledWith("/api/appointments/appt1/review", { rating: 5, comment: "Punctual" }, "tok");
        expect(await screen.findByText("“Punctual”")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Edit feedback" })).toBeInTheDocument();
    });

    test("existing doctor review is shown read-only and can be edited", async () => {
        const user = userEvent.setup();
        api.get.mockResolvedValue({ patient_review: null, doctor_review: { rating: 3, comment: "Late" } });
        mount();

        expect(await screen.findByText("“Late”")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Edit feedback" }));
        expect(screen.getByRole("button", { name: "Update" })).toBeEnabled();
        expect(screen.getByRole("radio", { name: "3 stars" })).toHaveAttribute("aria-checked", "true");
    });

    test("shows the API error", async () => {
        api.get.mockRejectedValue(new Error("Access denied"));
        mount();
        expect(await screen.findByText("Access denied")).toBeInTheDocument();
    });
});
