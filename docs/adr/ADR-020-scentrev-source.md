# ADR-020: ScentRev as a second, lower-precedence fragrance source

Status: Accepted by explicit operator instruction, 2026-10-27.

The operator asked for a backup and addition to Scento: the ScentRev fragrance API (`https://mcp.scentrev.com/perfume-api`). Its key was in the operator's `.env` and is to be moved into Vault (prompt `18_scentrev_source.md`).

## Decision

- **Secret handling.** The key lives in fray-vault at `kv/fray/scentrev`. It is stored with `make scentrev-key` (stdin or a hidden prompt, never echoed) and rendered by Vault Agent to `/vault/rendered/scentrev.json`, which only the API reads. The `fray-api` policy gets read access, and an empty key means the integration is off. The key is removed from `.env` once it is stored.
- **Role.** ScentRev fills gaps where Scento has no value, as origin `provider` with source `scentrev`, below Scento and above derived values and web research. Scento remains the identity reference, and a ScentRev record never verifies an identity on its own. Every ScentRev match must pass the exact-identity rule (ADR-016, R4).
- **Use within the Terms.** ScentRev Terms §3 forbid bulk scraping, building a competing dataset and reselling raw access. F-Ray-grance queries ScentRev only for a fragrance the owner is viewing or researching, keeps a local call budget below the free-tier caps (300 per day, 1,500 per week), and stores only the claims the owner keeps, with attribution. ScentRev data is community-derived and comes with no accuracy guarantee (Terms §2), so it is labelled "ScentRev (community data)", with vote counts.
- **Observed contract.** The adapter is built only from responses actually observed from the live API, recorded as fixtures without the key. While the API is unavailable, the integration stays blocked and no field names are invented.
