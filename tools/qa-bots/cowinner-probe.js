// Targeted probe for the co-winner / round-win tie bug.
//
// Trivia and Bomber award EVERY tied player a round win (roundWinnerIds + a
// loop). Hot Take, Two Truths and Type Racer pick a single winner with a strict
// `>` scan over a Map, so a tie silently goes to whoever iteration order reaches
// first. This proves it with controlled ties where the tie is unambiguous.
import { Session, sleep } from "./harness.js";

const log = (m) => console.log(m);
const results = [];

// ---------------------------------------------------------------- TWO TRUTHS
// 4 players: 1 presenter + 3 voters. ALL 3 voters spot the lie, so all three
// gain exactly 1 and the presenter gains 0. A 3-way tie with one correct
// answer: every voter deserves the round win equally.
async function truthsTie() {
  console.log("\n=== Two Truths & a Lie — 3-way voter tie ===");
  const s = new Session("truths", { players: 4, log });
  try {
    await s.open(["truA", "truB", "truC", "truD"]);
    await s.startGame("truths");
    await s.host.waitForStatus("submitting", { timeout: 25000 });

    const presenterId = s.host.state.presenterId;
    const presenter = s.bots.find((b) => b.id === presenterId);
    const voters = s.bots.filter((b) => b.id !== presenterId);
    console.log(`  presenter=${presenter.name}, voters=${voters.map((v) => v.name).join(",")}`);

    const LIE = 1; // index of the lie we plant
    await presenter.act({
      kind: "submitStatements",
      statements: ["I have visited Iceland", "I own a pet tiger", "I can juggle"],
      lieIndex: LIE,
    });
    await s.host.waitForStatus("voting", { timeout: 20000 });

    // Every voter votes the lie correctly -> each gains exactly 1.
    for (const v of voters) await v.act({ kind: "vote", index: LIE });
    await s.host.waitForStatus("reveal", { timeout: 20000 });
    await s.settle(500);

    const scores = s.host.state.scores || {};
    const winner = s.host.state.roundWinnerId;
    console.log(`  in-game scores at reveal: ${JSON.stringify(scores)}`);
    console.log(`  roundWinnerId announced:  ${winner}`);

    // The round win lands in room.roundWins only when the reveal timer expires.
    await s.host.waitFor((b) => Object.keys(b.room?.roundWins || {}).length > 0,
      { label: "roundWins populated", timeout: 25000 }).catch(() => {});
    await s.settle(600);
    const roundWins = s.host.room?.roundWins || {};
    const voterIds = voters.map((v) => v.id);
    const credited = voterIds.filter((id) => (roundWins[id] || 0) > 0);

    console.log(`  room.roundWins: ${JSON.stringify(roundWins)}`);
    console.log(`  voters who each scored +1: ${voterIds.length}, voters credited a round win: ${credited.length}`);

    const verdict = credited.length === voterIds.length
      ? "OK — every tied voter credited"
      : `BUG — ${voterIds.length} voters tied on gain=1, only ${credited.length} credited a round win`;
    console.log(`  => ${verdict}`);
    results.push({
      game: "truths", tiedPlayers: voterIds.length, credited: credited.length,
      scores, roundWinnerId: winner, roundWins, verdict,
      names: Object.fromEntries(s.bots.map((b) => [b.id, b.name])),
    });
  } catch (e) {
    console.log(`  probe error: ${e.message}`);
    results.push({ game: "truths", error: e.message });
  } finally { s.finish(); }
}

// ------------------------------------------------------------------ HOT TAKE
// 6 players, 4 vote agree and 2 disagree. All four agree-voters score +1, so
// all four are equally "round winners" by the game's own scoring.
async function hottakeTie() {
  console.log("\n=== Hot Take — 4 majority voters, all +1 ===");
  const s = new Session("hottake", { players: 6, log });
  try {
    await s.open(["htA", "htB", "htC", "htD", "htE", "htF"]);
    await s.startGame("hottake");
    await s.host.waitForStatus("voting", { timeout: 25000 });

    const majority = s.bots.slice(0, 4);
    for (const b of majority) await b.act({ kind: "hotTakeVote", vote: "agree" });
    for (const b of s.bots.slice(4)) await b.act({ kind: "hotTakeVote", vote: "disagree" });

    await s.host.waitForStatus("reveal", { timeout: 20000 });
    await s.settle(500);
    const scores = s.host.state.scores || {};
    const awarded = s.host.state.roundResult?.awardedPlayerIds || [];
    const winner = s.host.state.roundWinnerId;
    console.log(`  awardedPlayerIds (engine): ${awarded.length} players`);
    console.log(`  roundWinnerId announced:   ${winner}`);
    console.log(`  in-game scores: ${JSON.stringify(scores)}`);

    await s.host.waitFor((b) => Object.keys(b.room?.roundWins || {}).length > 0,
      { label: "roundWins populated", timeout: 25000 }).catch(() => {});
    await s.settle(600);
    const roundWins = s.host.room?.roundWins || {};
    const credited = awarded.filter((id) => (roundWins[id] || 0) > 0);
    console.log(`  room.roundWins: ${JSON.stringify(roundWins)}`);
    const verdict = credited.length === awarded.length
      ? "OK — every awarded player credited"
      : `BUG — engine awarded ${awarded.length} players +1, only ${credited.length} credited a round win`;
    console.log(`  => ${verdict}`);
    results.push({
      game: "hottake", tiedPlayers: awarded.length, credited: credited.length,
      scores, roundWinnerId: winner, roundWins, verdict,
      names: Object.fromEntries(s.bots.map((b) => [b.id, b.name])),
    });
  } catch (e) {
    console.log(`  probe error: ${e.message}`);
    results.push({ game: "hottake", error: e.message });
  } finally { s.finish(); }
}

await truthsTie();
await hottakeTie();

console.log("\n=== CO-WINNER PROBE RESULT ===");
console.log(JSON.stringify(results, null, 2));
process.exit(0);
