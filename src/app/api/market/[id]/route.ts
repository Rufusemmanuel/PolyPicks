import { NextResponse } from 'next/server';
import { getMarketDetailsPayload } from '@/lib/polymarket/api';
import {
  consumeRateLimitSignal,
  findFixtureMatch,
  findFixtureForSingleTeamWithReason,
  getHeadToHead,
  getRecentMatches,
  getTeamDetails,
  isAmericanLeagueMarket,
  isFootballDataConfigured,
  isLikelyCountryTeam,
  parseMatchupFromTitle,
  parseTeamFromSpreadTitle,
  parseSingleTeamWinFromTitle,
  resolveCompetitionCandidates,
  resolveCompetitionCode,
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
    const singleTeam = matchup
      ? null
      : parseSingleTeamWinFromTitle(market.title) ?? parseTeamFromSpreadTitle(market.title);
    const slugDate = market.slug.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    const singleTeamDate =
      singleTeam &&
      'date' in singleTeam &&
      typeof singleTeam.date === 'string' &&
      singleTeam.date
        ? singleTeam.date
        : null;
    const titleDate =
      singleTeamDate ?? market.title.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
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
    const nationalCompetitionToken =
      /(afcon|acn|world-cup|euro|nations-league|international|qualifiers|intl)/i.test(
        market.slug,
      ) ||
      /(afcon|world cup|euro|nations league|international|qualifiers)/i.test(market.title);

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
        const isCountryTeam =
          Boolean(singleTeam && isLikelyCountryTeam(singleTeam.team)) || nationalCompetitionToken;
        if (!competitionCandidates.length && !competitionCode) {
          sportsMeta = {
            enabled: false,
            reason: 'unsupported_competition',
          };
          const payload: MarketDetailsResponse = {
            ...market,
            sportsMeta,
          };
          return NextResponse.json<MarketDetailsResponse>(payload, {
            headers: { 'Cache-Control': 's-maxage=10, stale-while-revalidate=60' },
          });
        }
        try {
          const orderedCandidates = [
            ...competitionCandidates,
            ...(competitionCode ? [competitionCode] : []),
          ];
          let singleTeamReason: 'fixture_not_found' | 'team_not_found' | null = null;
          let fixtureMatch: Awaited<ReturnType<typeof findFixtureMatch>> | null = null;

          if (matchup) {
            for (const code of orderedCandidates) {
              const resolved = await findFixtureMatch(matchDate!, matchup.teamA, matchup.teamB, code);
              if (resolved) {
                fixtureMatch = resolved;
                break;
              }
            }
          } else {
            for (const code of orderedCandidates) {
              const resolved = await findFixtureForSingleTeamWithReason(
                matchDate!,
                singleTeam!.team,
                code,
              );
              if (resolved.fixture) {
                fixtureMatch = resolved.fixture;
                break;
              }
              singleTeamReason = resolved.reason;
            }
          }

          if (fixtureMatch) {
            const [recentA, recentB, headToHead, detailsA, detailsB] =
              await Promise.all([
                getRecentMatches(fixtureMatch.homeTeamId, 5),
                getRecentMatches(fixtureMatch.awayTeamId, 5),
                getHeadToHead(fixtureMatch.matchId, 5),
                getTeamDetails(fixtureMatch.homeTeamId),
                getTeamDetails(fixtureMatch.awayTeamId),
              ]);

            sports = {
              matchup: {
                teamA: fixtureMatch.homeTeamName,
                teamB: fixtureMatch.awayTeamName,
                teamAId: fixtureMatch.homeTeamId,
                teamBId: fixtureMatch.awayTeamId,
                crestA: detailsA?.crest ?? null,
                crestB: detailsB?.crest ?? null,
              },
              recentA,
              recentB,
              headToHead,
            };
            sportsMeta = { enabled: true };
          } else {
            sportsMeta = consumeRateLimitSignal()
              ? { enabled: false, reason: 'rate_limited' }
              : singleTeamReason === 'team_not_found'
                ? { enabled: false, reason: 'team_not_found' }
                : isCountryTeam
                  ? { enabled: false, reason: 'unsupported_competition' }
                  : { enabled: false, reason: 'fixture_not_found' };
          }
        } catch (err) {
          console.warn('[PolyPicks] sports enrichment skipped', err);
          sportsMeta = consumeRateLimitSignal()
            ? { enabled: false, reason: 'rate_limited' }
            : isCountryTeam
              ? { enabled: false, reason: 'unsupported_competition' }
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
