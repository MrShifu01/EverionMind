import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const { mockSignOut, mockFrom } = vi.hoisted(() => {
  const chainEnd = { data: null, error: null };
  const queryChain: Record<string, unknown> = {};
  queryChain.select = vi.fn().mockReturnValue(queryChain);
  queryChain.eq = vi.fn().mockReturnValue(queryChain);
  queryChain.single = vi.fn().mockResolvedValue(chainEnd);
  // useSubscription's user_usage lookup ends in .maybeSingle()
  queryChain.maybeSingle = vi.fn().mockResolvedValue(chainEnd);
  const mockFrom = vi.fn().mockReturnValue(queryChain);
  return { mockSignOut: vi.fn(), mockFrom };
});

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    auth: {
      signOut: mockSignOut,
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1", user_metadata: {} } } }),
      onAuthStateChange: vi.fn(),
    },
    from: mockFrom,
  },
}));

import AccountTab from "../../settings/AccountTab";

describe("AccountTab", () => {
  it("displays the user email", () => {
    render(<AccountTab email="user@example.com" />);
    expect(screen.getAllByText("user@example.com").length).toBeGreaterThan(0);
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
