/**
 * Tests for LoginScreen
 * - Error handling: "Database error saving new user" shows friendly message
 * - Generic errors pass through unchanged
 * - Sent state shown on success
 * - emailRedirectTo uses VITE_APP_URL when set, falls back to window.location.origin
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

/** Click "Magic link" to reveal the email + OTP form */
async function showMagicLinkForm() {
  await userEvent.click(screen.getByText("Magic link"));
}

describe("LoginScreen — layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("renders a centered wrapper to constrain width on desktop", async () => {
    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);
    expect(document.querySelector('[data-testid="login-center-wrapper"]')).toBeInTheDocument();
  });
});

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
    await showMagicLinkForm();

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

    await showMagicLinkForm();
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

    await showMagicLinkForm();
    await userEvent.type(screen.getByPlaceholderText("neural@email.com"), "user@example.com");
    await userEvent.click(screen.getByText("Send access code"));

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
  });
});

describe("LoginScreen — emailRedirectTo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockSignInWithOtp.mockResolvedValue({ error: null, data: {} });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses VITE_APP_URL as emailRedirectTo when the env var is set", async () => {
    vi.stubEnv("VITE_APP_URL", "https://everionmind.com");

    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    await showMagicLinkForm();
    await userEvent.type(screen.getByPlaceholderText("neural@email.com"), "user@example.com");
    await userEvent.click(screen.getByText("Send access code"));

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith({
        email: "user@example.com",
        options: { emailRedirectTo: "https://everionmind.com" },
      });
    });
  });

  it("falls back to window.location.origin when VITE_APP_URL is not set", async () => {
    vi.stubEnv("VITE_APP_URL", "");

    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    await showMagicLinkForm();
    await userEvent.type(screen.getByPlaceholderText("neural@email.com"), "user@example.com");
    await userEvent.click(screen.getByText("Send access code"));

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith({
        email: "user@example.com",
        options: { emailRedirectTo: window.location.origin },
      });
    });
  });
});
