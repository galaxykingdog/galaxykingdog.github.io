# Deployment overview — gkd_chain

A short summary of how a production release of the `gkd_chain` program is prepared. Operational
steps and configuration are kept in the project's private operator checklist.

## Release gates

- An independent security audit of the program and the score verifier.
- A complete rehearsal on a test network before any real funds are involved.
- Score-based rewards stay disabled until gameplay verification is independently approved.

## Deployment

- The project administrator deploys and initializes the program and signs every step personally.
- Initialization sets up the pools, the $420POP token, the leaderboard and the seasons, and enables the
  verified-score signature check.
- Program and administrator authority move to an approved multisig before launch.

## Going live

- The score verifier runs as a monitored, redundant service with its signing key in hardware-backed storage.
- Production-grade storage and network infrastructure replace development tooling.
- The mainnet program address is published in the game only after deployment, initialization and audit
  are complete.
