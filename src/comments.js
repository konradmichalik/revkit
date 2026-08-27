import { execJSON as _execJSON, execText as _execText } from './exec.js'
import { detect } from './platform.js'
import { findPR } from './pr.js'
import { warn } from './output.js'

// Mutable deps object for testing — tests can replace these via _deps.execJSON = ...
export const _deps = {
  execJSON: _execJSON,
  execText: _execText,
}

export function listComments(options = {}) {
  const ctx = detect(options)
  const pr = findPR(options)

  const all = ctx.platform === 'github'
    ? listGitHubComments(ctx, pr, options)
    : listGitLabComments(ctx, pr, options)

  return applyFilters(all, options)
}

// Bot logins differ by representation: GraphQL reports `coderabbitai`, REST
// `coderabbitai[bot]`. Normalize both to the same key so --author matches either.
function normalizeAuthor(author) {
  return author.toLowerCase().replace(/\[bot\]$/, '')
}

// Client-side comment filters, AND-combined. Extracted as a pure function so the
// filter logic is testable without mocking a platform fetch, and so both the
// GitHub and GitLab paths share one implementation. Filters:
//   - unresolved: only threads that are not resolved
//   - authors[]:  OR within the flag; [bot]-suffix-insensitive
//   - file:       exact match against the `file` field (no globbing)
//   - since:      createdAt >= since (thread creation, not update time)
export function applyFilters(comments, options = {}) {
  let result = comments

  if (options.unresolved) {
    result = result.filter((c) => !c.resolved)
  }

  if (options.authors?.length) {
    const wanted = new Set(options.authors.map(normalizeAuthor))
    result = result.filter((c) => c.author && wanted.has(normalizeAuthor(c.author)))
  }

  if (options.file) {
    result = result.filter((c) => c.file === options.file)
  }

  if (options.since) {
    const sinceTs = Date.parse(options.since)
    if (Number.isNaN(sinceTs)) {
      throw new Error(`Invalid --since date: ${options.since}`)
    }
    result = result.filter((c) => c.createdAt && Date.parse(c.createdAt) >= sinceTs)
  }

  return result
}

export function reply(discussionId, body, options = {}) {
  const ctx = detect(options)

  if (ctx.platform === 'github') {
    return replyGitHub(ctx, discussionId, body)
  }

  return replyGitLab(ctx, discussionId, body, options)
}

export function resolve(discussionId, options = {}) {
  const ctx = detect(options)

  if (ctx.platform === 'github') {
    return resolveGitHub(discussionId)
  }

  return resolveGitLab(ctx, discussionId, options)
}

// Reply, then resolve the same thread. The reply is the meaningful mutation, so
// a failed resolve must NOT surface as exit 1 — that would push callers to retry
// the whole command and post a duplicate reply. Instead: reply failure propagates
// (exit 1, nothing mutated); resolve failure is reported as resolved:false + a
// stderr warning while the command still succeeds (exit 0), so the caller can
// retry `resolve` alone. deps is injected in tests.
export function replyAndResolve(discussionId, body, options = {}, deps = { reply, resolve, warn }) {
  const { id } = deps.reply(discussionId, body, options)

  try {
    deps.resolve(discussionId, options)
    return { success: true, id, resolved: true }
  } catch (err) {
    deps.warn(`reply succeeded but resolve failed: ${err.message}`)
    return { success: true, id, resolved: false }
  }
}

const GITHUB_THREADS_QUERY = `
  query($owner: String!, $repo: String!, $prNumber: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        reviewThreads(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            isResolved
            path
            line
            comments(first: 100) {
              nodes {
                id
                body
                author { login }
                createdAt
                diffHunk
              }
            }
          }
        }
      }
    }
  }
`

// Maps a raw GraphQL reply node (thread.comments.nodes[1..]) to the public reply shape.
function toGitHubReply(n) {
  return { id: n.id, author: n.author?.login || null, body: n.body, createdAt: n.createdAt }
}

export function listGitHubComments(ctx, pr, options) {
  const { owner, repo } = ctx
  const allComments = []
  let cursor = null

  do {
    const cursorArg = cursor ? `-f cursor=${cursor}` : ''
    const result = _deps.execJSON(
      `gh api graphql -f owner=${owner} -f repo=${repo} -F prNumber=${pr.number} ${cursorArg} -f query='${GITHUB_THREADS_QUERY}'`
    )

    const threads = result.data.repository.pullRequest.reviewThreads
    for (const thread of threads.nodes) {
      const [comment, ...replies] = thread.comments.nodes
      if (!comment) {
        continue
      }

      allComments.push({
        id: comment.id,
        discussionId: thread.id,
        author: comment.author?.login || null,
        body: comment.body,
        file: thread.path || null,
        line: thread.line || null,
        resolved: thread.isResolved,
        createdAt: comment.createdAt,
        // GitHub ships the anchoring hunk on the comment itself — no extra call.
        ...(options.context ? { diffHunk: comment.diffHunk || null } : {}),
        // Thread comments are capped at 100 (query below) — a thread with more
        // replies than that silently loses the tail rather than erroring.
        ...(options.withReplies ? { replies: replies.map(toGitHubReply) } : {}),
      })
    }

    cursor = threads.pageInfo.hasNextPage ? threads.pageInfo.endCursor : null
  } while (cursor)

  return allComments
}

