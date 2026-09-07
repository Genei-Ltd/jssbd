# Maintainer guide

## Verify changes

Run commands from this package's root:

```sh
pnpm install --frozen-lockfile
pnpm run check
python3 -B scripts/export-upstream-tests.py --check
```

`check` runs typechecking, lint, formatting, all package tests, and both builds.
The fixture check requires the pinned pySBD checkout described in
[tests/README.md](tests/README.md). Python is only needed to regenerate or audit
fixtures, not to run the package or its Vitest suite.

## Upstream reference

The port targets pySBD 0.3.4, commit
`5905f13be4fc95f407b98392e0ec303617a33d86`. Language rules and abbreviation data
are translated from that release. PDF-specific code is excluded. Keep upstream
attribution in `LICENSE` and the test source inventory when updating the port.

The package was scaffolded with `@coloop-ai/create-package@0.3.0` and
`Genei-Ltd/ts-package-template` revision
`8a4307b8bd22f51f11d3b6567776ecef4a39772b`.

## Prepare a release

1. Run the checks above.
2. Update the version when needed with `pnpm version patch`, `minor`, or `major`.
3. Run `pnpm pack --pack-destination .context/artifacts` and inspect its contents.
   Verify ESM and CommonJS imports and TypeScript resolution from the packed package.
4. Commit and tag the release, then push to the configured repository.
5. Run `pnpm publish --access public` when ready. The `prepublishOnly` script runs
   `check` again.

Only `dist/`, the package metadata, README, and LICENSE are distributed. There
are no runtime dependencies. Node.js 18 is the minimum supported runtime;
maintainer tools may require a newer Node.js release.
