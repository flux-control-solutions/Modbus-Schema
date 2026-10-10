# @flux-control/modbus-schema

Device-independent Effect 4 schemas for Modbus register values, with Effect-native and synchronous APIs.

## Development

Use Bun for package development.
Run commands from this repository's root. If a parent workspace manages dependencies, install from that workspace's root.

```bash
bun install
bun run format
bun run lint
bun run typecheck
bun run test
bun run build
```

`bun run format` checks formatting. Use `bun run format:fix` to write formatting changes.
Use `bun run lint:fix` to apply lint fixes.
After dependency changes, run `bun run lock` to regenerate and validate the lockfile.

Tests import source files directly. Package exports use `dist/`, so build before testing package imports or preparing a release.
Run checks relevant to the change. For documentation-only changes, check formatting, paths, commands, and technical accuracy.

### Commit hook

- `bun install` installs the Husky hook through `prepare`. Run `bun run prepare` to reinstall it.
- The hook checks lockfile staging, fixes staged files with `lint-staged`, then runs package lint and tests.
- Oxlint fixes run before oxfmt. Remaining lint errors or test failures block the commit.
- Keep lint-staged's default backup and partial-staging protection enabled. Do not add a separate `git add` step.
- Package lint and tests run against the working tree after staged fixes.
- Run required type checks, builds, and Fallow audits separately before PR handoff.

### Fallow audit

- For code, dependency, or tooling configuration changes, run a Fallow audit alongside relevant type checks, lint, formatting, and tests.
- Run the audit from this repository's root after the final edits, before committing or opening or updating a pull request.

```bash
bunx fallow audit --base <base-ref>
```

- Replace `<base-ref>` with the merge-base commit between `HEAD` and the intended PR target branch.
- For uncommitted work only, use `HEAD`. Do not use `HEAD` to verify commits already included in a PR.
- The Fallow MCP `audit` tool is equivalent. Set `root` to this repository and `base` to the same comparison ref.
- Inspect the verdict and findings. Fix verified findings introduced by the change, then rerun the audit.
- Verify usage before deleting reported code or dependencies. Public exports can have consumers outside this repository.
- Explain remaining findings or false positives. Do not weaken rules or add baselines only to obtain a passing result.
- If Fallow cannot run, report the blocker. Do not count a skipped audit as a pass.
- Documentation-only changes do not require a Fallow audit.

## Architecture and conventions

- Keep the schema engine independent of devices. Do not import device brands, register enums, or device error types.
- Preserve `UInt16` and `Int16` range validation at the register boundary.
- Keep Effect-native and synchronous encode/decode operations consistent.
- Use Effect Schema's synchronous operations for synchronous APIs. Preserve `Schema.SchemaError` failures.
- Return concrete inferred schema types from factories. Do not widen factory returns to `Schema.Codec`.
- Preserve generated patch schemas and merge behavior for bitfields.
- Keep `ParamConfig` and `ParamKind` aligned with `fromConfig` dispatch.
- Preserve description annotations, including additional register metadata.
- Read descriptions with `Schema.resolveAnnotations(entry.schema)?.description`.
- Follow the installed Effect 4 APIs. Use `SchemaIssue`, `SchemaTransformation`, and `Schema.toFormatter` where appropriate.
- Use `import type` for type-only imports.
- Import test helpers from `bun:test`.
- Test changed range checks, transformations, synchronous behavior, and inferred public types.
- Let oxfmt control formatting and import order.

See `README.md` and `examples/` for factory usage.

## Tooling

- Keep dependency versions and compiler settings in `package.json` and the TypeScript configuration.

## Written communication

Use Simplified Technical English principles for all text you create or revise.
This includes documentation, code comments, JSDoc, TODOs, test descriptions, error messages, and agent instructions.
It also includes commit messages, pull requests, review comments, release notes, and Linear titles, descriptions, comments, and updates.
Apply the same rules to prose inside examples, code blocks, and Markdown or HTML comments.

- Use short sentences, active voice, and concrete words.
- Give one instruction per sentence. Put each condition before the action that depends on it.
- Use the same term for the same concept.
- Aim for 20 words per instruction sentence and 25 words per descriptive sentence.
- Avoid idioms, metaphors, contractions, and unnecessary background.
- Explain the reason or constraint in code comments. Do not repeat the code.
- Preserve technical meaning, identifiers, commands, units, and required legal wording.
- Keep necessary quotations exact and identify them as quotations. Apply the public-repository rules to quotations too.
- Do not claim formal ASD-STE100 compliance without a complete review.

## Public repository

Treat this repository and its associated development records as public, regardless of its current visibility.

- Keep private information from consumers, customers, deployments, and other repositories out of public work.
- Apply this rule to every repository file, including agent instructions, code, comments, tests, fixtures, and examples.
- Apply it to documentation, commit messages, branch names, pull requests, review comments, issues, changesets, and release notes.
- Apply it to logs, screenshots, and other attachments intended for publication.
- Do not include private issue identifiers, URLs, customer names, deployment details, internal paths, or consumer-specific configuration.
- Use public dependency names and public repository references when needed.
- Use synthetic examples. Describe library requirements without naming private consumers.
- Accept consumer-specific context through parameters instead of embedding private values.
- Keep private tracking references in private records. Public records must remain understandable without private context.
- Check the destination repository and all proposed public text before committing, pushing, or opening a pull request.

## Commits and pull requests

- Commit, push, or open pull requests only when requested.
- Follow the repository's commit conventions. Use an imperative summary and explain important reasons in the body.
- Describe the change, verification results, and remaining limitations in pull requests.
- Include the Fallow audit scope, base ref, verdict, and unresolved findings with lint, formatting, type-check, and test results.
- Report failed checks and checks that you could not run.
- Do not rewrite published history unless explicitly requested.
- Keep `CLAUDE.md` as an `@AGENTS.md` import. Keep these instructions complete for a standalone clone.
