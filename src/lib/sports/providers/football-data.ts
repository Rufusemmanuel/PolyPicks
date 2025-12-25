type TeamSearchResponse = {
  teams: {
    id: number;
    name: string;
    shortName?: string;
    tla?: string;
    crest?: string;
    runningCompetitions?: { id: number; name: string }[];
  }[];
};

type TeamDetailsResponse = {
  id: number;
  name: string;
  shortName?: string;
  tla?: string;
  crest?: string;
  runningCompetitions?: { id: number; name: string }[];
};

type MatchResponse = {
  matches: {
    utcDate: string;
    competition?: { name?: string };
    score?: { fullTime?: { home?: number | null; away?: number | null } };
    homeTeam: { id: number; name: string };
    awayTeam: { id: number; name: string };
  }[];
};

type StandingsResponse = {
  competition?: { name?: string };
  standings?: {
    type?: string;
    table?: {
      position?: number;
      team?: { name?: string };
      playedGames?: number;
      points?: number;
    }[];
  }[];
};

export type FootballTeam = {
  id: number;
  name: string;
  shortName?: string;
  tla?: string;
  crest?: string;
  runningCompetitions?: { id: number; name: string }[];
};

export type FootballMatch = {
  utcDate: string;
  competition?: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
};

export type FootballStandings = {
  competition: string;
  table: {
    position: number;
    team: string;
    playedGames: number;
    points: number;
  }[];
};

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const CACHE_REVALIDATE_SECONDS = 6 * 60 * 60;

type QueryParams = Record<string, string | number | undefined>;

const buildQuery = (params: QueryParams): string => {
  const entries = Object.entries(params).filter(([, value]) => value != null);
  if (!entries.length) return '';
  const search = new URLSearchParams();
  for (const [key, value] of entries) {
    search.set(key, String(value));
  }
  return `?${search.toString()}`;
};

