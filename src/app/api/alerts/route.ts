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

type AlertPayload = {
  marketId?: string;
  profitThresholdPct?: number | null;
  lossThresholdPct?: number | null;
  triggerOnce?: boolean;
  cooldownMinutes?: number;
  enabled?: boolean;
};

const normalizePct = (value: unknown) => {
  if (value == null) return null;
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  return value;
};

const normalizePositiveInt = (value: unknown) => {
  if (value == null) return null;
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
};

export async function GET(request: NextRequest) {
  try {
    if (!prisma) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const alerts = await prisma.alert.findMany({
      where: { userId: user.id },
      select: {
        marketId: true,
        entryPriceCents: true,
        profitThresholdPct: true,
        lossThresholdPct: true,
        enabled: true,
        triggerOnce: true,
        cooldownMinutes: true,
        lastTriggeredAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      alerts: alerts.map((alert) => ({
        marketId: alert.marketId,
        entryPriceCents: alert.entryPriceCents,
        profitThresholdPct: alert.profitThresholdPct,
        lossThresholdPct: alert.lossThresholdPct,
        enabled: alert.enabled,
        triggerOnce: alert.triggerOnce,
        cooldownMinutes: alert.cooldownMinutes,
        lastTriggeredAt: alert.lastTriggeredAt ? alert.lastTriggeredAt.toISOString() : null,
        createdAt: alert.createdAt.toISOString(),
        updatedAt: alert.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    const missingCode = getMissingTableCode(error);
    if (missingCode) {
      return migrationPendingResponse(missingCode);
    }
    const err = error as { message?: string; code?: string };
    console.error('[alerts] GET error', err);
    return NextResponse.json(
      { error: err?.message ?? 'Unable to load alerts', code: err?.code },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!prisma) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await request.json()) as AlertPayload;
    const marketId = body.marketId?.trim();
    if (!marketId) {
      return NextResponse.json({ error: 'Missing marketId' }, { status: 400 });
    }

    const profitThresholdPct = normalizePct(body.profitThresholdPct);
    const lossThresholdPct = normalizePct(body.lossThresholdPct);
    const triggerOnce = body.triggerOnce !== false;
    const cooldownMinutes = normalizePositiveInt(body.cooldownMinutes) ?? 60;
    const enabled = body.enabled !== false;

    if (profitThresholdPct == null && lossThresholdPct == null) {
      return NextResponse.json(
        { error: 'Set profit or loss threshold' },
        { status: 400 },
      );
    }
    if (
      (profitThresholdPct != null && profitThresholdPct <= 0) ||
      (lossThresholdPct != null && lossThresholdPct <= 0)
    ) {
      return NextResponse.json({ error: 'Thresholds must be > 0' }, { status: 400 });
    }

    const bookmark = await prisma.bookmark.findUnique({
      where: { userId_marketId: { userId: user.id, marketId } },
      select: { initialPrice: true },
    });
    if (!bookmark?.initialPrice || bookmark.initialPrice <= 0) {
      return NextResponse.json(
        { error: 'Bookmark not found for this market' },
        { status: 404 },
      );
    }
    const resolvedEntryPrice = bookmark.initialPrice * 100;

    const existing = await prisma.alert.findUnique({
      where: { userId_marketId: { userId: user.id, marketId } },
      select: {
        profitThresholdPct: true,
        lossThresholdPct: true,
        entryPriceCents: true,
        triggerOnce: true,
        cooldownMinutes: true,
      },
    });

    const resetProfit = existing?.profitThresholdPct !== profitThresholdPct;
    const resetLoss = existing?.lossThresholdPct !== lossThresholdPct;
    const resetEntry = existing?.entryPriceCents !== resolvedEntryPrice;
    const resetConfig =
      existing?.triggerOnce !== triggerOnce || existing?.cooldownMinutes !== cooldownMinutes;

    await prisma.alert.upsert({
      where: { userId_marketId: { userId: user.id, marketId } },
      create: {
        userId: user.id,
        marketId,
        entryPriceCents: resolvedEntryPrice,
        profitThresholdPct,
        lossThresholdPct,
        enabled,
        triggerOnce,
        cooldownMinutes,
      },
      update: {
        entryPriceCents: resolvedEntryPrice,
        profitThresholdPct,
        lossThresholdPct,
        enabled,
        triggerOnce,
        cooldownMinutes,
        ...(resetProfit || resetLoss || resetEntry || resetConfig
          ? { lastTriggeredAt: null }
          : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const missingCode = getMissingTableCode(error);
    if (missingCode) {
      return migrationPendingResponse(missingCode);
    }
    const err = error as { message?: string; code?: string };
    console.error('[alerts] POST error', err);
    return NextResponse.json(
      { error: err?.message ?? 'Unable to save alert', code: err?.code },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!prisma) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get('marketId')?.trim();
    if (!marketId) {
      return NextResponse.json({ error: 'Missing marketId' }, { status: 400 });
    }

    await prisma.alert.deleteMany({
      where: { userId: user.id, marketId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const missingCode = getMissingTableCode(error);
    if (missingCode) {
      return migrationPendingResponse(missingCode);
    }
    const err = error as { message?: string; code?: string };
    console.error('[alerts] DELETE error', err);
    return NextResponse.json(
      { error: err?.message ?? 'Unable to delete alert', code: err?.code },
      { status: 500 },
    );
  }
}
