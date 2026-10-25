# Scent Academy — Phase 11 accepted implementation addendum

Accepted 2026-10-25 by the operator's instruction to proceed with the existing Phase 11 prompt, under [ADR-010](../docs/adr/ADR-010-phase11-local-development.md). Baseline v0.1.6 and its security/data boundaries remain in force. Phase 10 recovery remains open; real-data import stays disabled.

## Learning scope

Six original versioned lessons: note pyramid/drydown; material vs note vs accord; aromatic/woody/amber families; fresh/sweet/spicy/warm/texture descriptors; concentration/projection/sillage/longevity caveats; blotter testing and sensory language. Lessons are locally authored and available without Scento or Ollama. Owner progress records not-started/in-progress/completed and a resume position against a content version. Unknown fragrance identity never becomes an invented example.

An authenticated Academy landing/learning path links to individual lessons, note explorer, family explorer, glossary, further reading and Train My Nose. Explain this in fragrance/Compare context links to a relevant local concept. Existing navigation, design tokens, focus/touch targets, dark/light modes and error states apply. Reading uses opaque surfaces. Source suggestions remain distinct from private observations.

## Provider references and optional tutor

Extend the existing server-only Scento client for on-demand material, family map/detail, lexicon and journal folios, with route-specific validation, bounded response/body sizes, TTL/cache limits, request budgets, timeouts/backoff and honest typed fallbacks. Preserve attribution and allowlisted HTTPS Scento links; never render provider HTML. No crawling or catalog mirroring. Reference requests accept only public concept terms, never observation text, collection state, ratings, credentials or chat history. English content is labelled; no Dutch provider support is claimed. Exact fragrance references reuse already verified local profiles and the existing exact resolver.

The local tutor uses original lesson text and optionally an explicitly requested public reference. It is not a Scento chat endpoint. A configured local generative model may explain a bounded question using this selected context; an embedding-only model is not a chat model. Without a configured usable generative model, return a clear unavailable status and curated lesson explanation, with no fake generated answer. No model downloads, external paid models, tools/agent execution or transmission of private observations to Scento. Tutor input/output and external text remain untrusted plain text, with owner auth, CSRF, rate/size/time bounds and source citations.

## Durable private practice

Train My Nose lets the owner choose their exact owned/sampled fragrance, or a generic blotter exercise, and record immediate/about-20/about-60 minute stages with adjustable elapsed minutes, descriptors and private text. Progress can stop/resume/complete. No background timer or daily journal. Sensory descriptions are subjective, never scored against a source pyramid as right/wrong. Exercise references remain owner-scoped; another owner's entry cannot be attached.

Add forward-only schema for lesson identities/content versions, progress and training exercises/observations, referencing existing owners/collection entries. Preserve all earlier rows/history. Include learning progress and training data in owner export/import with backward compatibility for version 1, update synthetic cleanup, backup/restore smoke and tests. Derived tutor conversation is transient unless explicitly requested otherwise; private training records persist in PostgreSQL.

## Acceptance

API/contract tests cover all six lessons, owner isolation, progress validation, observation workflow, versioned portability roundtrip/idempotency, malformed/malicious source data, cache/expiry/budgets/retry/offline and no private fields sent to Scento. Browser tests complete a mobile and desktop learning journey, navigation/Explain this, practice resume and unavailable-tutor state, with keyboard/theme/accessibility checks. Observe a bounded live educational lookup and record source/terms verification separately from fixtures. Re-run existing quality/browser/recovery checks, record atomic state/report and push explicitly selected files with `commit_gh`. No full release claim while Phase 10 remains blocked.
