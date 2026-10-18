# Owner decision: extension framework and browser target

Date: 2026-10-18.

Question: The explicitly requested maintenance check favored WXT over
Plasmo. Keep React, pnpm and strict TypeScript; which framework should be
used?

Owner's exact answer:

> Plasmo — maradjunk az eredeti választásnál

Question: Which browser version should be built and checked first? Safari
was visible in the owner's screenshot; do not silently assume Chromium.

Owner's exact answer:

> Chrome / Chromium először; Safari később

The owner also supplied the global commit rule: every small increment
gets an atomic commit, with an emoji and short summary, and no message
line longer than 60 characters. This is mirrored in root AGENTS.md.
