/**
 * 9-ball rules engine (modular so 8-ball can be added later).
 * Pure functions – no side effects, no rendering.
 */

import { getLowestUnpocketed } from './physics.js';

/**
 * Evaluate a finished shot.
 *
 * @param {object} opts
 * @param {Array} opts.before   ball states before shot
 * @param {Array} opts.after    ball states after shot
 * @param {object|null} opts.firstContact  {a,b} from physics
 * @param {number} opts.shooter  player index 0 or 1
 * @returns {object} result
 */
export function evaluateNineBallShot({ before, after, firstContact, events = [], shooter }) {
  const result = {
    legal: true,
    foul: false,
    foulReason: null,
    pocketed: [],          // ids that went in this shot
    scratch: false,
    ninePocketed: false,
    continueTurn: false,
    gameOver: false,
    winner: null,
    ballInHand: false
  };

  // Which balls were pocketed this shot?
  for (let id = 0; id <= 9; id++) {
    const was = before.find(b => b.id === id);
    const now = after.find(b => b.id === id);
    if (was && now && !was.pocketed && now.pocketed) {
      result.pocketed.push(id);
      if (id === 0) result.scratch = true;
      if (id === 9) result.ninePocketed = true;
    }
  }

  const lowest = getLowestUnpocketed(before);

  // --- Fouls ---
  // 1. Scratch
  if (result.scratch) {
    result.foul = true;
    result.foulReason = 'scratch';
  }

  // 2. No contact at all
  if (!firstContact) {
    result.foul = true;
    result.foulReason = result.foulReason || 'no contact';
  } else {
    // 3. First contact must be the lowest numbered ball
    const other = firstContact.a === 0 ? firstContact.b : firstContact.a;
    if (other !== lowest && lowest !== null) {
      result.foul = true;
      result.foulReason = result.foulReason || 'wrong ball first';
    }

    const firstCueHit = events.findIndex(event =>
      event.type === 'hit' && (event.a === 0 || event.b === 0)
    );
    if (firstCueHit >= 0 && !result.pocketed.some(id => id > 0) &&
      !events.slice(firstCueHit + 1).some(event =>
        event.type === 'cushion' || event.type === 'pocket'
      )) {
      result.foul = true;
      result.foulReason = result.foulReason || 'no rail after contact';
    }
  }

  // 4. Cue ball still on table but nothing hit and no pocket? already covered

  result.legal = !result.foul;

  // --- Outcomes ---
  if (result.foul) {
    result.ballInHand = true;
    result.continueTurn = false;
    // If 9 was pocketed on a foul, it is spotted back (we leave it pocketed
    // for simplicity in this version – a full ruleset would re-spot).
  } else {
    // Legal shot
    if (result.ninePocketed) {
      result.gameOver = true;
      result.winner = shooter;
      result.continueTurn = false;
    } else if (result.pocketed.some(id => id >= 1 && id <= 8)) {
      // Any legal object ball → stay at the table
      result.continueTurn = true;
    } else {
      result.continueTurn = false;
    }
  }

  return result;
}

/**
 * Factory so we can later swap in eightBallRules.
 */
export function createRules(variant = 'nineball') {
  if (variant === 'nineball') {
    return { evaluate: evaluateNineBallShot, name: '9-Ball' };
  }
  // future: eightball
  return { evaluate: evaluateNineBallShot, name: '9-Ball' };
}
