// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CustomerForm from "@/components/booking/CustomerForm";

describe("CustomerForm Component", () => {
  it("renders all form fields and labels properly", () => {
    render(<CustomerForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/uk mobile number/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue to payment/i })).toBeInTheDocument();
  });

  it("populates initial values if customerDetails is provided", () => {
    const details = {
      name: "Arthur Dent",
      email: "arthur@galaxy.com",
      phone: "07123456789",
    };

    render(<CustomerForm customerDetails={details} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/full name/i)).toHaveValue("Arthur Dent");
    expect(screen.getByLabelText(/email address/i)).toHaveValue("arthur@galaxy.com");
    expect(screen.getByLabelText(/uk mobile number/i)).toHaveValue("07123456789");
  });

  it("shows validation errors when attempting to submit an empty form", () => {
    const handleSubmit = vi.fn();
    render(<CustomerForm onSubmit={handleSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: /continue to payment/i }));

    expect(screen.getByText(/full name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/mobile number is required/i)).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("validates UK mobile number format strictly", () => {
    const handleSubmit = vi.fn();
    render(<CustomerForm onSubmit={handleSubmit} />);

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email address/i);
    const phoneInput = screen.getByLabelText(/uk mobile number/i);
    const submitBtn = screen.getByRole("button", { name: /continue to payment/i });

    fireEvent.change(nameInput, { target: { value: "Ford Prefect" } });
    fireEvent.change(emailInput, { target: { value: "ford@hitchhiker.com" } });

    // 1. Landline number
    fireEvent.change(phoneInput, { target: { value: "0121 496 0123" } });
    fireEvent.click(submitBtn);
    expect(screen.getByText(/enter a valid uk mobile/i)).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();

    // 2. Too short
    fireEvent.change(phoneInput, { target: { value: "0712345" } });
    fireEvent.click(submitBtn);
    expect(screen.getByText(/enter a valid uk mobile/i)).toBeInTheDocument();

    // 3. Valid UK mobile number with spaces
    fireEvent.change(phoneInput, { target: { value: "07123 456 789" } });
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledWith({
      name: "Ford Prefect",
      email: "ford@hitchhiker.com",
      phone: "07123 456 789",
    });
  });

  it("validates email address format", () => {
    const handleSubmit = vi.fn();
    render(<CustomerForm onSubmit={handleSubmit} />);

    const emailInput = screen.getByLabelText(/email address/i);
    const submitBtn = screen.getByRole("button", { name: /continue to payment/i });

    fireEvent.change(emailInput, { target: { value: "invalid-email" } });
    fireEvent.click(submitBtn);

    expect(screen.getByText(/enter a valid email/i)).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});
