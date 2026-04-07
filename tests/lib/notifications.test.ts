import { describe, it, expect, vi } from "vitest";
import {
  showToast,
  showError,
  showSuccess,
  onToast,
  captureError,
} from "../../src/lib/notifications";
import type { ToastEvent } from "../../src/types";

describe("notifications", () => {
  it("onToast registers a listener that receives toast events", () => {
    const listener = vi.fn();
    const unsub = onToast(listener);

    showToast("Hello", "info");
    expect(listener).toHaveBeenCalledTimes(1);
    const event: ToastEvent = listener.mock.calls[0][0];
    expect(event.message).toBe("Hello");
    expect(event.type).toBe("info");
    expect(typeof event.id).toBe("number");

    unsub();
  });

  it("showError sends an error toast", () => {
    const listener = vi.fn();
    const unsub = onToast(listener);
    showError("Oops");
    expect(listener.mock.calls[0][0].type).toBe("error");
    unsub();
  });

  it("showSuccess sends a success toast", () => {
    const listener = vi.fn();
    const unsub = onToast(listener);
    showSuccess("Done!");
    expect(listener.mock.calls[0][0].type).toBe("success");
    unsub();
  });

  it("unsubscribe stops receiving events", () => {
    const listener = vi.fn();
    const unsub = onToast(listener);
    unsub();
    showToast("nope");
    expect(listener).not.toHaveBeenCalled();
  });

  it("captureError logs to console", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    captureError(new Error("test"), "ctx");
    expect(spy).toHaveBeenCalledWith("[OpenBrain:ctx]", expect.any(Error));
    spy.mockRestore();
  });
});
