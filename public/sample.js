const now = Date.now();
const fixture = (
  id,
  sport,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  offset,
) => ({
  id,
  sport,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  startTime: now + offset * 60000,
  endTime: now + (offset + 90) * 60000,
});
export const matches = [
  fixture(1, "Football", "Northbridge FC", "Atlas United", 2, 1, -64),
  fixture(2, "Basketball", "Eastside Comets", "Metro Kings", 0, 0, 180),
  fixture(3, "Rugby", "Coastal XV", "Southern Reds", 24, 19, -240),
];
export const commentary = [
  {
    id: 1,
    minute: 12,
    eventType: "Goal · Atlas United",
    message: "Atlas open the scoring with a low finish inside the far post.",
  },
  {
    id: 2,
    minute: 38,
    eventType: "Equaliser · Northbridge FC",
    message:
      "A curling free kick draws Northbridge level just before the break.",
  },
  {
    id: 3,
    minute: 64,
    eventType: "Goal · Northbridge FC",
    message:
      "A first-time strike from the edge of the box puts the home side ahead.",
  },
];
