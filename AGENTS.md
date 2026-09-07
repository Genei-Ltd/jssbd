# Project Guidelines

---

## Package Management with pnpm

This project uses **pnpm** as the JavaScript package manager. Always use pnpm instead of npm, Bun, or Yarn.

### Core Commands

- **Install dependencies**: `pnpm install` / `pnpm add` / `pnpm remove`
- **Run scripts**: `pnpm run <script>`

### Supply-chain policy

New dependency versions must be at least seven days old before pnpm will install them (`minimumReleaseAge` in `pnpm-workspace.yaml`). If a just-released version fails to resolve, this is why. Do not work around it.

### Key Scripts

- `pnpm run build` — Build the package (dual ESM/CJS via tsdown)
- `pnpm run tc` — Type-check without emitting
- `pnpm run lint` — Run ESLint
- `pnpm run test` — Run tests with Vitest
- `pnpm run format` — Check formatting with Prettier
- `pnpm run format:write` — Auto-fix formatting

## Code Conventions

- Use `type` keyword for type definitions, not `interface`
- Use `import type` for type-only imports
- Do not use TypeScript enums; prefer union literal types
- Prefix unused parameters with `_`
- Follow Prettier formatting (no semicolons, single quotes, trailing commas)
