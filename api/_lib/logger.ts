import { randomUUID } from "crypto";
import type { ApiRequest } from "./types";

export interface Logger {
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
}

export function getReqId(req: ApiRequest): string {
  return (req.headers["x-request-id"] as string | undefined) || randomUUID().slice(0, 8);
}

export function createLogger(reqId: string, context?: Record<string, unknown>): Logger {
  const base = { req_id: reqId, ...context };
  return {
    info:  (msg, extra) => console.log(  JSON.stringify({ level: "info",  msg, ...base, ...extra, ts: new Date().toISOString() })),
    warn:  (msg, extra) => console.warn( JSON.stringify({ level: "warn",  msg, ...base, ...extra, ts: new Date().toISOString() })),
    error: (msg, extra) => console.error(JSON.stringify({ level: "error", msg, ...base, ...extra, ts: new Date().toISOString() })),
  };
}
