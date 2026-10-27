-- F-Ray-grance 0010: owner-confirmed identities (ADR-023). Expand-only.
-- An identity the owner confirmed from an allow-listed shop page when Scento could not verify it.
-- Shown as "Confirmed by you"; "verified" stays reserved for an exact Scento match.

ALTER TABLE app.fragrances DROP CONSTRAINT IF EXISTS fragrances_identity_status_check;
ALTER TABLE app.fragrances ADD CONSTRAINT fragrances_identity_status_check
  CHECK (identity_status IN ('verified', 'draft', 'needs_review', 'owner_confirmed'));
