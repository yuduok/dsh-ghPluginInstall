#!/usr/bin/env node
/** `pnpm run setup:dev` — link the global dsh packages for typecheck/smoke. */
import { main } from './dev-links.mjs'

process.exit(main())
