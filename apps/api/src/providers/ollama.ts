// Local-only embedding adapter. Digest and dimensions were measured on this stack.
export const MODEL = 'nomic-embed-text:v1.5';
export const MODEL_REVISION = '0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f';
export const DIMENSION = 768;
export class EmbeddingError extends Error {}
export class OllamaClient {
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly base = 'http://fray-ollama:11434') {}
  async verify(): Promise<void> {
    const r = await this.fetcher(`${this.base}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) throw new EmbeddingError('Local embedding service unavailable');
    const d = await r.json() as { models?: { name: string; digest: string }[] };
    if (!d.models?.some(m => m.name === MODEL && m.digest === MODEL_REVISION)) throw new EmbeddingError('Pinned embedding model unavailable; reindex requires an explicit model revision change');
  }
  async embed(text: string): Promise<number[]> {
    if (!text || text.length > 12000) throw new EmbeddingError('Embedding source is empty or too long');
    await this.verify();
    const r = await this.fetcher(`${this.base}/api/embed`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, input: text, truncate: false }) });
    if (!r.ok) throw new EmbeddingError('Local embedding generation failed');
    const d = await r.json() as { model?: string; embeddings?: unknown[] };
    const v = d.embeddings?.[0];
    if (d.model !== MODEL || !Array.isArray(v) || v.length !== DIMENSION || !v.every(x => typeof x === 'number' && Number.isFinite(x)) || !v.some(x => x !== 0)) throw new EmbeddingError('Embedding model or dimensions changed; no vector was stored');
    // Detect a model replacement during generation instead of mislabelling the vector.
    await this.verify();
    return v as number[];
  }
}
