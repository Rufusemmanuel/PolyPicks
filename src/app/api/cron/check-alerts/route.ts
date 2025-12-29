import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getMarketDetails } from '@/lib/polymarket/api';
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

const CRON_SECRET = process.env.CRON_SECRET;

const isAuthorized = (request: NextRequest) => {
  const auth = request.headers.get('authorization');
  if (CRON_SECRET && auth === `Bearer ${CRON_SECRET}`) return true;
  return false;
};

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user && !isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!prisma) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const alerts = await prisma.alert.findMany({
      where: { enabled: true },
      select: {
        id: true,
        userId: true,
        marketId: true,
        entryPriceCents: true,
        profitThresholdPct: true,
        lossThresholdPct: true,
        triggerOnce: true,
        cooldownMinutes: true,
        lastTriggeredAt: true,
      },
    });

    const marketIds = Array.from(new Set(alerts.map((alert) => alert.marketId)));
    const marketMap = new Map<string, Awaited<ReturnType<typeof getMarketDetails>>>();

    await Promise.all(
      marketIds.map(async (marketId) => {
        try {
          const market = await getMarketDetails(marketId);
          marketMap.set(marketId, market);
        } catch (error) {
          marketMap.set(marketId, null);
        }
      }),
    );

    let triggered = 0;
    const now = new Date();

    for (const alert of alerts) {
      if (alert.profitThresholdPct == null && alert.lossThresholdPct == null) continue;
      if (!alert.entryPriceCents || alert.entryPriceCents <= 0) continue;

      const market = marketMap.get(alert.marketId) ?? null;
      if (!market) continue;

      const currentCents = market.price.price * 100;
      const pct =
        ((currentCents - alert.entryPriceCents) / alert.entryPriceCents) * 100;

      const cooldownMs = alert.cooldownMinutes * 60 * 1000;
      if (
        alert.lastTriggeredAt &&
        now.getTime() - alert.lastTriggeredAt.getTime() < cooldownMs
      ) {
        continue;
      }

      const profitHit =
        alert.profitThresholdPct != null && pct >= alert.profitThresholdPct;
      const lossHit =
        alert.lossThresholdPct != null && pct <= -alert.lossThresholdPct;

      if (!profitHit && !lossHit) continue;

      const direction = pct >= 0 ? '+' : '';
      const body = `${market.title} moved ${direction}${pct.toFixed(
        1,
      )}% since you bookmarked (${alert.entryPriceCents.toFixed(
        1,
      )}c  ${currentCents.toFixed(1)}c).`;

      await prisma.notification.create({
        data: {
          userId: alert.userId,
          marketId: alert.marketId,
          type: 'ALERT_TRIGGERED',
          title: 'Alert triggered',
          body,
        },
      });

      await prisma.alert.update({
        where: { id: alert.id },
        data: {
          lastTriggeredAt: now,
          ...(alert.triggerOnce ? { enabled: false } : {}),
        },
      });

      triggered += 1;
    }

    return NextResponse.json({
      checkedAlerts: alerts.length,
      triggered,
    });
  } catch (error) {
    const missingCode = getMissingTableCode(error);
    if (missingCode) {
      return migrationPendingResponse(missingCode);
    }
    const err = error as { message?: string; code?: string };
    console.error('[cron/check-alerts] error', err);
    return NextResponse.json(
      { error: err?.message ?? 'Unable to check alerts', code: err?.code },
      { status: 500 },
    );
  }
}
