import { regenerateSyndication } from './syndicate'

/** One-off: stitch episode.mp3 + write share pages + feeds for the whole library. */
const r = await regenerateSyndication()
console.log(`✓ syndication: ${r.episodes} episode(s), ${r.withAudio} with combined audio`)
