import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/auth';

type Params = { params: { marketId: string } };

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    if (!prisma) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const marketId = params.marketId;
    if (!marketId) {
      return NextResponse.json({ error: 'marketId is required' }, { status: 400 });
    }

    await prisma.bookmark.updateMany({
      where: { userId: user.id, marketId, removedAt: null },
      data: { removedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[bookmarks] DELETE error', error);
    return NextResponse.json({ error: 'Unable to remove bookmark' }, { status: 500 });
  }
}
