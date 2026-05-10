/**
 * subtitleTrack.js
 * Reliable subtitle injection for HTML5 video elements.
 *
 * Problems with the naive approach (track.default + setTimeout):
 *   • track.default has no effect on dynamically appended <track> elements —
 *     it is only read during HTML parsing.
 *   • setTimeout(150) is a race: the browser may not have parsed the VTT
 *     yet (long cue files) or the old TextTrack may still be 'showing'.
 *   • Removing a <track> DOM element does NOT immediately remove its
 *     corresponding TextTrack from videoEl.textTracks.
 *
 * Correct approach:
 *   1. Silence ALL existing TextTracks immediately (before touching the DOM).
 *   2. Remove old <track> elements identified by a data-* attribute.
 *   3. Append the new <track> element WITHOUT the .default flag.
 *   4. Listen to the 'load' event on the <track> element — this fires the
 *      moment all cues are parsed — then set trackEl.track.mode = 'showing'.
 */

/**
 * Inject a VTT subtitle track into a <video> element, instantly replacing
 * any previously injected track that shares the same data-attribute marker.
 *
 * @param {HTMLVideoElement} videoEl
 * @param {object}  opts
 * @param {string}  opts.blobUrl  – Blob URL of the WebVTT file
 * @param {string}  opts.label   – Human-readable label (shown in browser UI)
 * @param {string}  [opts.lang]  – BCP-47 / ISO 639 language code, e.g. 'tr'
 * @param {string}  opts.attr    – data-* attribute to stamp on the element,
 *                                 e.g. 'data-srt'. Used to find and remove the
 *                                 previous track on the next call.
 * @returns {HTMLTrackElement}
 */
export function injectSubtitle(videoEl, { blobUrl, label, lang = 'und', attr = 'data-sub' }) {
  // ── 1. Silence every currently active TextTrack ───────────
  for (let i = 0; i < videoEl.textTracks.length; i++) {
    videoEl.textTracks[i].mode = 'hidden'
  }

  // ── 2. Remove previous <track> elements with this marker ──
  videoEl.querySelectorAll(`track[${attr}]`).forEach(t => {
    if (t.track) t.track.mode = 'hidden'   // belt-and-suspenders
    t.remove()
  })

  // ── 3. Create the new <track> ─────────────────────────────
  const trackEl = document.createElement('track')
  trackEl.setAttribute(attr, '1')
  trackEl.kind    = 'subtitles'
  trackEl.label   = label
  trackEl.srclang = lang
  trackEl.src     = blobUrl   // never set .default — it has no effect here

  // ── 4. Activate the moment cues are parsed ────────────────
  function activate() { trackEl.track.mode = 'showing' }
  trackEl.addEventListener('load',  activate, { once: true })
  // If the src fails, leave everything hidden (no crash)
  trackEl.addEventListener('error', () => {}, { once: true })

  videoEl.appendChild(trackEl)

  // ── 5. Synchronous fast-path (cached blob — readyState already LOADED) ──
  if (trackEl.readyState === HTMLTrackElement.LOADED) activate()

  return trackEl
}

/**
 * Silence and detach a single <track> element cleanly.
 * Hides the corresponding TextTrack before removal so the browser stops
 * rendering its cues immediately.
 *
 * @param {HTMLTrackElement|null} trackEl
 */
export function removeSubtitle(trackEl) {
  if (!trackEl) return
  if (trackEl.track) trackEl.track.mode = 'hidden'
  trackEl.remove()
}
