# Indicative traits: sourced-notes-v1

The API derives each fragrance's eleven traits from its effective top/heart/base pyramid. Existing provenance precedence remains user correction, official source, provider, derived. Compact display uses the first source-listed note in each tier as a representative, never as a measured dominant ingredient.

The auditable rule table is `apps/api/src/domain/dna.ts` (`NOTE_RULES`). Each exact normalized note maps to reviewed descriptor expression on the indicative 0–5 scale. The score is the maximum matching rule expression for that axis. It is not ingredient concentration, performance, quality or scientific scent measurement. Notes without an explicit rule provide no trait evidence. An axis with no matched rule is NULL/unknown, even if other axes have values; absence from a provider's list is not proof of zero expression.

Normalization folds case, accents and punctuation. Explicit aliases cover cedarwood/cedar, vanilla bean/vanilla, bergamot orange/bergamot and sea salt/salt. Different accords remain distinct unless explicitly covered by the alias table. Original source wording remains available.

Every response includes method version, source field metadata, evidence note labels and expression values. Current scores are calculated from current effective claims, so a manual correction or source refresh cannot silently reuse stale scores. Compare reads data without modifying collection history, source claims or preference records. Both profiles use the same rule table and scale. Only axes with known values on both sides produce numeric difference explanations.

No similarity percentage is produced. Shared notes describe source-listed overlap; unique notes mean listed on one side only, not confirmed absent from the other. Personal seasonal choices and provider editorial suggestions are labelled separately. Unknown seasonal affinity is never guessed from ownership.

Changing rule strengths or normalization requires a new method version and regression tests. These initial rules are an explainable editorial heuristic with no claim of independently calibrated sensory accuracy. Structured DNA and comparison require neither live Scento nor Ollama.
