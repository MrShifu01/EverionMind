import { ApiError } from "./withAuth.js";

export type JsonObject = Record<string, unknown>;

export function bodyObject(body: unknown): JsonObject {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Request body must be a JSON object");
  }
  return body as JsonObject;
}

export function optionalBodyObject(body: unknown): JsonObject {
  if (body == null) return {};
  return bodyObject(body);
}

export function stringField(
  body: JsonObject,
  key: string,
  opts: { required?: boolean; max?: number } = {},
): string | undefined {
  const value = body[key];
  if (value == null || value === "") {
    if (opts.required) throw new ApiError(400, `${key} required`);
    return undefined;
  }
  if (typeof value !== "string") throw new ApiError(400, `${key} must be a string`);
  const trimmed = value.trim();
  if (opts.required && !trimmed) throw new ApiError(400, `${key} required`);
  if (opts.max && trimmed.length > opts.max) throw new ApiError(400, `${key} too long`);
  return trimmed;
}

export function numberField(
  body: JsonObject,
  key: string,
  opts: { min?: number; max?: number; integer?: boolean; fallback?: number } = {},
): number | undefined {
  const value = body[key];
  if (value == null || value === "") return opts.fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiError(400, `${key} must be a number`);
  }
  if (opts.integer && !Number.isInteger(value)) throw new ApiError(400, `${key} must be an integer`);
  if (opts.min != null && value < opts.min) throw new ApiError(400, `${key} too small`);
  if (opts.max != null && value > opts.max) throw new ApiError(400, `${key} too large`);
  return value;
}

export function stringArrayField(
  body: JsonObject,
  key: string,
  opts: { maxItems?: number; maxLength?: number } = {},
): string[] | undefined {
  const value = body[key];
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new ApiError(400, `${key} must be an array`);
  const maxItems = opts.maxItems ?? value.length;
  const maxLength = opts.maxLength ?? 200;
  return value
    .filter((item): item is string => typeof item === "string")
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean);
}

export function recordField(body: JsonObject, key: string): JsonObject | undefined {
  const value = body[key];
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, `${key} must be an object`);
  }
  return value as JsonObject;
}
