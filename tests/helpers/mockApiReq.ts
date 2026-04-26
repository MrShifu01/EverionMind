/**
 * Shared mock helpers for API handler tests.
 *
 * The Vercel functions in api/user-data.ts and a few siblings disable the
 * built-in body parser (Stripe webhooks need the raw bytes for signature
 * verification) and consume the request as a Readable stream. That means
 * test mocks need a real stream, not just `{ body: {...} }` — otherwise
 * the handler's bufferBody() helper crashes with "stream.on is not a
 * function".
 *
 * makeApiReq encodes `body` to JSON and wraps it in a Node Readable so
 * the handler reads it the same way it would in production.
 */

import { Readable } from "stream";
import { vi } from "vitest";

export interface MockReqOptions {
  method?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  remoteAddress?: string;
}

export function makeApiReq(opts: MockReqOptions = {}) {
  const json = opts.body === undefined ? "" : JSON.stringify(opts.body);
  const stream = Readable.from([json]) as any;
  // Common Express-ish fields the handlers read directly.
  stream.method = opts.method ?? "POST";
  stream.query = opts.query ?? {};
  stream.headers = {
    "content-type": "application/json",
    authorization: "Bearer test",
    ...(opts.headers ?? {}),
  };
  stream.body = opts.body ?? {};
  stream.socket = { remoteAddress: opts.remoteAddress ?? "127.0.0.1" };
  return stream;
}

export function makeApiRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn();
  res.end = vi.fn().mockReturnValue(res);
  return res;
}
