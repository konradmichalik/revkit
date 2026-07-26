#!/usr/bin/env node

import { json, error } from '../src/output.js'
import { detect } from '../src/platform.js'
import { findPR, MultipleMRsError } from '../src/pr.js'
import { listComments, reply, resolve, replyAndResolve } from '../src/comments.js'
import { status } from '../src/status.js'
import { listChecks, fetchCheckLog, MultipleChecksError } from '../src/checks.js'
import { rerequest } from '../src/rerequest.js'
import { parseFlag, parseFlagAll, parseTarget, positional } from '../src/args.js'

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
      const authors = parseFlagAll(args, '--author')
      const file = parseFlag(args, '--file')
      const since = parseFlag(args, '--since')
      json(listComments({ ...options, unresolved, authors, file, since }))
      break
    }

    case 'reply': {
      const doResolve = args.includes('--resolve')
      // --resolve is a boolean flag for this command; strip it before the body
      // is assembled so it is never mistaken for reply text.
      const replyArgs = doResolve ? args.filter((a) => a !== '--resolve') : args
      const [discussionId, ...bodyParts] = positional(replyArgs)
      const body = bodyParts.join(' ')
      if (!discussionId || !body) {
        error('Usage: revkit reply <discussion-id> <body> [--resolve] [--pr <n>] [--repo <owner/repo>] [--remote <name>]')
      }
      json(doResolve ? replyAndResolve(discussionId, body, options) : reply(discussionId, body, options))
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
      const logName = parseFlag(args, '--log')
      if (logName) {
        const tailArg = parseFlag(args, '--tail')
        const tail = tailArg === null ? undefined : Number(tailArg)
        if (tail !== undefined && (!Number.isInteger(tail) || tail <= 0)) {
          error('--tail must be a positive integer')
        }
        json(fetchCheckLog(logName, { ...options, tail, raw: args.includes('--raw') }))
        break
      }
      const failed = args.includes('--failed')
      const checks = listChecks(options)
      json(failed ? checks.filter((c) => c.state === 'failure') : checks)
      break
    }

    case 'rerequest': {
      const reviewers = parseFlagAll(args, '--reviewer')
      if (reviewers.length === 0) {
        error('Usage: revkit rerequest --reviewer <name> [--reviewer <name> ...] [--pr <n>]')
      }
      json(rerequest(reviewers, options))
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
  const code = err instanceof MultipleMRsError
    ? 'multiple_merge_requests'
    : err instanceof MultipleChecksError
      ? 'multiple_checks'
      : null
  if (code) {
    process.stdout.write(JSON.stringify({
      error: code,
      message: err.message,
      candidates: err.candidates,
    }) + '\n')
    process.exit(2)
  }
  error(err.message)
}

function printHelp() {
  const help = `revkit — Git platform CLI for review workflows

Usage:
  revkit detect                       Detect platform, owner, repo, branch
  revkit pr [--pr <n>]                Find PR/MR for current branch
  revkit comments [--unresolved] [--author <name>] [--file <path>] [--since <iso>] [--pr <n>]
                                      List review comments (filters AND-combined; --author repeatable)
  revkit reply <discussion-id> <body> [--resolve] [--pr <n>]  Reply to a review thread (--resolve: also resolve it)
  revkit resolve <discussion-id> [--pr <n>]      Resolve a review thread
  revkit checks [--failed] [--pr <n>]  List CI/CD check runs per job
  revkit checks --log <name> [--tail <n>] [--raw] [--pr <n>]  Fetch a check's failure log (bounded)
  revkit rerequest --reviewer <name> [--reviewer <name> ...] [--pr <n>]  Re-request review (GitHub)
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
