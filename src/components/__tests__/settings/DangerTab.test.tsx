import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(),
    },
    from: vi.fn().mockReturnValue({ upsert: vi.fn() }),
  },
}));

import DangerTab from "../../settings/DangerTab";
import type { Brain } from "../../../types";

const brain: Brain = { id: "b1", name: "Test Brain" };

describe("DangerTab", () => {
  it("renders the delete brain button for owners", () => {
    render(<DangerTab activeBrain={brain} deleteBrain={vi.fn()} isOwner deleteAccount={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^delete brain$/i })).toBeInTheDocument();
  });

  it("does not render delete brain button for non-owners", () => {
    render(
      <DangerTab
        activeBrain={brain}
        deleteBrain={vi.fn()}
        isOwner={false}
        deleteAccount={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /^delete brain$/i })).not.toBeInTheDocument();
  });

  it("shows confirm text after first click", () => {
    render(<DangerTab activeBrain={brain} deleteBrain={vi.fn()} isOwner deleteAccount={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^delete brain$/i }));
    expect(screen.getByText(/tap to confirm/i)).toBeInTheDocument();
  });

  it("calls deleteBrain on second click", async () => {
    const deleteBrain = vi.fn().mockResolvedValue(undefined);
    render(
      <DangerTab activeBrain={brain} deleteBrain={deleteBrain} isOwner deleteAccount={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^delete brain$/i }));
    fireEvent.click(screen.getByRole("button", { name: /tap to confirm/i }));
    expect(deleteBrain).toHaveBeenCalledWith("b1");
  });

  it("always renders the export-and-delete account button", () => {
    render(
      <DangerTab
        activeBrain={brain}
        deleteBrain={vi.fn()}
        isOwner={false}
        deleteAccount={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /export & delete/i })).toBeInTheDocument();
  });

  it("shows export/delete modal after clicking export & delete", () => {
    render(
      <DangerTab
        activeBrain={brain}
        deleteBrain={vi.fn()}
        isOwner={false}
        deleteAccount={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /export & delete/i }));
    expect(screen.getByText(/export your data first/i)).toBeInTheDocument();
  });

  it("calls deleteAccount when choosing delete without export", async () => {
    const deleteAccount = vi.fn().mockResolvedValue(undefined);
    render(
      <DangerTab
        activeBrain={brain}
        deleteBrain={vi.fn()}
        isOwner={false}
        deleteAccount={deleteAccount}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /export & delete/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete without export/i }));
    expect(deleteAccount).toHaveBeenCalled();
  });
});
