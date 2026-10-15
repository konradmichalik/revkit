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

// Older glab versions print one JSON array per page, back to back
function splitTopLevelArrays(text) {
  const pages = []
  let depth = 0
  let inString = false
  let escaped = false
  let start = -1

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
    } else if (ch === '"') {
      inString = true
    } else if (ch === '[' || ch === '{') {
      if (depth === 0) {
        if (ch !== '[') {
          return null
        }
        start = i
      }
      depth++
    } else if (ch === ']' || ch === '}') {
      depth--
      if (depth === 0) {
        pages.push(text.slice(start, i + 1))
      }
    } else if (depth === 0 && !/\s/.test(ch)) {
      return null
    }
  }

  return depth === 0 && pages.length ? pages : null
}

function parseJSON(text) {
  try {
    return JSON.parse(text)
  } catch (err) {
    const pages = splitTopLevelArrays(text)
    if (!pages) {
      throw err
    }
    return pages.flatMap((page) => JSON.parse(page))
  }
}

// The endpoint is quoted because `&` and `?` are shell metacharacters
export function glabPaginated(endpoint) {
  const separator = endpoint.includes('?') ? '&' : '?'
  return `glab api "${endpoint}${separator}per_page=100" --paginate`
}

export function execJSON(cmd, options = {}) {
  const text = execText(cmd, options)
  try {
    return parseJSON(text)
  } catch {
    throw new Error(`Expected JSON from: ${cmd}\nGot: ${text.slice(0, 200)}`)
  }
}