// Maps a raw GitLab note (d.notes[1..], system notes already excluded) to the public reply shape.
function toGitLabReply(n) {
  return { id: String(n.id), author: n.author?.username || null, body: n.body, createdAt: n.created_at }
}

export function listGitLabComments(ctx, pr, options) {
  const projectId = encodeURIComponent(`${ctx.owner}/${ctx.repo}`)
  const discussions = _deps.execJSON(
    `glab api projects/${projectId}/merge_requests/${pr.number}/discussions`
  )

  // GitLab, unlike GitHub, does not carry the hunk on the note, so with --context
  // we fetch the MR diff once and slice the anchoring hunk out of it per comment.
  const diffs = options.context
    ? _deps.execJSON(`glab api projects/${projectId}/merge_requests/${pr.number}/diffs`)
    : null

  const allComments = []

  for (const d of discussions) {
    if (!d.notes?.length) {
      continue
    }

    const firstNote = d.notes[0]
    if (firstNote.system) {
      continue
    }

    const position = firstNote.position
    allComments.push({
      id: String(firstNote.id),
      discussionId: d.id,
      author: firstNote.author?.username || null,
      body: firstNote.body,
      file: position?.new_path || position?.old_path || null,
      line: position?.new_line || position?.old_line || null,
      resolved: d.notes.some((n) => n.resolved) || false,
      createdAt: firstNote.created_at,
      ...(options.context ? { diffHunk: gitlabDiffHunk(diffs, position) } : {}),
      ...(options.withReplies
        ? { replies: d.notes.slice(1).filter((n) => !n.system).map(toGitLabReply) }
        : {}),
    })
  }

  return allComments
}

function resolveGitHub(threadId) {
  const mutation = `
    mutation($threadId: ID!) {
      resolveReviewThread(input: {threadId: $threadId}) {
        thread { id isResolved }
      }
    }
  `

  _deps.execJSON(`gh api graphql -f threadId=${threadId} -f query='${mutation}'`)

  return { success: true }
}

function replyGitHub(_ctx, threadId, body) {
  const mutation = `
    mutation($threadId: ID!, $body: String!) {
      addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $threadId, body: $body}) {
        comment { id }
      }
    }
  `
  const escaped = body.replace(/'/g, "'\\''")

  const result = _deps.execJSON(
    `gh api graphql -f threadId=${threadId} -f body='${escaped}' -f query='${mutation}'`
  )

  const replyId = result.data?.addPullRequestReviewThreadReply?.comment?.id || null

  return { success: true, id: replyId }
}

function replyGitLab(ctx, discussionId, body, options = {}) {
  const projectId = encodeURIComponent(`${ctx.owner}/${ctx.repo}`)
  const pr = findPR(options)
  const escaped = body.replace(/'/g, "'\\''")

  const result = _deps.execJSON(
    `glab api projects/${projectId}/merge_requests/${pr.number}/discussions/${discussionId}/notes -X POST -f body='${escaped}'`
  )

  return { success: true, id: String(result.id) }
}

function resolveGitLab(ctx, discussionId, options = {}) {
  const projectId = encodeURIComponent(`${ctx.owner}/${ctx.repo}`)
  const pr = findPR(options)

  _deps.execText(
    `glab api "projects/${projectId}/merge_requests/${pr.number}/discussions/${discussionId}?resolved=true" -X PUT`
  )

  return { success: true }
}

// Find the diff for a comment's position and return the hunk it anchors to.
// Returns null when there is no position (general MR comment), no matching
// file (deleted/renamed/outdated), or no hunk covering the target line — so
// diffHunk degrades gracefully to null rather than erroring.
export function gitlabDiffHunk(diffs, position) {
  if (!Array.isArray(diffs) || !position) {
    return null
  }
  const path = position.new_path || position.old_path
  const file = diffs.find((f) => f.new_path === path || f.old_path === path)
  return extractHunk(file?.diff, position)
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

// Slice the unified-diff hunk whose line range covers the comment's target line.
// Uses the new-side line when present, else the old-side line, so both add- and
// delete-anchored comments resolve correctly.
export function extractHunk(diffText, position) {
  if (!diffText || !position) {
    return null
  }
  const useNew = Number.isInteger(position.new_line)
  const target = useNew ? position.new_line : position.old_line
  if (!Number.isInteger(target)) {
    return null
  }

  for (const hunk of splitHunks(diffText)) {
    if (hunkCovers(hunk.header, useNew, target)) {
      return hunk.text
    }
  }
  return null
}

function splitHunks(diffText) {
  const hunks = []
  let current = null
  for (const line of diffText.split('\n')) {
    const m = line.match(HUNK_HEADER)
    if (m) {
      current = { header: parseHeader(m), lines: [line] }
      hunks.push(current)
    } else if (current) {
      current.lines.push(line)
    }
  }
  return hunks.map((h) => ({ header: h.header, text: h.lines.join('\n').replace(/\n+$/, '') }))
}

function parseHeader(m) {
  return {
    oldStart: Number(m[1]),
    oldCount: m[2] === undefined ? 1 : Number(m[2]),
    newStart: Number(m[3]),
    newCount: m[4] === undefined ? 1 : Number(m[4]),
  }
}

function hunkCovers(h, useNew, target) {
  const start = useNew ? h.newStart : h.oldStart
  const count = useNew ? h.newCount : h.oldCount
  return count > 0 && target >= start && target < start + count
}
