# Maintainer Guide

## Development workflow

1. Make your changes in `src/`
2. Add or update tests in `tests/`
3. Verify everything works:
   ```bash
   pnpm run tc      # Type check
   pnpm run lint    # Lint
   pnpm run test    # Run tests
   pnpm run build   # Build
   ```

## Publishing a new version

1. Ensure all checks pass (see above)
2. Update the version:
   ```bash
   npm version <patch|minor|major>
   ```
3. Push the version commit and tag:
   ```bash
   git push && git push --tags
   ```
4. Publish to npm:
   ```bash
   pnpm publish
   ```

## Version guidelines

- **patch**: Bug fixes, documentation updates
- **minor**: New features, non-breaking changes
- **major**: Breaking changes to the API
