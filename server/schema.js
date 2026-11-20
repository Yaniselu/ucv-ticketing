// Schema bazei de date (idempotentă: rulează la fiecare pornire a serverului)
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    name text NOT NULL,
    phone text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'scanner', 'admin')),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS password_resets (
    token_hash text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    used boolean NOT NULL DEFAULT false
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id text PRIMARY KEY,
    home text NOT NULL,
    away text NOT NULL,
    competition_id text NOT NULL,
    phase text NOT NULL DEFAULT '',
    kickoff timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    sale_start timestamptz,
    sale_end timestamptz,
    config jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    user_id uuid NOT NULL REFERENCES users(id),
    event_id text NOT NULL REFERENCES events(id),
    status text NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'expired')),
    total integer NOT NULL,
    expires_at timestamptz,
    payment_ref text,
    created_at timestamptz NOT NULL DEFAULT now(),
    paid_at timestamptz,
    cancelled_at timestamptz,
    email_sent_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id, event_id)`,
  `CREATE TABLE IF NOT EXISTS order_items (
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    seat_key text NOT NULL,
    sector_id text NOT NULL,
    price integer NOT NULL,
    PRIMARY KEY (order_id, seat_key)
  )`,
  // un loc al unui meci poate fi într-o singură stare: rezervat temporar, vândut sau blocat
  `CREATE TABLE IF NOT EXISTS seat_locks (
    event_id text NOT NULL REFERENCES events(id),
    seat_key text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('hold', 'sold', 'blocked')),
    order_id uuid REFERENCES orders(id),
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, seat_key)
  )`,
  `CREATE INDEX IF NOT EXISTS seat_locks_order ON seat_locks(order_id)`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id),
    event_id text NOT NULL REFERENCES events(id),
    seat_key text NOT NULL,
    holder_name text NOT NULL,
    price integer NOT NULL,
    info jsonb NOT NULL,
    status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'used', 'cancelled')),
    used_at timestamptz,
    used_by uuid,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tickets_seat_active ON tickets(event_id, seat_key) WHERE status <> 'cancelled'`,
  `CREATE INDEX IF NOT EXISTS tickets_order ON tickets(order_id)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key text PRIMARY KEY,
    count integer NOT NULL,
    reset_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id bigserial PRIMARY KEY,
    user_id uuid,
    action text NOT NULL,
    details jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
]
