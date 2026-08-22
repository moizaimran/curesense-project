import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PasswordInput from "../components/auth/PasswordInput";

describe("PasswordInput", () => {
  test("renders with default label 'Password'", () => {
    render(<PasswordInput value="" onChange={() => {}} />);
    expect(screen.getByText("Password")).toBeInTheDocument();
  });

  test("renders with custom label", () => {
    render(<PasswordInput label="Confirm Password" value="" onChange={() => {}} />);
    expect(screen.getByText("Confirm Password")).toBeInTheDocument();
  });

  test("input type is 'password' by default (password hidden)", () => {
    render(<PasswordInput value="" onChange={() => {}} />);
    expect(screen.getByPlaceholderText("Enter your password")).toHaveAttribute("type", "password");
  });

  test("toggle button initially shows 'Show'", () => {
    render(<PasswordInput value="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Show" })).toBeInTheDocument();
  });

  // ── Regression: password toggle must flip type correctly ──────────────────
  test("clicking Show changes input type to 'text' and button to 'Hide'", async () => {
    const user = userEvent.setup();
    render(<PasswordInput value="" onChange={() => {}} />);

    const toggle = screen.getByRole("button", { name: "Show" });
    await user.click(toggle);

    expect(screen.getByPlaceholderText("Enter your password")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
  });

  test("clicking Hide returns input type to 'password'", async () => {
    const user = userEvent.setup();
    render(<PasswordInput value="" onChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.click(screen.getByRole("button", { name: "Hide" }));

    expect(screen.getByPlaceholderText("Enter your password")).toHaveAttribute("type", "password");
  });

  test("calls onChange when the user types", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PasswordInput value="" onChange={onChange} />);
    await user.type(screen.getByPlaceholderText("Enter your password"), "x");
    expect(onChange).toHaveBeenCalled();
  });
});
