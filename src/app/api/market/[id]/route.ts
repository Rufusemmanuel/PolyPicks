import { NextResponse } from 'next/server';
import { getMarketDetailsPayload } from '@/lib/polymarket/api';
import {
  consumeRateLimitSignal,
  findFixtureMatch,
  getHeadToHead,
  getRecentMatches,
  getStandings,
  getTeamDetails,
  isAmericanLeagueMarket,
  isFootballDataConfigured,
  parseMatchupFromTitle,
  parseSingleTeamWinFromTitle,
  resolveOpponentFromFixtures,
  resolveCompetitionCandidates,
  resolveCompetitionCode,
  TOP_COMPETITION_CODES,
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
    let sportsMeta: MarketDetailsResponse['sportsMeta'] = {
      enabled: false,
      reason: 'not_soccer',
    };
    const matchup = parseMatchupFromTitle(market.title);
    const singleTeam = matchup ? null : parseSingleTeamWinFromTitle(market.title);
    const slugDate = market.slug.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    const titleDate =
      singleTeam?.date ?? market.title.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    const closesAtDate = new Date(market.closesAt);
    const fallbackDate = Number.isNaN(closesAtDate.getTime())
      ? null
      : closesAtDate.toISOString().slice(0, 10);
    const matchDate = titleDate ?? slugDate ?? fallbackDate;
    const isAmerican = isAmericanLeagueMarket(market.title, market.slug);
    const isSports = market.categoryResolved === 'Sports';
    const hasTeams = Boolean(matchup || singleTeam);
    const hasDate = Boolean(matchDate);
    const canAttemptSoccer = isSports && !isAmerican && hasDate && hasTeams;

    if (!isSports) {
      sportsMeta = { enabled: false, reason: 'not_soccer' };
    } else if (isAmerican) {
      sportsMeta = { enabled: false, reason: 'not_soccer' };
    } else if (!hasTeams) {
      sportsMeta = { enabled: false, reason: 'matchup_parse_failed' };
    } else if (!hasDate) {
      sportsMeta = { enabled: false, reason: 'fixture_not_found' };
    } else if (canAttemptSoccer) {
      if (!isFootballDataConfigured()) {
        sportsMeta = { enabled: false, reason: 'missing_api_key' };
      } else {
        consumeRateLimitSignal();
        const competitionCandidates = resolveCompetitionCandidates(market.slug, market.title);
        const competitionCode = resolveCompetitionCode(market.slug);
        try {
          const tryFindFixture = async (code?: string | null) => {
            if (matchup) {
              return findFixtureMatch(matchDate!, matchup.teamA, matchup.teamB, code);
            }
            if (!code) return null;
            return resolveOpponentFromFixtures(singleTeam!.team, matchDate!, [code]);
          };

          let fixture: Awaited<ReturnType<typeof tryFindFixture>> | null = null;
          const orderedCandidates = [
            ...competitionCandidates,
            ...(competitionCode ? [competitionCode] : []),
          ];
          for (const code of orderedCandidates) {
            fixture = await tryFindFixture(code);
            if (fixture) break;
          }

          if (!fixture) {
            fixture = matchup
              ? null
              : await resolveOpponentFromFixtures(
                  singleTeam!.team,
                  matchDate!,
                  TOP_COMPETITION_CODES,
                );
            if (!fixture) {
              for (const code of TOP_COMPETITION_CODES) {
                fixture = await tryFindFixture(code);
                if (fixture) break;
              }
            }
          }

          if (fixture) {
            const standingsCode = fixture.competitionCode ?? competitionCode;
            const [recentA, recentB, headToHead, detailsA, detailsB, standings] =
              await Promise.all([
                getRecentMatches(fixture.homeTeamId, 5),
                getRecentMatches(fixture.awayTeamId, 5),
                getHeadToHead(fixture.matchId, 5),
                getTeamDetails(fixture.homeTeamId),
                getTeamDetails(fixture.awayTeamId),
                standingsCode ? getStandings(standingsCode) : Promise.resolve(null),
              ]);

            sports = {
              matchup: {
                teamA: fixture.homeTeamName,
                teamB: fixture.awayTeamName,
                teamAId: fixture.homeTeamId,
                teamBId: fixture.awayTeamId,
                crestA: detailsA?.crest ?? null,
                crestB: detailsB?.crest ?? null,
              },
              recentA,
              recentB,
              headToHead,
              standings,
            };
            sportsMeta = { enabled: true };
          } else {
            sportsMeta = consumeRateLimitSignal()
              ? { enabled: false, reason: 'rate_limited' }
              : { enabled: false, reason: 'fixture_not_found' };
          }
        } catch (err) {
          console.warn('[PolyPicks] sports enrichment skipped', err);
          sportsMeta = consumeRateLimitSignal()
            ? { enabled: false, reason: 'rate_limited' }
            : { enabled: false, reason: 'upstream_error' };
        }
      }
    }

    const payload: MarketDetailsResponse = {
      ...market,
      ...(sports ? { sports } : {}),
      sportsMeta,
    };

    return NextResponse.json<MarketDetailsResponse>(payload, {
      headers: { 'Cache-Control': 's-maxage=10, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.error('[PolyPicks] /api/market/[id] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
