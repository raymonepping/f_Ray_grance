# ADR-004: Compare as a first-class fragrance intelligence workflow

**Status:** Accepted for product design | **Date:** 2026-10-24

## Context

A visual side-by-side comparison of Invictus Elixir and Phantom In Red demonstrated that note pyramids and normalized character bars make scent differences understandable. The app must provide more than a collection inventory.

## Decision

`Compare` is a primary navigation route. v0.1 compares exactly 2 confirmed canonical fragrance identities, with compact/expanded source-backed note pyramids, aligned 0–5 trait bars, seasonal context and an evidence-linked written explanation. Unknown data is visibly unknown. v0.2 expands to up to 4, saved comparisons and calibrated novelty analysis.

## Consequences

The product/API/UI/data model must share canonical identity, classification and provenance. An LLM is optional for prose, never the authority for a missing source or numeric score. The interface must work at 320px and for keyboard/screen-reader users. Normative contract: `COMPARE_SPEC.md`.
