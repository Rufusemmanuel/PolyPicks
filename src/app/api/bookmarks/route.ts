import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/auth';

type BookmarkPayload = {
  marketId?: string;
  initialPrice?: number;
};

export async function GET(request: NextRequest) {
  try {
    if (!prisma) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bookmarks = await prisma.bookmark.findMany({
      where: { userId: user.id },
      select: { marketId: true, createdAt: true, initialPrice: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      bookmarks: bookmarks.map((b) => ({
        marketId: b.marketId,
        createdAt: b.createdAt.toISOString(),
        initialPrice: b.initialPrice,
      })),
    });
  } catch (error) {
    console.error('[bookmarks] GET error', error);
    return NextResponse.json({ error: 'Unable to load bookmarks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!prisma) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as BookmarkPayload;
    const marketId = body.marketId?.trim();
    const initialPrice =
      typeof body.initialPrice === 'number' && Number.isFinite(body.initialPrice)
        ? body.initialPrice
        : null;
    if (!marketId) {
      return NextResponse.json({ error: 'marketId is required' }, { status: 400 });
    }

    const updateData = initialPrice != null ? { initialPrice } : {};
    await prisma.bookmark.upsert({
      where: {
        userId_marketId: {
          userId: user.id,
          marketId,
        },
      },
      create: { userId: user.id, marketId, ...(initialPrice != null ? { initialPrice } : {}) },
      update: updateData,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[bookmarks] POST error', error);
    return NextResponse.json({ error: 'Unable to add bookmark' }, { status: 500 });
  }
}
