// The JSON shapes are a machine contract for agents and scripts. Every output
// carries a top-level schemaVersion so shape changes are explicit, not silent.
// Bump on any breaking shape change; purely additive fields do not bump.
export const SCHEMA_VERSION = 1

// Wrap at the single output choke point so no module has to carry the version.
// Object outputs gain a schemaVersion field; array outputs move into an
// envelope { schemaVersion, items: [...] } so the top level is always an object.
export function json(data) {
  const payload = Array.isArray(data)
    ? { schemaVersion: SCHEMA_VERSION, items: data }
    : { ...data, schemaVersion: SCHEMA_VERSION }
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
}

export function error(message) {
  process.stderr.write(`revkit: ${message}\n`)
  process.exit(1)
}
