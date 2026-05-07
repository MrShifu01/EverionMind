/**
 * Tests for LoginScreen
 * - Error handling: "Database error saving new user" shows friendly message
 * - Generic errors pass through unchanged
 * - Sent state shown on success
 * - emailRedirectTo uses VITE_APP_URL and fails closed when it is missing
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

/** Click "Email me a code" to reveal the email + OTP form */
async function showMagicLinkForm() {
  await userEvent.click(screen.getByText("Email me a code"));
}

describe("LoginScreen — layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv("VITE_APP_URL", "https://everion.smashburgerbar.co.za");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
    vi.stubEnv("VITE_APP_URL", "https://everion.smashburgerbar.co.za");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
    await userEvent.type(screen.getByPlaceholderText("you@email.com"), "new@example.com");
    await userEvent.click(screen.getByText("Send my code"));

    await waitFor(() => {
      // Raw Supabase error must NOT be shown
      expect(screen.queryByText("Database error saving new user")).not.toBeInTheDocument();
      // A friendly message must appear
      expect(screen.getByText(/account setup failed/i)).toBeInTheDocument();
    });
  });

  it("rewrites rate-limit errors into a friendly message", async () => {
    mockSignInWithOtp.mockResolvedValue({
      error: { message: "Email rate limit exceeded" },
      data: {},
    });

    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    await showMagicLinkForm();
    await userEvent.type(screen.getByPlaceholderText("you@email.com"), "user@example.com");
    await userEvent.click(screen.getByText("Send my code"));

    await waitFor(() => {
      expect(screen.queryByText("Email rate limit exceeded")).not.toBeInTheDocument();
      expect(screen.getByText(/too many attempts/i)).toBeInTheDocument();
    });
  });

  it("passes unmapped error messages through unchanged", async () => {
    mockSignInWithOtp.mockResolvedValue({
      error: { message: "Some bespoke server message" },
      data: {},
    });

    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    await showMagicLinkForm();
    await userEvent.type(screen.getByPlaceholderText("you@email.com"), "user@example.com");
    await userEvent.click(screen.getByText("Send my code"));

    await waitFor(() => {
      expect(screen.getByText("Some bespoke server message")).toBeInTheDocument();
    });
  });

  it("shows the sent state when signInWithOtp succeeds", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null, data: {} });

    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    await showMagicLinkForm();
    await userEvent.type(screen.getByPlaceholderText("you@email.com"), "user@example.com");
    await userEvent.click(screen.getByText("Send my code"));

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
    vi.stubEnv("VITE_APP_URL", "https://everion.smashburgerbar.co.za");

    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    await showMagicLinkForm();
    await userEvent.type(screen.getByPlaceholderText("you@email.com"), "user@example.com");
    await userEvent.click(screen.getByText("Send my code"));

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith({
        email: "user@example.com",
        options: { emailRedirectTo: "https://everion.smashburgerbar.co.za" },
      });
    });
  });

  it("fails closed when VITE_APP_URL is not set", async () => {
    vi.stubEnv("VITE_APP_URL", "");

    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    await showMagicLinkForm();
    await userEvent.type(screen.getByPlaceholderText("you@email.com"), "user@example.com");
    await userEvent.click(screen.getByText("Send my code"));

    await waitFor(() => {
      expect(mockSignInWithOtp).not.toHaveBeenCalled();
      expect(screen.getByText(/auth redirects/i)).toBeInTheDocument();
    });
  });
});
