#!/usr/bin/env node

import { json, error } from '../src/output.js'
import { detect } from '../src/platform.js'
import { findPR, MultipleMRsError } from '../src/pr.js'
import { listComments, reply, resolve } from '../src/comments.js'
import { status } from '../src/status.js'
import { listChecks } from '../src/checks.js'

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
      const pr = parseFlag(args, '--pr')
      const positional = args.filter((a, i) => a !== '--pr' && args[i - 1] !== '--pr')
      const [discussionId, ...bodyParts] = positional
      const body = bodyParts.join(' ')
      if (!discussionId || !body) {
        error('Usage: revkit reply <discussion-id> <body> [--pr <n>]')
      }
      json(reply(discussionId, body, pr ? { number: pr } : {}))
      break
    }

    case 'resolve': {
      const pr = parseFlag(args, '--pr')
      const positional = args.filter((a, i) => a !== '--pr' && args[i - 1] !== '--pr')
      const [discussionId] = positional
      if (!discussionId) {
        error('Usage: revkit resolve <discussion-id> [--pr <n>]')
      }
      json(resolve(discussionId, pr ? { number: pr } : {}))
      break
    }

    case 'checks': {
      const pr = parseFlag(args, '--pr')
      json(listChecks(pr ? { number: pr } : {}))
      break
    }

    case 'status': {
      const pr = parseFlag(args, '--pr')
      json(status(pr ? { number: pr } : {}))
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
  if (err instanceof MultipleMRsError) {
    process.stdout.write(JSON.stringify({
      error: 'multiple_merge_requests',
      message: err.message,
      candidates: err.candidates,
    }) + '\n')
    process.exit(2)
  }
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
  revkit reply <discussion-id> <body> [--pr <n>]  Reply to a review thread
  revkit resolve <discussion-id> [--pr <n>]      Resolve a review thread
  revkit checks [--pr <n>]            List CI/CD check runs per job
  revkit status [--pr <n>]            Check feedback + pipeline status
  revkit help                         Show this help`

  process.stdout.write(help + '\n')
}
