import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const redis = Redis.fromEnv()
const KEY = 'gymapp:v3'
const LEGACY_KEY = 'gym_sessions'

export async function GET(request) {
  try {
    const legacy = new URL(request.url).searchParams.get('legacy')
    const data = await redis.get(legacy ? LEGACY_KEY : KEY)
    return NextResponse.json({ data: data ?? null })
  } catch (err) {
    console.error('Redis read error:', err)
    return NextResponse.json({ error: 'read failed' }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    const { data } = await request.json()
    if (!data || data.version !== 3 || !Array.isArray(data.logs)) {
      return NextResponse.json({ error: 'invalid state' }, { status: 400 })
    }
    await redis.set(KEY, data)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Redis write error:', err)
    return NextResponse.json({ error: 'write failed' }, { status: 500 })
  }
}
