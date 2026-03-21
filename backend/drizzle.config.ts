import { defineConfig } from 'drizzle-kit';

/** Schema 对照与可选 `drizzle-kit` 命令；**正式迁移以 `migrations/*.sql` + wrangler 为准** */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations-drizzle-snapshot',
  dialect: 'sqlite',
});
