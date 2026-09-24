import express from 'express'
import pg from 'pg'

/**
 * Nagpur HealthGrid API — Express + Neon Postgres.
 *
 * Stores EMERGENCY CASES in a shared Postgres database (Neon) so cases
 * created on one device are visible everywhere. The frontend keeps a
 * localStorage mirror for offline resilience (Network Blackout Mode).
 *
 * Honest-data rule: this API persists coordinator-created cases only.
 * Hospital / ambulance / blood-bank availability stays SIMULATED demo data
 * served by the frontend — the API does not pretend to hold verified
 * real-time bed or GPS feeds.
 */

const { Pool } = pg

// Neon works best with a small pooled pool over its pooled connection string.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
})

const app = express()
app.use(express.json({ limit: '256kb' }))

// Minimal CORS: allow the frontend origin (comma-separated allowlist in env).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (ALLOWED_ORIGINS.includes('*') || (origin && ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin ?? '*')
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// --- schema (idempotent, runs at boot with retries) -------------------------
let schemaReady = false
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cases (
      id          TEXT PRIMARY KEY,
      data        JSONB NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS case_counter (
      id      INTEGER PRIMARY KEY DEFAULT 1,
      value   INTEGER NOT NULL
    )
  `)
  await pool.query(`
    INSERT INTO case_counter (id, value) VALUES (1, 1000)
    ON CONFLICT (id) DO NOTHING
  `)
  // --- live-update trigger (SSE change detection, primary path) ---
  // NOTIFY cannot carry parameters, so the payload is built via format().
  // Fires on INSERT and UPDATE of every case row.
  await pool.query(`
    CREATE OR REPLACE FUNCTION nhg_notify_case_change() RETURNS trigger AS $$
    BEGIN
      PERFORM pg_notify('nhg_case_changed', json_build_object('id', NEW.id)::text);
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `)
  await pool.query(`
    DROP TRIGGER IF EXISTS nhg_case_changed_trg ON cases
  `)
  await pool.query(`
    CREATE TRIGGER nhg_case_changed_trg
    AFTER INSERT OR UPDATE ON cases
    FOR EACH ROW EXECUTE FUNCTION nhg_notify_case_change()
  `)
  schemaReady = true
}

/**
 * Retry schema bootstrap in the background. Neon free-tier computes suspend
 * when idle, so the first connection after a nap can fail — we keep trying
 * instead of leaving the API permanently unprovisioned.
 */
/** Log a DB error in full — pg errors sometimes have empty .message. */
function logDbError(context, err) {
  const stack = err?.stack ?? String(err)
  const url = process.env.DATABASE_URL
  const host = url ? (url.split('@')[1] ?? '').split('/')[0] : 'NOT SET'
  console.error(`[${context}] DB error. DATABASE_URL host: ${host}`, stack)
}

async function bootstrapWithRetry() {
  for (let attempt = 1; attempt <= 60 && !schemaReady; attempt++) {
    try {
      await ensureSchema()
      console.log('Schema ready')
    } catch (err) {
      logDbError(`Schema bootstrap attempt ${attempt}`, err)
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
}

// --- helpers ----------------------------------------------------------------
function badRequest(res, message) {
  return res.status(400).json({ error: message })
}

/** Light validation — the case body must look like an EmergencyCase. */
function isValidCase(body) {
  return (
    body &&
    typeof body === 'object' &&
    typeof body.id === 'string' && /^NGP-\d+$/.test(body.id) &&
    typeof body.patientName === 'string' && body.patientName.length > 0 &&
    typeof body.emergencyType === 'string' &&
    typeof body.priority === 'string' &&
    typeof body.status === 'string' &&
    body.hospital && body.bed && body.ambulance && body.blood && body.navigation
  )
}

// --- routes -----------------------------------------------------------------
/**
 * Health probe. ALWAYS returns 200 — deploy orchestrators (Render) use this
 * to decide if the process is up. DB state is reported separately so the
 * service can go live even while Neon is cold-starting; case endpoints then
 * 503 gracefully until the DB responds.
 */
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ ok: true, db: 'connected' })
  } catch (err) {
    logDbError('Health check', err)
    res.json({ ok: true, db: 'unreachable' })
  }
})

/** Allocate the next case id atomically (NGP-1001, NGP-1002, ...). */
app.get('/api/next-case-id', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE case_counter SET value = value + 1 WHERE id = 1 RETURNING value`,
    )
    res.json({ id: `NGP-${rows[0].value}` })
  } catch {
    res.status(503).json({ error: 'Database unavailable' })
  }
})

