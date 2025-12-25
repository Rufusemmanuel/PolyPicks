import assert from 'node:assert/strict';
import {
  isAmericanLeagueMarket,
  isSoccerMarket,
  parseMatchupFromTitle,
  parseSingleTeamWinFromTitle,
  resolveCompetitionCandidates,
} from '../src/lib/sports/providers/football-data';

const cases = [
  {
    title: 'Cowboys vs. Commanders',
    expected: { teamA: 'Cowboys', teamB: 'Commanders' },
  },
  {
    title: 'Manchester United FC vs. Newcastle United FC: O/U 1.5',
    expected: { teamA: 'Manchester United FC', teamB: 'Newcastle United FC' },
  },
  {
    title: 'Will Al Hazem SC win on 2025-12-25?',
    expected: null,
  },
  {
    title: 'Team A vs. Team B (International Friendly)',
    expected: { teamA: 'Team A', teamB: 'Team B' },
  },
];

for (const testCase of cases) {
  const actual = parseMatchupFromTitle(testCase.title);
  if (testCase.expected === null) {
    assert.equal(actual, null, testCase.title);
  } else {
    assert.ok(actual, testCase.title);
    assert.equal(actual?.teamA, testCase.expected.teamA, testCase.title);
    assert.equal(actual?.teamB, testCase.expected.teamB, testCase.title);
  }
}

const singleTeamCases = [
  {
    title: 'Will Nottingham Forest FC win on 2025-12-27?',
    expected: { team: 'Nottingham Forest FC', date: '2025-12-27' },
  },
  {
    title: 'Will Nottm Forest win?',
    expected: { team: 'Nottm Forest', date: null },
  },
  {
    title: 'Will Manchester United FC win on 2025-12-26? O/U 1.5',
    expected: { team: 'Manchester United FC', date: '2025-12-26' },
  },
];

for (const testCase of singleTeamCases) {
  const actual = parseSingleTeamWinFromTitle(testCase.title);
  assert.ok(actual, testCase.title);
  assert.equal(actual?.team, testCase.expected.team, testCase.title);
  assert.equal(actual?.date, testCase.expected.date, testCase.title);
}

const competitionCases = [
  {
    title: 'Torino vs. Cagliari',
    slug: 'sea-tor-cag-2025-12-27-cag',
    expectSoccer: true,
    expectedCodes: ['SA'],
  },
  {
    title: 'Real Madrid vs. Valencia',
    slug: 'la-liga-rma-val-2025-12-20',
    expectSoccer: true,
    expectedCodes: ['PD'],
  },
  {
    title: 'PSG vs. Lyon',
    slug: 'ligue-1-psg-lyo-2025-12-18',
    expectSoccer: true,
    expectedCodes: ['FL1'],
  },
  {
    title: 'Bayern vs. Dortmund',
    slug: 'bundesliga-fcb-bvb-2025-12-19',
    expectSoccer: true,
    expectedCodes: ['BL1'],
  },
];

for (const testCase of competitionCases) {
  const soccer = isSoccerMarket(testCase.title, testCase.slug, []);
  assert.equal(soccer, testCase.expectSoccer, `${testCase.title} soccer gate`);
  const candidates = resolveCompetitionCandidates(testCase.slug, testCase.title);
  for (const expected of testCase.expectedCodes) {
    assert.ok(
      candidates.includes(expected),
      `${testCase.title} expected ${expected} in ${candidates.join(', ')}`,
    );
  }
}

const soccerGateCases = [
  {
    title: 'Manchester United FC vs. Newcastle United FC: O/U 1.5',
    slug: 'epl-mun-new-2025-12-26-total-1pt5',
    expectSoccer: true,
    expectAmerican: false,
  },
  {
    title: 'Dallas Cowboys vs. Washington Commanders',
    slug: 'nfl-dal-was-2025-12-25',
    expectSoccer: false,
    expectAmerican: true,
  },
];

for (const testCase of soccerGateCases) {
  const soccer = isSoccerMarket(testCase.title, testCase.slug, []);
  const american = isAmericanLeagueMarket(testCase.title, testCase.slug);
  assert.equal(soccer, testCase.expectSoccer, `${testCase.title} soccer gate`);
  assert.equal(american, testCase.expectAmerican, `${testCase.title} american gate`);
}

console.log(
  `Matchup parse harness passed (${cases.length + singleTeamCases.length + competitionCases.length + soccerGateCases.length} cases).`,
);
