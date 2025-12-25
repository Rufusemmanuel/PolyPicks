import { NextResponse } from 'next/server';
import { getMarketDetailsPayload } from '@/lib/polymarket/api';
import {
  getHeadToHead,
  getRecentMatches,
  getStandings,
  getTeamDetails,
  isAmericanLeagueMarket,
  isSoccerMarket,
  parseMatchupFromTitle,
  searchTeamByName,
} from '@/lib/sports/providers/football-data';
import type { MarketDetailsResponse, SportsEnrichment } from '@/lib/polymarket/types';

type Params = { params: { id: string } };

export async function GET(_: Request, { params }: Params) {
  try {
    const market = await getMarketDetailsPayload(params.id);
    if (!market) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    let sports: SportsEnrichment | undefined;
    if (
      market.categoryResolved === 'Sports' &&
      isSoccerMarket(market.title, market.slug, market.tags) &&
      !isAmericanLeagueMarket(market.title, market.slug)
    ) {
      const matchup = parseMatchupFromTitle(market.title);
      if (matchup) {
        try {
          const [teamA, teamB] = await Promise.all([
            searchTeamByName(matchup.teamA),
            searchTeamByName(matchup.teamB),
          ]);

          if (teamA && teamB) {
            const [recentA, recentB, headToHead, detailsA, detailsB] = await Promise.all([
              getRecentMatches(teamA.id, 5),
              getRecentMatches(teamB.id, 5),
              getHeadToHead(teamA.id, teamB.id, 5),
              getTeamDetails(teamA.id),
              getTeamDetails(teamB.id),
            ]);

            const compsA = detailsA?.runningCompetitions ?? [];
            const compsB = detailsB?.runningCompetitions ?? [];
            const shared = compsA.find((comp) =>
              compsB.some((other) => other.id === comp.id),
            );
            const standings = shared ? await getStandings(shared.id) : null;

            sports = {
              matchup: {
                teamA: teamA.name,
                teamB: teamB.name,
                teamAId: teamA.id,
                teamBId: teamB.id,
                crestA: teamA.crest ?? null,
                crestB: teamB.crest ?? null,
              },
              recentA,
              recentB,
              headToHead,
              standings,
            };
          }
        } catch (err) {
          console.warn('[PolyPicks] sports enrichment skipped', err);
        }
      }
    }

    const payload: MarketDetailsResponse = {
      ...market,
      ...(sports ? { sports } : {}),
    };

    return NextResponse.json<MarketDetailsResponse>(payload, {
      headers: { 'Cache-Control': 's-maxage=10, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.error('[PolyPicks] /api/market/[id] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
