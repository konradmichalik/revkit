export const VALUE_FLAGS = ['--pr', '--repo', '--remote']

export function parseFlag(args, flag) {
  const idx = args.indexOf(flag)
  if (idx === -1) {
    return null
  }
  return args[idx + 1] || null
}

// Collect every value for a repeatable flag, e.g. --author a --author b -> ['a','b'].
// A trailing flag with no value is ignored.
export function parseFlagAll(args, flag) {
  const values = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1] !== undefined) {
      values.push(args[i + 1])
    }
  }
  return values
}

export function parseTarget(args) {
  const repo = parseFlag(args, '--repo')
  const remote = parseFlag(args, '--remote')
  return { ...(repo ? { repo } : {}), ...(remote ? { remote } : {}) }
}

// Positional args = everything that is not a known value-flag or its value.
// Boolean flags (--unresolved, --failed) are consumed by the caller via
// args.includes(), so they never reach reply/resolve bodies. Tokens that merely
// start with -- (e.g. a reply body "--repo is the flag") are preserved.
export function positional(args) {
  const result = []
  for (let i = 0; i < args.length; i++) {
    if (VALUE_FLAGS.includes(args[i])) {
      i++
      continue
    }
    result.push(args[i])
  }
  return result
}
