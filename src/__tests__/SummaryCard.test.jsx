import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SummaryCard from "../components/Dashboard/SummaryCard";

describe("SummaryCard", () => {
  test("renders title and value", () => {
    render(<SummaryCard title="Total Patients" value={42} />);
    expect(screen.getByText("Total Patients")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  test("renders icon slot", () => {
    render(<SummaryCard title="T" value={0} icon={<span data-testid="icon">★</span>} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  test("renders as a <div> when onClick is not provided", () => {
    const { container } = render(<SummaryCard title="T" value={1} />);
    expect(container.firstChild.tagName).toBe("DIV");
  });

  test("renders as a <button> when onClick is provided", () => {
    render(<SummaryCard title="T" value={1} onClick={() => {}} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  test("calls onClick when clicked as button", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<SummaryCard title="Ongoing" value={3} onClick={onClick} />);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  test("does not call any handler when rendered as div (no onClick)", async () => {
    const user = userEvent.setup();
    const { container } = render(<SummaryCard title="T" value={0} />);
    await user.click(container.firstChild);
    // No assertion needed — just ensure no error is thrown
  });

  test("value of 0 renders correctly (not falsy-hidden)", () => {
    render(<SummaryCard title="Completed" value={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
