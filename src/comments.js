import { execJSON, execText } from './exec.js'
import { detect } from './platform.js'
import { findPR } from './pr.js'

export function listComments(options = {}) {
  const ctx = detect()
  const pr = findPR(options)

  if (ctx.platform === 'github') {
    return listGitHubComments(ctx, pr, options)
  }

  return listGitLabComments(ctx, pr, options)
}

export function reply(commentId, body) {
  const ctx = detect()

  if (ctx.platform === 'github') {
    return replyGitHub(ctx, commentId, body)
  }

  return replyGitLab(ctx, commentId, body)
}

export function resolve(discussionId) {
  const ctx = detect()

  if (ctx.platform === 'github') {
    return { success: false, error: 'GitHub does not support resolving threads via API' }
  }

  return resolveGitLab(ctx, discussionId)
}

function listGitHubComments(ctx, pr, options) {
  const { owner, repo } = ctx
  const comments = execJSON(
    `gh api repos/${owner}/${repo}/pulls/${pr.number}/comments --paginate`
  )

  const reviewComments = execJSON(
    `gh api repos/${owner}/${repo}/pulls/${pr.number}/reviews --paginate`
  )

  const allComments = []

  for (const c of comments) {
    allComments.push(normalizeGitHubComment(c))
  }

  for (const review of reviewComments) {
    if (review.body && review.body.trim()) {
      allComments.push({
        id: String(review.id),
        discussionId: null,
        author: review.user?.login || null,
        body: review.body,
        file: null,
        line: null,
        resolved: review.state === 'DISMISSED',
        createdAt: review.submitted_at,
      })
    }
  }

  if (options.unresolved) {
    return allComments.filter((c) => !c.resolved)
  }

  return allComments
}

function normalizeGitHubComment(c) {
  const resolved =
    c.subject_type === 'line'
      ? c.position === null && c.original_position !== null
      : false

  return {
    id: String(c.id),
    discussionId: c.in_reply_to_id ? String(c.in_reply_to_id) : String(c.id),
    author: c.user?.login || null,
    body: c.body,
    file: c.path || null,
    line: c.line || c.original_line || null,
    resolved,
    createdAt: c.created_at,
  }
}

function listGitLabComments(ctx, pr, options) {
  const projectId = encodeURIComponent(`${ctx.owner}/${ctx.repo}`)
  const discussions = execJSON(
    `glab api projects/${projectId}/merge_requests/${pr.number}/discussions`
  )

  const allComments = []

  for (const d of discussions) {
    if (!d.notes?.length) {
      continue
    }

    const firstNote = d.notes[0]
    if (firstNote.system) {
      continue
    }

    allComments.push({
      id: String(firstNote.id),
      discussionId: d.id,
      author: firstNote.author?.username || null,
      body: firstNote.body,
      file: firstNote.position?.new_path || firstNote.position?.old_path || null,
      line: firstNote.position?.new_line || firstNote.position?.old_line || null,
      resolved: d.notes.some((n) => n.resolved) || false,
      createdAt: firstNote.created_at,
    })
  }

  if (options.unresolved) {
    return allComments.filter((c) => !c.resolved)
  }

  return allComments
}

function replyGitHub(ctx, commentId, body) {
  const { owner, repo } = ctx
  const pr = findPR()
  const escaped = body.replace(/'/g, "'\\''")

  const result = execJSON(
    `gh api repos/${owner}/${repo}/pulls/${pr.number}/comments/${commentId}/replies -f body='${escaped}'`
  )

  return { success: true, id: String(result.id) }
}

function replyGitLab(ctx, discussionId, body) {
  const projectId = encodeURIComponent(`${ctx.owner}/${ctx.repo}`)
  const pr = findPR()
  const escaped = body.replace(/'/g, "'\\''")

  const result = execJSON(
    `glab api projects/${projectId}/merge_requests/${pr.number}/discussions/${discussionId}/notes -f body='${escaped}'`
  )

  return { success: true, id: String(result.id) }
}

function resolveGitLab(ctx, discussionId) {
  const projectId = encodeURIComponent(`${ctx.owner}/${ctx.repo}`)
  const pr = findPR()

  execText(
    `glab api projects/${projectId}/merge_requests/${pr.number}/discussions/${discussionId} -X PUT -f resolved=true`
  )

  return { success: true }
}
