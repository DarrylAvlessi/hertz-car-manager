import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DB_DRIVER: z.enum(["memory", "mysql"]).default("memory"),
  DB_HOST: z.string().default("127.0.0.1"),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default("hertz"),
  DB_PASSWORD: z.string().default("hertz"),
  DB_NAME: z.string().default("hertz_benin"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET doit faire au moins 16 caractères"),
  JWT_EXPIRES_IN: z.enum(["1h", "8h", "12h", "24h", "7d"]).default("12h"),
  CORS_ORIGIN: z.string().default("http://localhost:8443"),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error("Configuration invalide :", parsed.error.flatten().fieldErrors)
    process.exit(1)
  }
  return parsed.data
}