/** All cases, newest first. */
app.get('/api/cases', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT data FROM cases ORDER BY created_at DESC, id DESC LIMIT 500`,
    )
    res.json(rows.map((r) => r.data))
  } catch {
    res.status(503).json({ error: 'Database unavailable' })
  }
})

// --- server-sent events (live case updates) ---------------------------------
/**
 * SSE fanout for live case updates. Browsers subscribe to /api/events with
 * EventSource; the server pushes a `case` event for every INSERT/UPDATE on
 * the cases table so dashboards converge across devices in ~1s instead of
 * waiting for a poll cycle.
 *
 * Change detection has two layers:
 * - Primary: Postgres LISTEN/NOTIFY on a dedicated non-pooled client. Neon's
 *   pooled endpoint (PgBouncer, transaction mode) cannot LISTEN, so we dial
 *   the DIRECT endpoint — derived from the pooled URL by stripping the
 *   `-pooler` host infix (standard Neon URL shape). The nhg_case_changed_trg
 *   trigger (created in ensureSchema) fires a NOTIFY on every case write.
 * - Fallback: if the dedicated client cannot connect (or LISTEN is blocked),
 *   a 5s changed-row poll on the normal pool detects writes and fans out.
 *   The stream therefore degrades to near-poll latency — never to silence.
 */
let listenerClient = null
let listenerHealthy = false
let lastSeenStamp = null
let fallbackTimer = null

function sseEventForCase(caseId, reason) {
  const payload = JSON.stringify({ id: caseId, reason, at: new Date().toISOString() })
  return `event: case\ndata: ${payload}\n\n`
}

function sseHeartbeat() {
  return `: ping ${Date.now()}\n\n`
}

// In-process registry of connected browsers.
const sseClients = new Set()

function fanoutToClients(caseId, reason) {
  if (sseClients.size === 0) return
  const frame = sseEventForCase(caseId, reason)
  for (const res of sseClients) {
    try {
      res.write(frame)
    } catch {
      sseClients.delete(res) // dead socket; its close handler finishes cleanup
    }
  }
}

/**
 * Changed-row poll — the fallback when LISTEN/NOTIFY is unavailable.
 * 5s cadence, under the old 10s client poll, so SSE is never worse than
 * what it replaces. Only the newest updated row is compared: cheap, and
 * case writes are serialized by the coordination flow anyway.
 */
function startFallbackPoll() {
  if (fallbackTimer) return
  console.log('SSE change detection: fallback DB poll (5s)')
  fallbackTimer = setInterval(async () => {
    try {
      const { rows } = await pool.query(
        `SELECT id, extract(epoch from updated_at)::bigint AS stamp
         FROM cases
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`,
      )
      if (rows.length > 0) {
        const latest = `${rows[0].id}:${rows[0].stamp}`
        if (lastSeenStamp !== null && latest !== lastSeenStamp) {
          fanoutToClients(rows[0].id, 'poll')
        }
        lastSeenStamp = latest
      }
      listenerHealthy = true // poll works → stream stays useful without LISTEN
    } catch {
      listenerHealthy = false // DB unreachable; new subscriptions report 503
    }
  }, 5000)
  fallbackTimer.unref()
}

async function startCaseListener() {
  // Derive the direct (non-pooler) connection string for LISTEN/NOTIFY.
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    console.log('SSE LISTEN/NOTIFY: no DATABASE_URL — using fallback poll')
    startFallbackPoll()
    return
  }
  const directUrl = dbUrl.replace('-pooler', '')
  if (directUrl === dbUrl) {
    console.log('SSE LISTEN/NOTIFY: no direct endpoint derivable — using fallback poll')
    startFallbackPoll()
    return
  }
  try {
    listenerClient = new pg.Client({ connectionString: directUrl, ssl: { rejectUnauthorized: false } })
    listenerClient.on('error', () => {
      listenerHealthy = false
    })
    listenerClient.on('notification', (msg) => {
      if (msg.channel !== 'nhg_case_changed') return
      try {
        const payload = JSON.parse(msg.payload ?? '{}')
        fanoutToClients(payload.id ?? '*', 'notify')
      } catch {
        // Malformed payload — announce a generic refresh so clients re-pull.
        fanoutToClients('*', 'notify')
      }
    })
    await listenerClient.connect()
    await listenerClient.query('LISTEN nhg_case_changed')
    listenerHealthy = true
    console.log('SSE LISTEN/NOTIFY: active on nhg_case_changed')
  } catch (err) {
    console.error('SSE LISTEN/NOTIFY setup failed — using fallback poll', err?.message ?? err)
    try {
      await listenerClient?.end()
    } catch {
      /* ignore */
    }
    listenerClient = null
    startFallbackPoll()
  }
}

/**
 * SSE subscription endpoint. Single route with a readiness guard:
 * while change detection is not yet healthy (Neon cold-start, boot), the
 * endpoint answers 503 so EventSource retries instead of streaming an
 * empty, silent channel. First success also seeds the poll baseline.
 */
app.get('/api/events', async (req, res) => {
  if (!listenerHealthy) {
    res.status(503).json({ error: 'Live updates temporarily unavailable' })
    return
  }
  try {
    if (lastSeenStamp === null) {
      const { rows } = await pool.query(
        `SELECT id, extract(epoch from updated_at)::bigint AS stamp
         FROM cases ORDER BY updated_at DESC, id DESC LIMIT 1`,
      )
      lastSeenStamp = rows.length > 0 ? `${rows[0].id}:${rows[0].stamp}` : ''
    }
  } catch {
    /* baseline seeding is best-effort; poll will set it next tick */
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(`retry: 4000\n\n`)
  res.write(`event: hello\ndata: {}\n\n`)
  sseClients.add(res)

  const ping = setInterval(() => {
    try {
      res.write(sseHeartbeat())
    } catch {
      sseClients.delete(res)
    }
  }, 25000)

  req.on('close', () => {
    clearInterval(ping)
    sseClients.delete(res)
  })
})

app.get('/api/cases/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT data FROM cases WHERE id = $1`, [req.params.id])
    if (rows.length === 0) return res.status(404).json({ error: 'Case not found' })
    res.json(rows[0].data)
  } catch {
    res.status(503).json({ error: 'Database unavailable' })
  }
})

/** Create or fully replace a case (frontend keeps authoritative snapshots). */
app.post('/api/cases', async (req, res) => {
  const body = req.body
  if (!isValidCase(body)) return badRequest(res, 'Invalid case payload')
  try {
    await pool.query(
      `INSERT INTO cases (id, data) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [body.id, JSON.stringify(body)],
    )
    res.status(201).json({ ok: true, id: body.id })
  } catch {
    res.status(503).json({ error: 'Database unavailable' })
  }
})

const PORT = Number(process.env.PORT) || 8787
const server = app.listen(PORT, () => {
  console.log(`HealthGrid API listening on port ${PORT}`)
})

bootstrapWithRetry()
startCaseListener()

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => process.exit(0))
  })
}

export { app }
