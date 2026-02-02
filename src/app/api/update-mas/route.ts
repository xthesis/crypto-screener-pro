// src/app/api/update-mas/route.ts
import { NextResponse } from 'next/server';
import { updateAllMAs } from '@/lib/ma-calculator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

export async function GET(req: Request) {
  // Simple auth check - use a secret token
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await updateAllMAs();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update MAs' },
      { status: 500 }
    );
  }
}

// Also support POST for flexibility
export async function POST(req: Request) {
  return GET(req);
}
