// Persona handlers extracted from api/entries.ts (audit task 1315 batch).
// All six are thin wrappers around _lib/enrich and _lib/extractPersonaFacts —
// keeping them out of the dispatcher reduces cyclomatic complexity in
// entries.ts without changing semantics.
import { ApiError, requireBrainAccess, type HandlerContext } from "../withAuth.js";
import { bodyObject } from "../requestBody.js";
import {
  backfillPersonaForBrain,
  revertBackfilledPersonaForBrain,
  wipeExtractedPersonaForBrain,
  auditPersonaForBrain,
} from "../enrich.js";
import { buildPrompt, loadExtractorContext } from "../extractPersonaFacts.js";
import { distillRejectedForUser } from "../distillRejected.js";
import { isAdminUser } from "../adminAuth.js";

export async function handleBackfillPersona({ req, res, user }: HandlerContext): Promise<void> {
  const { brain_id, batch_size } = bodyObject(req.body);
  if (!brain_id || typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  await requireBrainAccess(user.id, brain_id);
  const batchSize =
    typeof batch_size === "number" && batch_size > 0 ? Math.min(batch_size, 100) : 50;
  const result = await backfillPersonaForBrain(user.id, brain_id, batchSize);
  res.status(200).json(result);
}

export async function handleRevertPersonaBackfill({
  req,
  res,
  user,
}: HandlerContext): Promise<void> {
  const { brain_id } = bodyObject(req.body);
  if (!brain_id || typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  await requireBrainAccess(user.id, brain_id);
  const result = await revertBackfilledPersonaForBrain(user.id, brain_id);
  res.status(200).json(result);
}

export async function handleWipePersonaExtracted({
  req,
  res,
  user,
}: HandlerContext): Promise<void> {
  const { brain_id } = bodyObject(req.body);
  if (!brain_id || typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  await requireBrainAccess(user.id, brain_id);
  const result = await wipeExtractedPersonaForBrain(user.id, brain_id);
  res.status(200).json(result);
}

export async function handleAuditPersona({ req, res, user }: HandlerContext): Promise<void> {
  const { brain_id } = bodyObject(req.body);
  if (!brain_id || typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  await requireBrainAccess(user.id, brain_id);
  const result = await auditPersonaForBrain(user.id, brain_id);
  res.status(200).json(result);
}

export async function handlePersonaPrompt({ req, res, user }: HandlerContext): Promise<void> {
  if (!isAdminUser(user)) throw new ApiError(403, "Forbidden");
  const brain_id = req.query.brain_id as string | undefined;
  if (!brain_id || typeof brain_id !== "string") throw new ApiError(400, "brain_id required");
  await requireBrainAccess(user.id, brain_id);
  const ctx = await loadExtractorContext(user.id, brain_id);
  const prompt = buildPrompt(ctx);
  res.status(200).json({ context: ctx, prompt });
}

export async function handleDistillRejected({ res, user }: HandlerContext): Promise<void> {
  if (!isAdminUser(user)) throw new ApiError(403, "Forbidden");
  const result = await distillRejectedForUser(user.id);
  res.status(result.ok ? 200 : 502).json(result);
}
