import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const getMissingTableCode = (error: unknown) => {
  const err = error as { code?: string; message?: string };
  if (err?.code === 'P2021') return err.code;
  if (/does not exist/i.test(err?.message ?? '')) return err?.code ?? 'P2021';
  return null;
};

const migrationPendingResponse = (code?: string) =>
  NextResponse.json(
    {
      error: 'Database migration pending. Redeploy to apply migrations.',
      ...(code ? { code } : {}),
    },
    { status: 503 },
  );

type ReadPayload = {
  ids?: string[];
  all?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    if (!prisma) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as ReadPayload;
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const markAll = body.all === true || ids.length === 0;

    if (markAll) {
      await prisma.notification.updateMany({
        where: { userId: user.id, readAt: null },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }

    await prisma.notification.updateMany({
      where: { userId: user.id, id: { in: ids } },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const missingCode = getMissingTableCode(error);
    if (missingCode) {
      return migrationPendingResponse(missingCode);
    }
    const err = error as { message?: string; code?: string };
    console.error('[notifications] POST read error', err);
    return NextResponse.json(
      { error: err?.message ?? 'Unable to update notifications', code: err?.code },
      { status: 500 },
    );
  }
}
