import { describe, test, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils";
import QueryPanel from "../components/CaseDiagnosis/QueryPanel";

vi.mock("../utils/api", () => ({
  api: { post: vi.fn(), patch: vi.fn().mockResolvedValue({}) },
}));
vi.mock("react-hot-toast", () => ({ default: { error: vi.fn() } }));

import { api } from "../utils/api";

const APPT_ID = "appt-123";
const TOKEN   = "fake-jwt";

const existingMessages = [
  { _id: "m1", sender: "patient", message: "I have a question",        created_at: "2026-08-01T10:00:00Z", read: false },
  { _id: "m2", sender: "doctor",  message: "Please bring your records", created_at: "2026-08-01T10:05:00Z", read: true  },
];

function mountPanel(queries = []) {
  return renderWithProviders(
    <QueryPanel
      appointmentId={APPT_ID}
      queries={queries}
      token={TOKEN}
      onClose={vi.fn()}
      onUnreadCleared={vi.fn()}
    />
  );
}

beforeEach(() => vi.clearAllMocks());

describe("QueryPanel — message list", () => {
  test("renders existing messages", () => {
    mountPanel(existingMessages);
    expect(screen.getByText("I have a question")).toBeInTheDocument();
    expect(screen.getByText("Please bring your records")).toBeInTheDocument();
  });

  test("empty state shows placeholder text", () => {
    mountPanel([]);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  test("calls markQueriesRead (PATCH) when the panel opens", () => {
    mountPanel(existingMessages);
    expect(api.patch).toHaveBeenCalledWith(
      `/api/appointments/${APPT_ID}/queries/read`,
      {},
      TOKEN
    );
  });
});

describe("QueryPanel — sending a message", () => {
  test("typing and sending a message appends it to the list", async () => {
    const user = userEvent.setup();
    const newMsg = { _id: "m3", sender: "doctor", message: "See you at 9 AM", created_at: "2026-08-02T09:00:00Z", read: false };
    api.post.mockResolvedValueOnce({ query: newMsg });

    mountPanel(existingMessages);

    const textarea = screen.getByPlaceholderText(/type a message/i);
    await user.type(textarea, "See you at 9 AM");
    // buttons[0] = close X, buttons[1] = send; both have only icon children (no text)
    await user.click(screen.getAllByRole("button")[1]);

    await waitFor(() => {
      expect(screen.getByText("See you at 9 AM")).toBeInTheDocument();
    });

    expect(api.post).toHaveBeenCalledWith(
      `/api/appointments/${APPT_ID}/queries`,
      { message: "See you at 9 AM" },
      TOKEN
    );
  });

  test("Send button is disabled when textarea is empty", () => {
    mountPanel([]);
    // buttons[0] = close X, buttons[1] = send
    const sendButton = screen.getAllByRole("button")[1];
    expect(sendButton).toBeDisabled();
  });

  test("Enter without Shift submits the message", async () => {
    const user = userEvent.setup();
    const newMsg = { _id: "m4", sender: "doctor", message: "Hello", created_at: "", read: false };
    api.post.mockResolvedValueOnce({ query: newMsg });

    mountPanel([]);
    const textarea = screen.getByPlaceholderText(/type a message/i);
    await user.type(textarea, "Hello{Enter}");

    await waitFor(() => expect(api.post).toHaveBeenCalled());
  });
});

describe("QueryPanel — close button", () => {
  test("close button calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <QueryPanel appointmentId={APPT_ID} queries={[]} token={TOKEN}
        onClose={onClose} onUnreadCleared={vi.fn()} />
    );
    // Header X button is the first button in the panel; send button is second
    await user.click(screen.getAllByRole("button")[0]);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
