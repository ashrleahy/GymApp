import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const { messages, system, maxTokens = 800 } = await request.json()

    if (!messages || !system) {
      return NextResponse.json({ error: 'Missing messages or system' }, { status: 400 })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system,
        messages,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Anthropic error:', data)
      return NextResponse.json({ error: data.error?.message || 'Anthropic API error' }, { status: response.status })
    }

    const text = data.content?.map(b => b.text || '').join('') || ''
    return NextResponse.json({ text })
  } catch (err) {
    console.error('AI proxy error:', err)
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }
}
