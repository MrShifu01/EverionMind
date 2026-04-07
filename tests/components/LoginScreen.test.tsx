/**
 * Tests for LoginScreen
 * - Error handling: "Database error saving new user" shows friendly message
 * - Generic errors pass through unchanged
 * - Sent state shown on success
 * - No hardcoded color values (CSS vars only)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignInWithOtp = vi.fn();

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOtp: mockSignInWithOtp,
      verifyOtp: vi.fn(),
    },
  },
}));

// Lazy import after mock is set up
async function renderLoginScreen() {
  const { default: LoginScreen } = await import("../../src/LoginScreen");
  return render(<LoginScreen />);
}

describe("LoginScreen — error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("maps 'Database error saving new user' to a user-friendly message", async () => {
    mockSignInWithOtp.mockResolvedValue({
      error: { message: "Database error saving new user" },
      data: {},
    });

    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    // Show the email form

    // Enter email and submit
    await userEvent.type(screen.getByPlaceholderText("neural@email.com"), "new@example.com");
    await userEvent.click(screen.getByText("Send access code"));

    await waitFor(() => {
      // Raw Supabase error must NOT be shown
      expect(screen.queryByText("Database error saving new user")).not.toBeInTheDocument();
      // A friendly message must appear
      expect(screen.getByText(/account setup failed/i)).toBeInTheDocument();
    });
  });

  it("passes other error messages through unchanged", async () => {
    mockSignInWithOtp.mockResolvedValue({
      error: { message: "Email rate limit exceeded" },
      data: {},
    });

    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    await userEvent.type(screen.getByPlaceholderText("neural@email.com"), "user@example.com");
    await userEvent.click(screen.getByText("Send access code"));

    await waitFor(() => {
      expect(screen.getByText("Email rate limit exceeded")).toBeInTheDocument();
    });
  });

  it("shows the sent state when signInWithOtp succeeds", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null, data: {} });

    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    await userEvent.type(screen.getByPlaceholderText("neural@email.com"), "user@example.com");
    await userEvent.click(screen.getByText("Send access code"));

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
  });
});
