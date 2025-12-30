import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/auth';

type BookmarkPayload = {
  marketId?: string;
  entryPrice?: number;
  title?: string;
  category?: string;
  marketUrl?: string;
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
      where: { userId: user.id, removedAt: null },
      select: {
        marketId: true,
        createdAt: true,
        entryPrice: true,
        title: true,
        category: true,
        marketUrl: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      bookmarks: bookmarks.map((b) => ({
        marketId: b.marketId,
        createdAt: b.createdAt.toISOString(),
        entryPrice: b.entryPrice,
        title: b.title,
        category: b.category,
        marketUrl: b.marketUrl,
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
    const entryPrice =
      typeof body.entryPrice === 'number' && Number.isFinite(body.entryPrice)
        ? body.entryPrice
        : null;
    const title = body.title?.trim() || null;
    const category = body.category?.trim() || null;
    const marketUrl = body.marketUrl?.trim() || null;
    if (!marketId) {
      return NextResponse.json({ error: 'marketId is required' }, { status: 400 });
    }
    if (entryPrice == null) {
      return NextResponse.json({ error: 'entryPrice is required' }, { status: 400 });
    }

    const updateData = {
      entryPrice,
      createdAt: new Date(),
      removedAt: null,
      ...(title ? { title } : {}),
      ...(category ? { category } : {}),
      ...(marketUrl ? { marketUrl } : {}),
    };
    await prisma.bookmark.upsert({
      where: {
        userId_marketId: {
          userId: user.id,
          marketId,
        },
      },
      create: {
        userId: user.id,
        marketId,
        entryPrice,
        ...(title ? { title } : {}),
        ...(category ? { category } : {}),
        ...(marketUrl ? { marketUrl } : {}),
      },
      update: updateData,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[bookmarks] POST error', error);
    return NextResponse.json({ error: 'Unable to add bookmark' }, { status: 500 });
  }
}
