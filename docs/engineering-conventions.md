# Engineering Conventions

## Environment Variables

- Use `UPPER_SNAKE_CASE` for all env vars.
- Service-specific env files live inside each workspace package.
- Required shared keys: `NODE_ENV`, `SUI_NETWORK`, `APP_NAME`.

## Naming

- NestJS modules, controllers, and services follow `kebab-case` filenames with explicit suffixes such as `health.controller.ts`.
- DTOs use `PascalCase` class names and `.dto.ts` filenames when introduced.
- Mongoose document interfaces and schema factories use `PascalCase` names.
- Shared constants use `UPPER_SNAKE_CASE`.

## Logging

- Every inbound request must carry or receive an `x-correlation-id`.
- Error payloads must be JSON and include `correlationId`, `timestamp`, and `path`.
- Do not log secrets, signatures, session tokens, or raw wallet payloads in full.
