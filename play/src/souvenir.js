// Each card depicts only the altered image already described in that scene.
// The fixed map never incorporates player-authored names or message text.
const cards = Object.freeze({
  niko_care: { path: './assets/souvenir-niko-care.svg', alt: 'A card shows the IMPORTANT lid and sorted screws, with three pairs of hands reaching toward it.' },
  niko_play: { path: './assets/souvenir-niko-play.svg', alt: 'A card shows a figure wearing the little lid crown; its face is a blank oval.' },
  mira_care: { path: './assets/souvenir-mira-care.svg', alt: 'A card shows hands holding a plush whose loose ear has already been stitched on.' },
  mira_play: { path: './assets/souvenir-mira-play.svg', alt: 'A coloured cardboard knight has an eye in its visor. A second eye looks out from the back of the card.' },
  ash_care: { path: './assets/souvenir-ash-care.svg', alt: 'A map shows a rest stop with four steaming cups.' },
  ash_play: { path: './assets/souvenir-ash-play.svg', alt: 'A map shows the little building inspector with teeth cut through the paper.' }
});
const closedKnightCard = Object.freeze({
  path: './assets/souvenir-mira-play-closed.svg',
  alt: 'A coloured cardboard knight has an eye in its visor. The eye on the back of the card is closed.'
});

/** Return only the picture described on this passage, never a guessed route. */
export function souvenirForPassage(nodeId, flags = {}) {
  if (typeof nodeId !== 'string') return null;
  const exact = /^moment_(niko|mira|ash)_(care|play)(?:_reply)?$/.exec(nodeId);
  if (exact) return cards[`${exact[1]}_${exact[2]}`];
  if (nodeId !== 'moment_caption' && nodeId !== 'moment_choice') return null;
  if (!flags || !['niko', 'mira', 'ash'].includes(flags.midpoint_route) ||
      !['care', 'play'].includes(flags.bond) ||
      String(flags.companion || '').toLowerCase() !== flags.midpoint_route) return null;
  // Only the eye on the back closes, after the named-card passage was seen.
  // Earlier and incomplete checkpoints retain the ordinary open-eye image.
  if (flags.midpoint_route === 'mira' && flags.bond === 'play' && flags.named_card_seen === 'yes') return closedKnightCard;
  return cards[`${flags.midpoint_route}_${flags.bond}`];
}
