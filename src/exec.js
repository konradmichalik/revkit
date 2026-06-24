import { execSync, execFileSync } from 'node:child_process'

export function execText(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    }).trim()
  } catch (err) {
    const stderr = err.stderr?.trim() || err.message
    throw new Error(stderr)
  }
}

// Argv-based variant — no shell, so arguments cannot inject metacharacters
export function execFileText(file, args, options = {}) {
  try {
    return execFileSync(file, args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    }).trim()
  } catch (err) {
    const stderr = err.stderr?.toString().trim() || err.message
    throw new Error(stderr)
  }
}

export function execJSON(cmd, options = {}) {
  const text = execText(cmd, options)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Expected JSON from: ${cmd}\nGot: ${text.slice(0, 200)}`)
  }
}