const fetchFootballData = async <T>(
  path: string,
  params: QueryParams = {},
): Promise<T | null> => {
  if (!API_KEY) return null;
  try {
    const url = `${FOOTBALL_DATA_BASE}${path}${buildQuery(params)}`;
    const res = await fetch(url, {
      headers: {
        'X-Auth-Token': API_KEY,
      },
      next: { revalidate: CACHE_REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeTeamName = (name: string) => {
  const tokens = normalizeName(name)
    .split(' ')
    .filter((token) => token && !['fc', 'sc', 'cf', 'afc', 'the', 'club'].includes(token));
  return tokens.join(' ').trim();
};

const scoreTeamMatch = (team: TeamSearchResponse['teams'][number], query: string): number => {
  const normalizedQuery = normalizeTeamName(query);
  const normalizedName = normalizeTeamName(team.name);
  if (normalizedName === normalizedQuery) return 100;
  if (team.shortName && normalizeTeamName(team.shortName) === normalizedQuery) return 95;
  if (team.tla && team.tla.toLowerCase() === normalizedQuery.replace(/ /g, '')) return 90;

  const queryTokens = new Set(normalizedQuery.split(' ').filter(Boolean));
  const nameTokens = new Set(normalizedName.split(' ').filter(Boolean));
  if (!queryTokens.size || !nameTokens.size) return 0;
  let overlap = 0;
  for (const token of queryTokens) {
    if (nameTokens.has(token)) overlap += 1;
  }
  return Math.round((overlap / Math.max(queryTokens.size, nameTokens.size)) * 60);
};

const bestTeamMatch = (
  teams: TeamSearchResponse['teams'],
  query: string,
  threshold = 60,
) => {
  let best: TeamSearchResponse['teams'][number] | null = null;
  let bestScore = 0;
  for (const team of teams) {
    const score = scoreTeamMatch(team, query);
    if (score > bestScore) {
      best = team;
      bestScore = score;
    }
  }
  if (!best || bestScore < threshold) return null;
  return best;
};

export const parseMatchupFromTitle = (
  title: string,
): { teamA: string; teamB: string } | null => {
  if (!title || /^will\s/i.test(title)) return null;
  const cleaned = title
    .split(':')[0]
    ?.split(' - ')[0]
    ?.split('(')[0]
    ?.replace(/\bO\/U\b.*$/i, '')
    ?.replace(/\bOver\/Under\b.*$/i, '')
    ?.replace(/\bTotals?\b.*$/i, '')
    ?.replace(/\bSpread\b.*$/i, '')
    ?.trim();
  if (!cleaned) return null;

  const match = cleaned.match(/(.+?)\s+(?:vs\.?|v|@)\s+(.+)/i);
  if (!match) return null;
  const teamA = match[1]?.trim().replace(/[?)]$/, '');
  const teamB = match[2]?.trim().replace(/[?)]$/, '');
  if (!teamA || !teamB) return null;
  if (teamA.length < 2 || teamB.length < 2) return null;
  return { teamA, teamB };
};

const pickBestTeam = (teams: TeamSearchResponse['teams'], query: string) =>
  bestTeamMatch(teams, query);

export const resolveTeamIdFromSearch = async (
  name: string,
): Promise<FootballTeam | null> => searchTeamByName(name);

export const searchTeamByName = async (name: string): Promise<FootballTeam | null> => {
  const response = await fetchFootballData<TeamSearchResponse>('/teams', { name });
  if (!response?.teams?.length) return null;
  const match = pickBestTeam(response.teams, name);
  if (!match) return null;
  return {
    id: match.id,
    name: match.name,
    shortName: match.shortName,
    tla: match.tla,
    crest: match.crest,
    runningCompetitions: match.runningCompetitions,
  };
};

export const getTeamDetails = async (teamId: number): Promise<FootballTeam | null> => {
  const response = await fetchFootballData<TeamDetailsResponse>(`/teams/${teamId}`);
  if (!response) return null;
  return {
    id: response.id,
    name: response.name,
    shortName: response.shortName,
    tla: response.tla,
    crest: response.crest,
    runningCompetitions: response.runningCompetitions,
  };
};

const toFootballMatch = (match: MatchResponse['matches'][number]): FootballMatch => ({
  utcDate: match.utcDate,
  competition: match.competition?.name ?? null,
  homeTeam: match.homeTeam.name,
  awayTeam: match.awayTeam.name,
  homeScore: match.score?.fullTime?.home ?? null,
  awayScore: match.score?.fullTime?.away ?? null,
});

export const getRecentMatches = async (
  teamId: number,
  limit = 5,
): Promise<FootballMatch[]> => {
  const response = await fetchFootballData<MatchResponse>(`/teams/${teamId}/matches`, {
    status: 'FINISHED',
    limit,
  });
  if (!response?.matches) return [];
  return response.matches.map(toFootballMatch);
};

export const getHeadToHead = async (
  teamAId: number,
  teamBId: number,
  limit = 5,
): Promise<FootballMatch[]> => {
  const response = await fetchFootballData<MatchResponse>(`/teams/${teamAId}/matches`, {
    status: 'FINISHED',
    limit: 40,
  });
  if (!response?.matches) return [];
  const filtered = response.matches.filter(
    (match) => match.homeTeam.id === teamBId || match.awayTeam.id === teamBId,
  );
  return filtered.slice(0, limit).map(toFootballMatch);
};

export const getStandings = async (
  competitionId: number,
): Promise<FootballStandings | null> => {
  const response = await fetchFootballData<StandingsResponse>(`/competitions/${competitionId}/standings`);
  if (!response) return null;
  const tables = response.standings ?? [];
  const table = tables.find((standing) => standing.type === 'TOTAL') ?? tables[0];
  const rows = table?.table ?? [];
  if (!rows.length) return null;

  return {
    competition: response.competition?.name ?? 'League standings',
    table: rows.map((row) => ({
      position: row.position ?? 0,
      team: row.team?.name ?? 'Unknown',
      playedGames: row.playedGames ?? 0,
      points: row.points ?? 0,
    })),
  };
};

export const isSoccerMarket = (title: string, slug: string, tags?: string[]) => {
  const lowerSlug = slug.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const lowerTags = (tags ?? []).map((tag) => tag.toLowerCase());
  const slugHit = [
    'epl',
    'premier-league',
    'ucl',
    'champions-league',
    'bundesliga',
    'la-liga',
    'serie-a',
    'ligue-1',
    'soccer',
    'football',
  ].some((token) => lowerSlug.includes(token));
  const tagHit = lowerTags.some((tag) => tag.includes('soccer') || tag.includes('football'));
  return slugHit || tagHit || lowerTitle.includes('football') || lowerTitle.includes('soccer');
};

export const isAmericanLeagueMarket = (title: string, slug: string) => {
  const lowerSlug = slug.toLowerCase();
  const lowerTitle = title.toLowerCase();
  if (
    lowerSlug.startsWith('nfl-') ||
    lowerSlug.startsWith('nba-') ||
    lowerSlug.startsWith('mlb-') ||
    lowerSlug.startsWith('nhl-')
  ) {
    return true;
  }
  return (
    /\bnfl\b/i.test(lowerTitle) ||
    /\bnba\b/i.test(lowerTitle) ||
    /\bmlb\b/i.test(lowerTitle) ||
    /\bnhl\b/i.test(lowerTitle)
  );
};
