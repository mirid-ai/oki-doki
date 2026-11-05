// A new speaker's text can render before their image finishes loading. Hide
// the previous portrait until the replacement is decoded, and discard any
// delayed completion after the player advances or returns to the title.
export function createPortraitController(image) {
  let revision = 0;
  let selected = '';
  return {
    show(path) {
      const current = ++revision;
      const previous = selected;
      selected = typeof path === 'string' ? path : '';
      image.onload = null;
      image.onerror = null;
      if (!selected) { image.hidden = true; return; }
      if (previous === selected && !image.hidden && image.complete && image.naturalWidth > 0) return;
      image.hidden = true;
      const expected = selected;
      const reveal = () => {
        if (current === revision && selected === expected && image.complete && image.naturalWidth > 0) image.hidden = false;
      };
      const loaded = () => {
        if (current !== revision || selected !== expected || !image.complete || !image.naturalWidth) return;
        if (typeof image.decode !== 'function') { reveal(); return; }
        try { Promise.resolve(image.decode()).then(reveal, () => {}); } catch { /* Keep an invalid image hidden. */ }
      };
      image.onload = loaded;
      image.onerror = () => { if (current === revision) image.hidden = true; };
      if (previous !== selected || (image.complete && !image.naturalWidth)) image.src = selected;
      if (image.complete && image.naturalWidth > 0) loaded();
    }
  };
}

// Reconstruct whether the playroom's light has gone out from the current
// story node. This also works for checkpoints created before the artwork.
export function dimPlayroomNodes(story) {
  const reached = new Set();
  // These earlier entry points remain loadable by checkpoints from previous
  // story versions even though newer routes no longer enter them directly.
  const pending = ['room_shift', 'correction_absorbed', 'reason_result_team', 'reason_result_prize', 'reason_result_company'];
  while (pending.length) {
    const id = pending.pop();
    const node = story?.[id];
    if (!node || node.location !== 'playroom' || reached.has(id)) continue;
    reached.add(id);
    const next = [node.next, node.input?.next, ...(node.choices || []).map(choice => choice.next),
      ...Object.values(node.nextBy?.cases || {}), node.offer?.skip, node.offer?.grant?.next, node.offer?.paidGrant?.next];
    for (const target of next) if (typeof target === 'string') pending.push(target);
  }
  return reached;
}
