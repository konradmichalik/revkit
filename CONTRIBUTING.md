# Contributing

## Setup

```bash
git clone git@github.com:konradmichalik/revkit.git
cd revkit
npm install
npm link   # make `revkit` available globally from this checkout
```

## Running tests

```bash
npm test                       # node --test test/**/*.test.js
node bin/revkit.js detect      # smoke test against the current repo
```

Every `src/*.js` module has a matching `test/*.test.js`. `test/skill.test.js`
additionally asserts that `SKILL.md` documents every subcommand and
behaviour-changing flag defined in `bin/revkit.js`. Add new commands/flags to
both, or CI fails.

## Linting

```bash
npm run lint        # eslint .
npm run lint:fix     # eslint . --fix
```

## Commit messages

Conventional commits: `<type>: <description>` where `type` is one of `feat`,
`fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`. One commit per
logical change.

## Submitting a change

Open a pull request against `main`. CI runs the test suite and ESLint on every
push and PR; both must pass before merge.
