#!/usr/bin/env node

import { json, error } from '../src/output.js'
import { detect } from '../src/platform.js'
import { findPR } from '../src/pr.js'
import { listComments, reply, resolve } from '../src/comments.js'

const [command, ...args] = process.argv.slice(2)

try {
  switch (command) {
    case 'detect':
      json(detect())
      break

    case 'pr': {
      const pr = parseFlag(args, '--pr')
      json(findPR(pr ? { number: pr } : {}))
      break
    }

    case 'comments': {
      const unresolved = args.includes('--unresolved')
      const pr = parseFlag(args, '--pr')
      json(listComments({ unresolved, ...(pr ? { number: pr } : {}) }))
      break
    }

    case 'reply': {
      const [commentId, ...bodyParts] = args
      const body = bodyParts.join(' ')
      if (!commentId || !body) {
        error('Usage: revkit reply <comment-id> <body>')
      }
      json(reply(commentId, body))
      break
    }

    case 'resolve': {
      const [discussionId] = args
      if (!discussionId) {
        error('Usage: revkit resolve <discussion-id>')
      }
      json(resolve(discussionId))
      break
    }

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp()
      break

    default:
      error(`Unknown command: ${command}\nRun 'revkit help' for usage.`)
  }
} catch (err) {
  error(err.message)
}

function parseFlag(args, flag) {
  const idx = args.indexOf(flag)
  if (idx === -1) {
    return null
  }
  return args[idx + 1] || null
}

function printHelp() {
  const help = `revkit — Git platform CLI for review workflows

Usage:
  revkit detect                       Detect platform, owner, repo, branch
  revkit pr [--pr <n>]                Find PR/MR for current branch
  revkit comments [--unresolved] [--pr <n>]  List review comments
  revkit reply <id> <body>            Reply to a comment
  revkit resolve <discussion-id>      Resolve a thread (GitLab only)
  revkit help                         Show this help`

  process.stdout.write(help + '\n')
}
