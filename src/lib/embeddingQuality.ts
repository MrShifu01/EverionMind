export enum EmbeddingQuality { Poor = "poor", Good = "good" }
const MIN_DIM = 128;
export function scoreEmbeddingQuality(v: number[]): EmbeddingQuality {
  if (v.length < MIN_DIM) return EmbeddingQuality.Poor;
  if (v.some(x => isNaN(x))) return EmbeddingQuality.Poor;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (norm < 1e-6) return EmbeddingQuality.Poor;
  return EmbeddingQuality.Good;
}
