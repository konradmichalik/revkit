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
    return resolveGitHub(discussionId)
  }

  return resolveGitLab(ctx, discussionId)
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

function listGitHubComments(ctx, pr, options) {
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

  if (options.unresolved) {
    return allComments.filter((c) => !c.resolved)
  }

  return allComments
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

function replyGitHub(_ctx, commentId, body) {
  const mutation = `
    mutation($commentId: ID!, $body: String!) {
      addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $commentId, body: $body}) {
        comment { id }
      }
    }
  `
  const escaped = body.replace(/'/g, "'\\''")

  const result = execJSON(
    `gh api graphql -f commentId=${commentId} -f body='${escaped}' -f query='${mutation}'`
  )

  const replyId = result.data?.addPullRequestReviewThreadReply?.comment?.id || null

  return { success: true, id: replyId }
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
