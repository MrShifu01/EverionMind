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
const mockSignUpWithPassword = vi.fn();
const mockSignInWithPassword = vi.fn();

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOtp: mockSignInWithOtp,
      verifyOtp: vi.fn(),
      signUp: mockSignUpWithPassword,
      signInWithPassword: mockSignInWithPassword,
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
    await userEvent.click(screen.getByText("Magic link"));

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

    await userEvent.click(screen.getByText("Magic link"));
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

    await userEvent.click(screen.getByText("Magic link"));
    await userEvent.type(screen.getByPlaceholderText("neural@email.com"), "user@example.com");
    await userEvent.click(screen.getByText("Send access code"));

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
  });
});

describe("LoginScreen — no hardcoded colors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("uses CSS variables not hardcoded oklch values in inline styles", async () => {
    const { default: LoginScreen } = await import("../../src/LoginScreen");
    const { container } = render(<LoginScreen />);

    // Walk all elements checking inline styles for raw oklch() values
    const allElements = container.querySelectorAll("*");
    const violations: string[] = [];
    allElements.forEach((el) => {
      const style = (el as HTMLElement).getAttribute("style") || "";
      if (/oklch\(/.test(style)) {
        violations.push(`${el.tagName}: ${style.slice(0, 80)}`);
      }
    });

    expect(violations).toHaveLength(0);
  });
});

describe("LoginScreen — copy hygiene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("does not render trust badge chips (redundant with privacy note)", async () => {
    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    // These badges duplicated the left-panel privacy note
    expect(screen.queryByText("End-to-end encrypted")).not.toBeInTheDocument();
    expect(screen.queryByText("No lock-in")).not.toBeInTheDocument();
    expect(screen.queryByText("Export anytime")).not.toBeInTheDocument();
  });

  it("feature list has 3 or fewer items", async () => {
    const { default: LoginScreen } = await import("../../src/LoginScreen");
    const { container } = render(<LoginScreen />);
    // Feature items each have a label div with font-weight 600
    // We check the FEATURES constant by looking for the list container's children
    const featureItems = container.querySelectorAll(".login-feature-item");
    expect(featureItems.length).toBeLessThanOrEqual(3);
  });
});

describe("LoginScreen — password login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("displays password option on initial screen", async () => {
    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    expect(screen.getByText(/use password/i)).toBeInTheDocument();
  });

  it("shows password signup form when password option is selected", async () => {
    mockSignUpWithPassword.mockResolvedValue({ error: null, data: {} });

    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    // Click the password option
    await userEvent.click(screen.getByText("Use password"));

    // Should show password signup form - check for the h2 with exact text
    const heading = screen.getByRole("heading", { name: /create account/i });
    expect(heading).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
  });

  it("signs up with password when form is submitted", async () => {
    mockSignUpWithPassword.mockResolvedValue({ error: null, data: { user: { id: "123" } } });

    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    await userEvent.click(screen.getByText("Use password"));

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password/i);

    await userEvent.type(emailInput, "user@example.com");
    await userEvent.type(passwordInput, "SecurePassword123!");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(mockSignUpWithPassword).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "SecurePassword123!",
      });
    });

    // Should show success message
    await waitFor(() => {
      expect(screen.getByText(/account created/i)).toBeInTheDocument();
    });
  });

  it("shows error when password signup fails", async () => {
    mockSignUpWithPassword.mockResolvedValue({
      error: { message: "User already exists" },
      data: {},
    });

    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    await userEvent.click(screen.getByText("Use password"));

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password/i);

    await userEvent.type(emailInput, "existing@example.com");
    await userEvent.type(passwordInput, "SecurePassword123!");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText("User already exists")).toBeInTheDocument();
    });
  });

  it("allows switching from signup to login", async () => {
    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    await userEvent.click(screen.getByText("Use password"));
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();

    // Click the link to switch to login
    const loginLink = screen.getByRole("button", { name: "Sign in" });
    await userEvent.click(loginLink);

    // Should show "Sign in" heading instead of "Create account"
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("signs in with password when login form is submitted", async () => {
    mockSignInWithPassword.mockResolvedValue({
      error: null,
      data: { user: { id: "123" } },
    });

    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    await userEvent.click(screen.getByText("Use password"));
    const loginLink = screen.getByRole("button", { name: "Sign in" });
    await userEvent.click(loginLink);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await userEvent.type(emailInput, "user@example.com");
    await userEvent.type(passwordInput, "SecurePassword123!");
    const submitButtons = screen.getAllByRole("button", { name: "Sign in" });
    // Use the last "Sign in" button (submit button, not the switch link)
    await userEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "SecurePassword123!",
      });
    });
  });

  it("disables submit button if password is too short", async () => {
    const { default: LoginScreen } = await import("../../src/LoginScreen");
    render(<LoginScreen />);

    await userEvent.click(screen.getByText("Use password"));

    const passwordInput = screen.getByLabelText(/^password/i);
    await userEvent.type(passwordInput, "short");

    // Get the submit button (it should be disabled with short password)
    const submitButton = screen.getByRole("button", { name: /create account/i });
    expect(submitButton).toBeDisabled();
  });
});
