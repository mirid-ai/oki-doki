/** The opening is a fictional interaction: it records no consent or settings. */
export function createConsentOpening({ root, button, onContinue, viewport = globalThis, delayMs = 240 }) {
  let finished = false;
  let timer = null;
  let positioned = false;

  function placeUnderPointer(event) {
    if (finished || event.button !== 0 || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    const rect = button.getBoundingClientRect();
    const width = Math.max(0, Number(viewport.innerWidth) || 0);
    const height = Math.max(0, Number(viewport.innerHeight) || 0);
    const left = Math.max(0, Math.min(event.clientX - rect.width / 2, width - rect.width));
    const top = Math.max(0, Math.min(event.clientY - rect.height / 2, height - rect.height));
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
    button.classList.add('caught');
    positioned = true;
  }

  function onClick(event) {
    if (finished || (typeof event.button === 'number' && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    // A keyboard-activated button stays in place; a click without a preceding
    // pointerdown still moves it (for example, an assistive click on the page).
    if (!positioned && event.detail > 0) placeUnderPointer(event);
    finished = true;
    timer = viewport.setTimeout(() => {
      timer = null;
      root.hidden = true;
      onContinue();
    }, delayMs);
  }

  root.addEventListener('pointerdown', placeUnderPointer, true);
  root.addEventListener('click', onClick, true);

  function reset() {
    if (timer !== null) viewport.clearTimeout(timer);
    timer = null;
    finished = false;
    positioned = false;
    button.classList.remove('caught');
    button.style.left = '';
    button.style.top = '';
    root.hidden = false;
  }

  function destroy() {
    if (timer !== null) viewport.clearTimeout(timer);
    root.removeEventListener('pointerdown', placeUnderPointer, true);
    root.removeEventListener('click', onClick, true);
  }

  return { reset, destroy };
}
