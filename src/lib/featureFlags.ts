export function isMultiBrainEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_MULTI_BRAIN === "true";
}
