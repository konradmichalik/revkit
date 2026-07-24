import { execJSON, execText } from './exec.js'
import { detect } from './platform.js'
import { findPR } from './pr.js'

export function listComments(options = {}) {
  const ctx = detect(options)
  const pr = findPR(options)

  const all = ctx.platform === 'github'
    ? listGitHubComments(ctx, pr)
    : listGitLabComments(ctx, pr)

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
            comments(first: 1) {
              nodes {
                id
                body
                author { login }
                createdAt
              }
            }
          }
        }
      }
    }
  }
`

function listGitHubComments(ctx, pr) {
  const { owner, repo } = ctx
  const allComments = []
  let cursor = null

  do {
    const cursorArg = cursor ? `-f cursor=${cursor}` : ''
    const result = execJSON(
      `gh api graphql -f owner=${owner} -f repo=${repo} -F prNumber=${pr.number} ${cursorArg} -f query='${GITHUB_THREADS_QUERY}'`
    )

    const threads = result.data.repository.pullRequest.reviewThreads
    for (const thread of threads.nodes) {
      const comment = thread.comments.nodes[0]
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
      })
    }

    cursor = threads.pageInfo.hasNextPage ? threads.pageInfo.endCursor : null
  } while (cursor)

  return allComments
}

function listGitLabComments(ctx, pr) {
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

  execJSON(`gh api graphql -f threadId=${threadId} -f query='${mutation}'`)

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

  const result = execJSON(
    `gh api graphql -f threadId=${threadId} -f body='${escaped}' -f query='${mutation}'`
  )

  const replyId = result.data?.addPullRequestReviewThreadReply?.comment?.id || null

  return { success: true, id: replyId }
}

function replyGitLab(ctx, discussionId, body, options = {}) {
  const projectId = encodeURIComponent(`${ctx.owner}/${ctx.repo}`)
  const pr = findPR(options)
  const escaped = body.replace(/'/g, "'\\''")

  const result = execJSON(
    `glab api projects/${projectId}/merge_requests/${pr.number}/discussions/${discussionId}/notes -X POST -f body='${escaped}'`
  )

  return { success: true, id: String(result.id) }
}

function resolveGitLab(ctx, discussionId, options = {}) {
  const projectId = encodeURIComponent(`${ctx.owner}/${ctx.repo}`)
  const pr = findPR(options)

  execText(
    `glab api "projects/${projectId}/merge_requests/${pr.number}/discussions/${discussionId}?resolved=true" -X PUT`
  )

  return { success: true }
}
