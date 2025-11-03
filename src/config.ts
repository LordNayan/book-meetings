import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  port: z.string().default('3000'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  databaseUrl: z.string().default('postgresql://postgres:postgres@localhost:5432/recurring_meetings'),
});

const parseConfig = () => {
  const config = {
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
  };

  const result = configSchema.safeParse(config);

  if (!result.success) {
    console.error('Configuration validation failed:', result.error.format());
    process.exit(1);
  }

  return result.data;
};

export const config = parseConfig();
