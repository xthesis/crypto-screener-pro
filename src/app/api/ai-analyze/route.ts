import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { prompt, maxTokens = 600 } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    // Use environment variable or hardcoded key
    const apiKey = process.env.ANTHROPIC_API_KEY || '';

    if (!apiKey) {
      return NextResponse.json({
        content: JSON.stringify({
          summary: 'AI analysis unavailable — ANTHROPIC_API_KEY not configured.',
          strengths: [],
          weaknesses: [],
          actionItems: [],
        }),
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      return NextResponse.json({
        content: JSON.stringify({
          summary: 'AI analysis temporarily unavailable. Review the data tables below.',
          strengths: [],
          weaknesses: [],
          actionItems: [],
        }),
      });
    }

    const data = await response.json();
    const text = data.content
      ?.map((block: any) => (block.type === 'text' ? block.text : ''))
      .filter(Boolean)
      .join('\n') || '';

    return NextResponse.json({ content: text });
  } catch (error) {
    console.error('AI analyze error:', error);
    return NextResponse.json({
      content: JSON.stringify({
        summary: 'Error running AI analysis.',
        strengths: [],
        weaknesses: [],
        actionItems: [],
      }),
    });
  }
}
