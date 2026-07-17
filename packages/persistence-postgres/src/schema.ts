/** DDL shared by orchestrator persistence and API control-state (same database OK). */
export const ORCHESTRATOR_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bossraid_meta (
  key integer PRIMARY KEY CHECK (key = 1),
  version integer NOT NULL,
  saved_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS raid_records (
  raid_id text PRIMARY KEY,
  updated_at text NOT NULL,
  payload_json text NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_records (
  provider_id text PRIMARY KEY,
  updated_at text NOT NULL,
  payload_json text NOT NULL
);
CREATE TABLE IF NOT EXISTS launch_reservation_records (
  reservation_id text PRIMARY KEY,
  updated_at text NOT NULL,
  payload_json text NOT NULL
);
`;

export const API_CONTROL_STATE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bossraid_api_control_state (
  key integer PRIMARY KEY CHECK (key = 1),
  version integer NOT NULL,
  saved_at text NOT NULL,
  snapshot_json text NOT NULL
);
`;
