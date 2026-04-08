import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const { mockSignOut } = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
}));

vi.mock("../../../lib/supabase", () => ({
  supabase: { auth: { signOut: mockSignOut } },
}));

import AccountTab from "../../settings/AccountTab";

describe("AccountTab", () => {
  it("displays the user email", () => {
    render(<AccountTab email="user@example.com" />);
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
  });

  it("calls supabase.auth.signOut when Sign out is clicked", () => {
    mockSignOut.mockResolvedValue({ error: null });
    render(<AccountTab email="user@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(mockSignOut).toHaveBeenCalledOnce();
  });

  it("shows signing out state while pending", async () => {
    mockSignOut.mockReturnValue(new Promise(() => {}));
    render(<AccountTab email="user@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(await screen.findByRole("button", { name: /signing out/i })).toBeInTheDocument();
  });

  it("shows error message if sign out fails", async () => {
    mockSignOut.mockResolvedValue({ error: { message: "Network error" } });
    render(<AccountTab email="user@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(screen.getByText(/network error/i)).toBeInTheDocument());
  });
});
