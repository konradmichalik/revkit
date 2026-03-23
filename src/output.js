export function json(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

export function error(message) {
  process.stderr.write(`revkit: ${message}\n`)
  process.exit(1)
}
