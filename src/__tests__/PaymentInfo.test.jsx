import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PaymentInfo from "../components/admin/Appointments/PaymentInfo";
import { paymentReadyForApproval } from "../utils/payment";

vi.mock("../utils/api", () => ({ api: { patch: vi.fn() } }));
import { api } from "../utils/api";

beforeEach(() => vi.clearAllMocks());

const base = { required: true, amount: 1500, currency: "PKR" };

describe("PaymentInfo", () => {
    test("free appointment", () => {
        render(<PaymentInfo appointmentId="a1" payment={{ required: false, status: "not_required" }} token="t" />);
        expect(screen.getByText("No consultation fee for this appointment.")).toBeInTheDocument();
    });

    test("card payment shows brand, last 4 and test-mode flag", () => {
        render(<PaymentInfo appointmentId="a1" token="t" payment={{
            ...base, status: "paid", method: "card", card_brand: "Visa", card_last4: "4242",
            gateway: "sandbox", gateway_ref: "SBX-ABC", paid_at: "2026-11-22T10:00:00Z",
        }} />);
        expect(screen.getByText("Rs 1,500")).toBeInTheDocument();
        expect(screen.getByText("Paid by card")).toBeInTheDocument();
        expect(screen.getByText(/Visa •••• 4242/)).toBeInTheDocument();
        expect(screen.getByText("TEST MODE")).toBeInTheDocument();
    });

    test("submitted wallet payment: shows TID and lets the admin reject it with a reason", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        api.patch.mockResolvedValue({ payment: { ...base, status: "rejected", rejection_reason: "Not found" } });
        render(<PaymentInfo appointmentId="a1" token="t" onChange={onChange} payment={{
            ...base, status: "submitted", method: "easypaisa", transaction_id: "EP12345678", payer_number: "03001234567",
        }} />);

        expect(screen.getByText("EP12345678")).toBeInTheDocument();
        expect(screen.getByText("Verify wallet payment")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /reject payment/i }));
        const submit = screen.getByRole("button", { name: "Reject payment" });
        expect(submit).toBeDisabled();
        await user.type(screen.getByPlaceholderText(/reason/i), "Not found");
        await user.click(submit);

        expect(api.patch).toHaveBeenCalledWith("/api/appointments/admin/a1/payment", { decision: "reject", reason: "Not found" }, "t");
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected" }));
    });

    test("refund_due offers 'mark as refunded'", async () => {
        const user = userEvent.setup();
        api.patch.mockResolvedValue({ payment: { ...base, status: "refunded" } });
        render(<PaymentInfo appointmentId="a1" token="t" payment={{ ...base, status: "refund_due", method: "card", card_brand: "Visa", card_last4: "4242" }} />);
        await user.click(screen.getByRole("button", { name: "Mark Rs 1,500 as refunded" }));
        expect(api.patch).toHaveBeenCalledWith("/api/appointments/admin/a1/payment", { decision: "refunded" }, "t");
    });
});

describe("paymentReadyForApproval", () => {
    test.each([
        [{ required: false }, true],
        [{ required: true, status: "paid" }, true],
        [{ required: true, status: "submitted" }, true],
        [{ required: true, status: "rejected" }, false],
        [{ required: true, status: "unpaid" }, false],
        [undefined, true],
    ])("%o → %s", (payment, expected) => {
        expect(paymentReadyForApproval(payment)).toBe(expected);
    });
});
