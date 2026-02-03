// src/app/api/patterns/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = 'https://mzuocbdocvhpffytsvaw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16dW9jYmRvY3ZocGZmeXRzdmF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTc0OTYsImV4cCI6MjA4NTYzMzQ5Nn0.boaEi1_VmDW6NWC998NwJpEvAY899pLIlFTbr0dHgIc';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const signal = searchParams.get('signal'); // bullish, bearish, neutral
    const strength = searchParams.get('strength'); // strong, moderate, weak
    const limit = parseInt(searchParams.get('limit') || '200');

    let url = `${SUPABASE_URL}/rest/v1/pattern_signals?select=*&order=bullish_score.desc,volume_24h.desc&limit=${limit}`;

    if (signal) url += `&signal=eq.${signal}`;
    if (strength) url += `&strength=eq.${strength}`;

    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!res.ok) throw new Error('Failed to fetch patterns');
    const data = await res.json();

    return NextResponse.json({
      signals: data,
      total: data.length,
      generatedAt: data[0]?.scanned_at || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
