// Owner provisioning (no public sign-up). Password is read from STDIN only — never
// argv, env or logs. Runs inside fray-api with the Vault-rendered runtime credentials.
//   node apps/api/dist/cli/owner.js create <username> <display name...>   < password
//   node apps/api/dist/cli/owner.js reset-password <username>              < password
//   node apps/api/dist/cli/owner.js revoke-sessions <username>
//   node apps/api/dist/cli/owner.js delete-synthetic <username>   (only owners without collection data)
import pg from 'pg';
import { loadConfig } from '../config.js';
import { readCredentials } from '../db/pool.js';
import { hashPassword } from '../security/password.js';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

const [cmd, rawUser, ...rest] = process.argv.slice(2);
const username = (rawUser ?? '').toLowerCase();
if (!cmd || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) {
  console.error('usage: owner.js create|reset-password|revoke-sessions|delete-synthetic <username> [display name]');
  process.exit(2);
}
const config = loadConfig();
let db: pg.Client;
try {
  const { creds } = await readCredentials(config.db.credentialsFile);
  db = new pg.Client({ host: config.db.host, port: config.db.port, database: config.db.database, user: creds.username, password: creds.password });
  await db.connect();
} catch (err) {
  console.error(JSON.stringify({ status: 'FAILED', error: `database unavailable: ${(err as Error).message}` }));
  process.exit(1);
}
try {
  if (cmd === 'create') {
    const hash = await hashPassword(await readStdin());
    const exists = await db.query('SELECT 1 FROM app.owners WHERE username = $1', [username]);
    if (exists.rowCount) throw new Error(`owner ${username} already exists (use reset-password)`);
    await db.query('BEGIN');
    const { rows } = await db.query<{ id: string }>('INSERT INTO app.owners (username, display_name) VALUES ($1, $2) RETURNING id', [
      username,
      rest.join(' ') || username,
    ]);
    await db.query('INSERT INTO app.owner_credentials (owner_id, password_hash) VALUES ($1, $2)', [rows[0]!.id, hash]);
    await db.query('COMMIT');
    console.log(JSON.stringify({ status: 'OWNER_CREATED', username }));
  } else if (cmd === 'reset-password') {
    const hash = await hashPassword(await readStdin());
    await db.query('BEGIN');
    const r = await db.query(
      `UPDATE app.owner_credentials c SET password_hash = $2, updated_at = now() FROM app.owners o WHERE o.id = c.owner_id AND o.username = $1`,
      [username, hash],
    );
    if (r.rowCount !== 1) throw new Error(`owner ${username} not found`);
    await db.query(`UPDATE app.sessions s SET revoked_at = now() FROM app.owners o WHERE o.id = s.owner_id AND o.username = $1 AND revoked_at IS NULL`, [username]);
    await db.query('COMMIT');
    console.log(JSON.stringify({ status: 'PASSWORD_RESET_SESSIONS_REVOKED', username }));
  } else if (cmd === 'revoke-sessions') {
    const r = await db.query(`UPDATE app.sessions s SET revoked_at = now() FROM app.owners o WHERE o.id = s.owner_id AND o.username = $1 AND revoked_at IS NULL`, [username]);
    console.log(JSON.stringify({ status: 'SESSIONS_REVOKED', username, count: r.rowCount }));
  } else if (cmd === 'delete-synthetic') {
    // Test owners only: refuses when any collection or season data exists (Tier A is never deleted here).
    await db.query('BEGIN');
    const o = await db.query<{ id: string }>('SELECT id FROM app.owners WHERE username = $1', [username]);
    const id = o.rows[0]?.id;
    if (!id) throw new Error(`owner ${username} not found`);
    const used = await db.query(
      `SELECT (SELECT count(*) FROM app.collection_entries WHERE owner_id=$1) + (SELECT count(*) FROM app.seasonal_preferences WHERE owner_id=$1)
            + (SELECT count(*) FROM app.season_fragrances WHERE owner_id=$1) AS n`,
      [id],
    );
    if (Number(used.rows[0].n) > 0) throw new Error('owner has personal data; refusing to delete');
    await db.query('DELETE FROM app.sessions WHERE owner_id = $1', [id]);
    await db.query('DELETE FROM app.owner_credentials WHERE owner_id = $1', [id]);
    await db.query('DELETE FROM app.login_attempts WHERE username = $1', [username]);
    await db.query('DELETE FROM app.owners WHERE id = $1', [id]);
    await db.query('COMMIT');
    console.log(JSON.stringify({ status: 'SYNTHETIC_OWNER_DELETED', username }));
  } else {
    throw new Error(`unknown command ${cmd}`);
  }
} catch (err) {
  await db.query('ROLLBACK').catch(() => undefined);
  console.error(JSON.stringify({ status: 'FAILED', error: (err as Error).message }));
  process.exitCode = 1;
} finally {
  await db.end();
}
