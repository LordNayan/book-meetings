import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  port: z.string().default('3000'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  database: z.object({
    host: z.string().default('localhost'),
    port: z.string().default('5432'),
    name: z.string().default('recurring_meetings'),
    user: z.string().default('postgres'),
    password: z.string().default('postgres'),
  }),
});

const parseConfig = () => {
  const config = {
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    database: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      name: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    },
  };

  const result = configSchema.safeParse(config);

  if (!result.success) {
    console.error('Configuration validation failed:', result.error.format());
    process.exit(1);
  }

  return result.data;
};

export const config = parseConfig();
