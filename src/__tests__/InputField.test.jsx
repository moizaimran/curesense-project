import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InputField from "../components/auth/InputField";

describe("InputField", () => {
  test("renders label and input", () => {
    render(
      <InputField label="Email Address" type="email" placeholder="Enter email"
        value="" onChange={() => {}} name="email" />
    );
    expect(screen.getByText("Email Address")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter email")).toBeInTheDocument();
  });

  test("input has the correct type attribute", () => {
    render(
      <InputField label="Password" type="password" placeholder="pw"
        value="" onChange={() => {}} name="password" />
    );
    expect(screen.getByPlaceholderText("pw")).toHaveAttribute("type", "password");
  });

  test("input has the correct name attribute", () => {
    render(
      <InputField label="Email" type="text" placeholder="e"
        value="" onChange={() => {}} name="myField" />
    );
    expect(screen.getByPlaceholderText("e")).toHaveAttribute("name", "myField");
  });

  test("displays the current value", () => {
    render(
      <InputField label="Email" type="text" placeholder="e"
        value="hello@test.com" onChange={() => {}} name="email" />
    );
    expect(screen.getByDisplayValue("hello@test.com")).toBeInTheDocument();
  });

  test("calls onChange when the user types", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <InputField label="Email" type="text" placeholder="type here"
        value="" onChange={onChange} name="email" />
    );
    const input = screen.getByPlaceholderText("type here");
    await user.type(input, "a");
    expect(onChange).toHaveBeenCalled();
  });
});
