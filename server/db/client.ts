import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema.js'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function db() {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _db = drizzle(neon(url), { schema })
  }
  return _db
}

export { schema }
