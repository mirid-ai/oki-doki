/** The game's small, inspectable preference model; it does not train an LLM. */
const COMPARISONS = ['card_preference', 'notice_preference'];
const LEGACY_VOTES = ['vote_a', 'vote_b'];

function count(flags, keys) {
  const scores = { direct: 0, warm: 0 };
  for (const key of keys) {
    const choice = flags?.[key];
    if (choice === 'direct' || choice === 'warm') scores[choice]++;
  }
  return scores;
}

/**
 * Fit a two-item Bradley–Terry reward model to the player's pairwise choices.
 * The reward difference maximizes the comparison log-likelihood with an L2
 * prior, so even unanimous or sparse feedback gives finite rewards. The two
 * rewards are centered at zero because comparisons identify only differences.
 *
 * The resulting policy maximizes E[reward] - KL(policy || uniform reference).
 * Its closed form is softmax(reward), with KL coefficient 1. This is an exact
 * optimization over two authored styles, not an update to a connected model.
 */
export function pairwisePolicy(scores) {
  const direct = scores.direct;
  const warm = scores.warm;
  const n = direct + warm;
  if (!n) return { rewards: { direct: 0, warm: 0 }, probabilities: { direct: 0.5, warm: 0.5 } };

  let difference = 0;
  for (let i = 0; i < 20; i++) {
    const p = 1 / (1 + Math.exp(-difference));
    // Unit-strength L2 regularization on the reward difference.
    const gradient = direct - n * p - difference;
    const curvature = n * p * (1 - p) + 1;
    difference += gradient / curvature;
  }
  const directProbability = 1 / (1 + Math.exp(-difference));
  return {
    rewards: { direct: difference / 2, warm: -difference / 2 },
    probabilities: { direct: directProbability, warm: 1 - directProbability }
  };
}

export function evaluatePreference(flags = {}) {
  // Old checkpoints have neither comparison. Once either is present, ignore
  // the old in-scene actions: skipping a comparison is not a preference.
  const hasComparisons = COMPARISONS.some((key) => Object.prototype.hasOwnProperty.call(flags ?? {}, key));
  const scores = count(flags, hasComparisons ? COMPARISONS : LEGACY_VOTES);
  const total = scores.direct + scores.warm;
  if (!total) return { scores, style: 'neutral' };
  if (!hasComparisons) return { scores, style: scores.direct >= scores.warm ? 'direct' : 'warm' };
  const { probabilities } = pairwisePolicy(scores);
  // Equal learned rewards provide no evidence for either style. Keep the
  // neutral authored response instead of presenting an arbitrary tie-break as
  // a preference; the earlier tie-break remains in force for legacy saves.
  if (probabilities.direct === probabilities.warm) return { scores, style: 'neutral' };
  return { scores, style: probabilities.direct > probabilities.warm ? 'direct' : 'warm' };
}
