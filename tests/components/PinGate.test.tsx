import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("../../src/lib/aiSettings", () => ({ getUserId: () => "test-user" }));
vi.mock("../../src/lib/authFetch", () => ({ authFetch: vi.fn() }));
vi.mock("../../src/ThemeContext", () => ({
  useTheme: () => ({ t: {}, isDark: true, toggleTheme: () => {} }),
}));

// Stub localStorage
beforeEach(() => {
  vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null);
});

async function renderPinGate(isSetup = false) {
  const { PinGate } = await import("../../src/lib/pin");
  return render(<PinGate onSuccess={vi.fn()} onCancel={vi.fn()} isSetup={isSetup} />);
}

describe("PinGate — accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null);
  });

  it("overlay has role=dialog and aria-modal", async () => {
    const { container } = await renderPinGate(true);
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
  });

  it("dialog has aria-labelledby pointing to visible title", async () => {
    const { container } = await renderPinGate(true);
    const dialog = container.querySelector('[role="dialog"]');
    const labelledBy = dialog?.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const titleEl = container.querySelector(`#${labelledBy}`);
    expect(titleEl).not.toBeNull();
    expect(titleEl?.textContent).toBeTruthy();
  });

  it("PIN input has an accessible label (not just placeholder)", async () => {
    const { container } = await renderPinGate(true);
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    const inputId = input?.getAttribute("id");
    expect(inputId).toBeTruthy();
    // Must have an associated label element
    const label = container.querySelector(`label[for="${inputId}"]`);
    expect(label).not.toBeNull();
  });

  it("error message container has role=alert so AT announces it", async () => {
    const { container } = await renderPinGate(true);
    // The alert container should always be present (aria-live pattern)
    const alertEl = container.querySelector('[role="alert"]');
    expect(alertEl).not.toBeNull();
  });

  it("decorative emoji is aria-hidden", async () => {
    const { container } = await renderPinGate(true);
    const emoji = container.querySelector('[aria-hidden="true"]');
    expect(emoji).not.toBeNull();
    expect(emoji?.textContent).toContain("🔒");
  });
});
