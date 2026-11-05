/** Pairwise player feedback steers an authored dialogue policy. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/preference.js', import.meta.url), 'utf8');
const { evaluatePreference, pairwisePolicy } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const examples = [
  [{ vote_a: 'direct', vote_b: 'direct' }, { direct: 2, warm: 0 }, 'direct'],
  [{ vote_a: 'warm', vote_b: 'warm' }, { direct: 0, warm: 2 }, 'warm'],
  [{ vote_a: 'direct', vote_b: 'warm' }, { direct: 1, warm: 1 }, 'direct'],
  [{ vote_a: 'warm', vote_b: 'direct' }, { direct: 1, warm: 1 }, 'direct'],
  [{ vote_a: 'skip', vote_b: 'warm' }, { direct: 0, warm: 1 }, 'warm'],
  [{ vote_a: 'direct', vote_b: 'skip' }, { direct: 1, warm: 0 }, 'direct'],
  [{ vote_a: 'skip', vote_b: 'skip' }, { direct: 0, warm: 0 }, 'neutral'],
  [{}, { direct: 0, warm: 0 }, 'neutral'],
  [{ vote_a: 'invalid', vote_b: null }, { direct: 0, warm: 0 }, 'neutral']
];

for (const [votes, scores, style] of examples) {
  const original = JSON.stringify(votes);
  assert.deepEqual(evaluatePreference(votes), { scores, style });
  assert.equal(JSON.stringify(votes), original, 'Evaluation must not modify saved flags');
  assert.deepEqual(evaluatePreference(JSON.parse(original)), { scores, style }, 'Restored votes must select the same style');
}
assert.deepEqual(evaluatePreference(), { scores: { direct: 0, warm: 0 }, style: 'neutral' });

for (const first of ['direct', 'warm', 'skip']) for (const second of ['direct', 'warm', 'skip']) {
  const flags = { vote_a: 'warm', vote_b: 'warm', card_preference: first, notice_preference: second };
  const expected = { direct: [first, second].filter(v => v === 'direct').length, warm: [first, second].filter(v => v === 'warm').length };
  const style = expected.direct === expected.warm ? 'neutral' : expected.direct > expected.warm ? 'direct' : 'warm';
  assert.deepEqual(evaluatePreference(flags), { scores: expected, style });
  assert.deepEqual(evaluatePreference(JSON.parse(JSON.stringify(flags))), { scores: expected, style });
}
assert.deepEqual(evaluatePreference({ vote_a: 'warm', card_preference: 'skip' }), { scores: { direct: 0, warm: 0 }, style: 'neutral' });
assert.deepEqual(evaluatePreference({ vote_a: 'warm', notice_preference: 'direct' }), { scores: { direct: 1, warm: 0 }, style: 'direct' });
assert.deepEqual(evaluatePreference({ vote_a: 'warm', card_preference: 'invalid' }), { scores: { direct: 0, warm: 0 }, style: 'neutral' });
assert.deepEqual(evaluatePreference({ card_preference: 'direct', notice_preference: 'warm' }), { scores: { direct: 1, warm: 1 }, style: 'neutral' });
assert.deepEqual(evaluatePreference({ card_preference: 'warm', notice_preference: 'direct' }), { scores: { direct: 1, warm: 1 }, style: 'neutral' });

// The learned reward is the regularized pairwise-likelihood optimum; its
// softmax is also the KL-regularized policy optimum for a uniform reference.
for (const scores of [{ direct: 0, warm: 0 }, { direct: 1, warm: 0 }, { direct: 2, warm: 0 }, { direct: 0, warm: 2 }, { direct: 1, warm: 1 }]) {
  const { rewards, probabilities } = pairwisePolicy(scores);
  const difference = rewards.direct - rewards.warm;
  const gradient = scores.direct - (scores.direct + scores.warm) / (1 + Math.exp(-difference)) - difference;
  assert.ok(Math.abs(gradient) < 1e-10, 'reward must maximize the regularized comparison likelihood');
  assert.ok(Math.abs(rewards.direct + rewards.warm) < 1e-10, 'rewards must be centered');
  assert.ok(Math.abs(probabilities.direct + probabilities.warm - 1) < 1e-10);
  const objective = p => p * rewards.direct + (1 - p) * rewards.warm - p * Math.log(p / 0.5) - (1 - p) * Math.log((1 - p) / 0.5);
  for (const alternative of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    assert.ok(objective(probabilities.direct) >= objective(alternative) - 1e-10, 'policy must optimize reward with a KL penalty');
  }
}
assert.ok(pairwisePolicy({ direct: 2, warm: 0 }).probabilities.direct > pairwisePolicy({ direct: 1, warm: 0 }).probabilities.direct);
assert.equal(pairwisePolicy({ direct: 1, warm: 1 }).probabilities.direct, 0.5);
console.log('Pairwise feedback, legacy saves and the KL-regularized style policy behave as specified.');
