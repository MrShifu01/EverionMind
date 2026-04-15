import { useState, useEffect } from "react";

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const screenHeight = window.screen.height;
    const handler = () => setVisible(vv.height < screenHeight * 0.75);
    vv.addEventListener("resize", handler);
    return () => vv.removeEventListener("resize", handler);
  }, []);
  return visible;
}
