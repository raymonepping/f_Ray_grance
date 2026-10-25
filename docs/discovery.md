# Local text embeddings and discovery

Phase 08 uses the already installed `nomic-embed-text:v1.5` model. Observed local model manifest digest: `0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f`; measured dimensions: 768. This is the model manifest digest, distinct from the Phase 00 model-blob digest.

`POST /api/v1/fragrances/:id/embedding` is owner-authenticated and CSRF-protected. It indexes one verified, saved identity at the owner's explicit request; it never crawls a catalog or pulls a model. The detail screen exposes this under Local semantic search. Repeating the action rebuilds the derived row.

The adapter checks `/api/tags` before and after `/api/embed`, rejects digest/model/dimension changes, non-finite or zero vectors, and uses bounded timeouts. Only canonical identity and public provider/official family, pyramid and character fields enter the local model. Every user-origin claim, personal note, rating and seasonal annotation is excluded. Source text is deterministically regenerated; the stored SHA-256 input hash and `canonical-descriptors-v1` source revision invalidate stale vectors. PostgreSQL records model/revision/dimension/source/input hash/generation time. No raw vectors are sent to the browser.

Discovery uses explicit ratings >=4, user-declared seasonal love/like and seasonal liked notes. Ownership is not a preference. Owned/rejected candidates, explicitly low-rated candidates and seasonal avoid declarations are excluded. Explicit avoided notes disqualify a candidate. An empty preference set returns an explanation instead of invented recommendations.

Structured affinity is the strongest exact note-set Jaccard overlap with an anchor or seasonal liked notes; a known matching family provides a limited 0.25 fit fallback. With compatible current vectors and a verified local model, closeness blends 70% structured overlap and 30% text cosine relatedness. Similar mode ranks 80% closeness +20% family fit. Different mode ranks 65% preference fit +35% novelty, but requires evidence of fit first. Unrelatedness alone is never eligibility. Ties use stable canonical IDs. These are uncalibrated editorial ranking rules, not scent-match percentages.

Only exact cosine `<=>` search is used. An approximate index is not justified for the small saved catalog. Queries consider at most 100 saved identities and return at most 20 suggestions. Old model rows are retained as derived data but are never compared against another revision/dimension. Current-source hash checks exclude stale rows. With Ollama unavailable or changed, discovery uses structured evidence and returns null semantic values, even if cached vectors exist.

The normal UI shows reasons, distinct note directions and explicitly labelled text semantic relatedness. Structured DNA and two-way Compare remain independent of Ollama and Scento availability. Model replacement requires an intentional code/schema revision and reindex, not changing a tag silently.

Official API references checked during implementation: [Generate embeddings](https://docs.ollama.com/api/embed), [List models](https://docs.ollama.com/api/tags). Live checks on the pinned local runtime additionally verified model identity, digest and output dimensions.
