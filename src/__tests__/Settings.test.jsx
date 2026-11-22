import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("firebase/auth", () => ({
    EmailAuthProvider: { credential: vi.fn((email, pw) => ({ email, pw })) },
    reauthenticateWithCredential: vi.fn(),
    updatePassword: vi.fn(),
}));
const { fakeAuth } = vi.hoisted(() => ({ fakeAuth: { currentUser: null } }));
vi.mock("../config/firebase", () => ({ firebaseAuth: fakeAuth }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../utils/api", () => ({ api: { get: vi.fn(), patch: vi.fn() } }));

import { reauthenticateWithCredential, updatePassword } from "firebase/auth";
import toast from "react-hot-toast";
import { api } from "../utils/api";
import ChangePasswordCard from "../components/settings/ChangePasswordCard";
import NotificationSettings from "../components/settings/NotificationSettings";
import { passwordProblem } from "../utils/passwordRules";

const passwordUser = { email: "doc@test.com", providerData: [{ providerId: "password" }] };

beforeEach(() => {
    vi.clearAllMocks();
    fakeAuth.currentUser = passwordUser;
});

async function fill(user, { current = "OldPass123", next = "NewPass456", confirm = next } = {}) {
    if (current) await user.type(screen.getByLabelText("Current password"), current);
    if (next) await user.type(screen.getByLabelText("New password"), next);
    if (confirm) await user.type(screen.getByLabelText("Confirm new password"), confirm);
    await user.click(screen.getByRole("button", { name: "Update Password" }));
}

describe("ChangePasswordCard", () => {
    test("re-authenticates with the current password, then updates it", async () => {
        const user = userEvent.setup();
        reauthenticateWithCredential.mockResolvedValue();
        updatePassword.mockResolvedValue();
        render(<ChangePasswordCard />);
        await fill(user);

        expect(reauthenticateWithCredential).toHaveBeenCalledWith(passwordUser, { email: "doc@test.com", pw: "OldPass123" });
        expect(updatePassword).toHaveBeenCalledWith(passwordUser, "NewPass456");
        expect(toast.success).toHaveBeenCalledWith("Password changed");
        expect(screen.getByLabelText("Current password")).toHaveValue("");
    });

    test.each([
        [{ next: "short1" }, "at least 8 characters"],
        [{ next: "onlyletters" }, "include a number"],
        [{ next: "12345678" }, "include a letter"],
        [{ confirm: "Different999" }, "don't match"],
        [{ next: "OldPass123" }, "different from your current"],
    ])("validation %o", async (args, message) => {
        const user = userEvent.setup();
        render(<ChangePasswordCard />);
        await fill(user, args);
        expect(screen.getByRole("alert")).toHaveTextContent(message);
        expect(reauthenticateWithCredential).not.toHaveBeenCalled();
    });

    test("wrong current password shows a friendly error", async () => {
        const user = userEvent.setup();
        reauthenticateWithCredential.mockRejectedValue({ code: "auth/invalid-credential" });
        render(<ChangePasswordCard />);
        await fill(user);
        expect(await screen.findByRole("alert")).toHaveTextContent("Your current password is incorrect.");
        expect(updatePassword).not.toHaveBeenCalled();
    });

    test("Google accounts are told to use Google instead", () => {
        fakeAuth.currentUser = { email: "g@test.com", providerData: [{ providerId: "google.com" }] };
        render(<ChangePasswordCard />);
        expect(screen.getByText(/You sign in with Google/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Update Password" })).not.toBeInTheDocument();
    });

    test("password rule helper matches the backend rule", () => {
        expect(passwordProblem("Abcdefg1")).toBe("");
        expect(passwordProblem("Abcdefgh")).not.toBe("");
    });
});

describe("NotificationSettings", () => {
    test("doctor sees their toggles with saved values; toggling saves just that setting", async () => {
        const user = userEvent.setup();
        api.get.mockResolvedValue({ email: { appointment_updates: true, payment_updates: true, messages: false } });
        api.patch.mockResolvedValue({ email: { appointment_updates: true, payment_updates: true, messages: true } });
        render(<NotificationSettings role="doctor" token="t" />);

        const messages = await screen.findByRole("switch", { name: /patient messages/i });
        expect(messages).toHaveAttribute("aria-checked", "false");
        expect(screen.getByRole("switch", { name: /new cases/i })).toHaveAttribute("aria-checked", "true");

        await user.click(messages);
        expect(api.patch).toHaveBeenCalledWith("/api/auth/me/notifications", { email: { messages: true } }, "t");
        expect(messages).toHaveAttribute("aria-checked", "true");
    });

    test("a failed save rolls the toggle back", async () => {
        const user = userEvent.setup();
        api.get.mockResolvedValue({ email: { appointment_updates: true, payment_updates: true, messages: true } });
        api.patch.mockRejectedValue(new Error("Network error"));
        render(<NotificationSettings role="doctor" token="t" />);
        const sw = await screen.findByRole("switch", { name: /new cases/i });
        await user.click(sw);
        expect(await screen.findByRole("switch", { name: /new cases/i })).toHaveAttribute("aria-checked", "true");
        expect(toast.error).toHaveBeenCalled();
    });

    test("admin only sees the payment setting", async () => {
        api.get.mockResolvedValue({ email: { appointment_updates: true, payment_updates: true, messages: true } });
        render(<NotificationSettings role="admin" token="t" />);
        await screen.findByRole("switch", { name: /payments to verify/i });
        expect(screen.getAllByRole("switch")).toHaveLength(1);
    });
});
