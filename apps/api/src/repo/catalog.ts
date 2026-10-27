// Catalog identity data access. Exact identity only: lookups match the normalized
// brand + name + flanker + concentration + formulation; no fuzzy merge here.
import type pg from 'pg';

export interface FragranceRow {
  id: string;
  brand: string;
  canonical_name: string;
  flanker: string | null;
  concentration: string | null;
  formulation_revision: string | null;
  launch_year: number | null;
  identity_status: 'verified' | 'draft' | 'needs_review' | 'owner_confirmed';
}

const SELECT_FRAGRANCE = `
  SELECT f.id, b.canonical_name AS brand, f.canonical_name, f.flanker, f.concentration,
         f.formulation_revision, f.launch_year, f.identity_status
    FROM app.fragrances f JOIN app.brands b ON b.id = f.brand_id`;

export async function upsertBrand(db: pg.Pool | pg.PoolClient, name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO app.brands (canonical_name) VALUES ($1)
     ON CONFLICT (normalized_name) DO UPDATE SET canonical_name = app.brands.canonical_name
     RETURNING id`,
    [name],
  );
  return rows[0]!.id;
}

export interface NewFragrance {
  brandId: string;
  name: string;
  flanker?: string | null;
  concentration?: string | null;
  formulationRevision?: string | null;
  launchYear?: number | null;
  identityStatus?: FragranceRow['identity_status'];
}

export async function createFragrance(db: pg.Pool | pg.PoolClient, f: NewFragrance): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO app.fragrances (brand_id, canonical_name, flanker, concentration, formulation_revision, launch_year, identity_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [f.brandId, f.name, f.flanker ?? null, f.concentration ?? null, f.formulationRevision ?? null, f.launchYear ?? null, f.identityStatus ?? 'draft'],
  );
  return rows[0]!.id;
}

export async function getFragrance(db: pg.Pool, id: string): Promise<FragranceRow | null> {
  const { rows } = await db.query<FragranceRow>(`${SELECT_FRAGRANCE} WHERE f.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function searchFragrances(db: pg.Pool, query: string, limit: number, offset: number): Promise<FragranceRow[]> {
  const { rows } = await db.query<FragranceRow>(
    `${SELECT_FRAGRANCE}
      WHERE $1 = '' OR f.normalized_name LIKE '%' || app.normalize_identity($1) || '%'
                    OR b.normalized_name LIKE '%' || app.normalize_identity($1) || '%'
      ORDER BY b.normalized_name, f.normalized_name, f.id
      LIMIT $2 OFFSET $3`,
    [query, limit, offset],
  );
  return rows;
}
