import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'

const redis = Redis.fromEnv()
const KV_KEY = 'gym_sessions'

export async function GET() {
  try {
    const sessions = await redis.get(KV_KEY)
    return NextResponse.json({ sessions: sessions || [] })
  } catch (err) {
    console.error('Redis read error:', err)
    return NextResponse.json({ error: 'Failed to read sessions' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const { sessions } = await request.json()
    if (!Array.isArray(sessions)) {
      return NextResponse.json({ error: 'Invalid sessions data' }, { status: 400 })
    }
    await redis.set(KV_KEY, sessions)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Redis write error:', err)
    return NextResponse.json({ error: 'Failed to write sessions' }, { status: 500 })
  }
}
