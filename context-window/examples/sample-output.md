# Sample Output

This shows what context-window output looks like for a typical project.

## Command

```bash
cw compress ./my-project --max-tokens 8000 --strategy balanced
```

## Output

```markdown
# Compression Stats

| Metric | Value |
|--------|-------|
| Files | 12 / 45 |
| Lines | 890 / 4,567 |
| Tokens | 7.8K / 38.2K |
| Compression | 79.6% reduction |
| Strategy | balanced |
| Time | 234ms |

---

## src/index.ts

```typescript
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDatabase } from './database.js';

export async function main() {
  const config = await loadConfig();
  const db = await connectDatabase(config.database);
  const app = createApp({ config, db });

  await app.listen(config.port);
  console.log(`Server running on port ${config.port}`);
}

main().catch(console.error);
```

## src/app.ts (signatures)

```typescript
// Imports
import { Router } from './router.js'
import { authMiddleware } from './middleware/auth.js'
import { errorHandler } from './middleware/error.js'

export function createApp(options: AppOptions): App
export function registerRoutes(app: App, router: Router): void
export function setupMiddleware(app: App): void
```

## src/types/index.ts (types)

```typescript
export interface AppOptions {
  config: Config;
  db: Database;
}

export interface Config {
  port: number;
  database: DatabaseConfig;
  auth: AuthConfig;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: Date;
}

export interface AuthConfig {
  jwtSecret: string;
  tokenExpiry: number;
}
```

## Additional Files (tree only)

```
├── src/
│   ├── middleware/
│   │   ├── auth.ts (45 lines)
│   │   ├── error.ts (32 lines)
│   │   └── logging.ts (28 lines)
│   ├── routes/
│   │   ├── users.ts (120 lines)
│   │   ├── auth.ts (89 lines)
│   │   └── health.ts (15 lines)
│   └── utils/
│       ├── validation.ts (67 lines)
│       └── crypto.ts (43 lines)
├── tests/
│   └── ... (excluded)
└── config/
    └── default.json (25 lines)
```
```

## Compression Breakdown

| File | Level | Original | Compressed | Reason |
|------|-------|----------|------------|--------|
| src/index.ts | 0 (full) | 1,200 | 1,200 | tier 1 - entry point |
| src/app.ts | 2 (signatures) | 2,400 | 320 | tier 2 - high centrality |
| src/types/index.ts | 3 (types) | 800 | 450 | tier 3 - type definitions |
| src/middleware/* | 5 (tree) | 1,500 | 50 | tier 4 - lower priority |
| src/routes/* | 5 (tree) | 3,200 | 60 | tier 4 - lower priority |
