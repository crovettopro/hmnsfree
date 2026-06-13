import { summarizeLedger } from '@static/runtime'

/** `pnpm --filter @static/studio ledger` — print accumulated cost + projection. */
summarizeLedger().catch((err) => {
  console.error(err)
  process.exit(1)
})
