#!/usr/bin/env node

import { json, error } from '../src/output.js'
import { detect } from '../src/platform.js'
import { findPR, MultipleMRsError } from '../src/pr.js'
import { listComments, reply, resolve } from '../src/comments.js'
import { status } from '../src/status.js'
import { listChecks } from '../src/checks.js'

const [command, ...args] = process.argv.slice(2)

try {
  const base = parseTarget(args)
  const pr = parseFlag(args, '--pr')
  const options = { ...base, ...(pr ? { number: pr } : {}) }

  switch (command) {
    case 'detect':
      json(detect(base))
      break

    case 'pr':
      json(findPR(options))
      break

    case 'comments': {
      const unresolved = args.includes('--unresolved')
      json(listComments({ ...options, unresolved }))
      break
    }

    case 'reply': {
      const [discussionId, ...bodyParts] = positional(args)
      const body = bodyParts.join(' ')
      if (!discussionId || !body) {
        error('Usage: revkit reply <discussion-id> <body> [--pr <n>] [--repo <owner/repo>] [--remote <name>]')
      }
      json(reply(discussionId, body, options))
      break
    }

    case 'resolve': {
      const [discussionId] = positional(args)
      if (!discussionId) {
        error('Usage: revkit resolve <discussion-id> [--pr <n>] [--repo <owner/repo>] [--remote <name>]')
      }
      json(resolve(discussionId, options))
      break
    }

    case 'checks': {
      const failed = args.includes('--failed')
      const checks = listChecks(options)
      json(failed ? checks.filter((c) => c.state === 'failure') : checks)
      break
    }

    case 'status':
      json(status(options))
      break

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

const VALUE_FLAGS = ['--pr', '--repo', '--remote']

function parseFlag(args, flag) {
  const idx = args.indexOf(flag)
  if (idx === -1) {
    return null
  }
  return args[idx + 1] || null
}

function parseTarget(args) {
  const repo = parseFlag(args, '--repo')
  const remote = parseFlag(args, '--remote')
  return { ...(repo ? { repo } : {}), ...(remote ? { remote } : {}) }
}

function positional(args) {
  const result = []
  for (let i = 0; i < args.length; i++) {
    if (VALUE_FLAGS.includes(args[i])) {
      i++
      continue
    }
    if (args[i].startsWith('--')) {
      continue
    }
    result.push(args[i])
  }
  return result
}

function printHelp() {
  const help = `revkit — Git platform CLI for review workflows

Usage:
  revkit detect                       Detect platform, owner, repo, branch
  revkit pr [--pr <n>]                Find PR/MR for current branch
  revkit comments [--unresolved] [--pr <n>]  List review comments
  revkit reply <discussion-id> <body> [--pr <n>]  Reply to a review thread
  revkit resolve <discussion-id> [--pr <n>]      Resolve a review thread
  revkit checks [--failed] [--pr <n>]  List CI/CD check runs per job
  revkit status [--pr <n>]            Check feedback + pipeline status
  revkit help                         Show this help

Target repository (available on all subcommands, highest precedence first):
  --repo <owner/repo>                 Override target repository directly
  --remote <name>                     Resolve target from this git remote's URL
  (env: REVKIT_REPO, REVKIT_REMOTE)   Same overrides via environment
  Default: origin remote

Fork PR example (PR lives on upstream, origin is your fork):
  revkit status --remote upstream --pr 42
  revkit comments --unresolved --repo octocat/upstream-repo --pr 42`

  process.stdout.write(help + '\n')
}
