# FlyRun

- This repository is public. Keep private deployment instructions, SSH targets and usernames, server paths, internal ports, account identifiers and credentials outside tracked files and Git history. An absence of passwords does not make infrastructure details appropriate to publish.
- If an ignored `AGENTS.local.md` exists on the maintainer's machine, read it for local-only operations instructions. Never add it to Git.
- Public demo: https://flyrun.runningdog.org. Generic self-hosting instructions are in `DEPLOYMENT.md`.
- Use `?worker&url` for the neural Worker: the RSC build may rewrite `import.meta.url` to a local file URL. Check the compiled Worker with `scripts/worker-smoke.mjs` and `FLYRUN_BUNDLE_DIR` when changing its integration.
- Preserve the full connectome. Do not introduce hidden path following or direct motor drive to improve the default experiment's trajectory.
- The default is sensory-only, `assisted: false`. Visual input and motor readout populations must remain disjoint. Direct DN stimulation belongs only in the explicitly selected control mode.
- Read `SENSORY_EXPERIMENT.md` before changing the sensor or motor interface. Refresh the relevant full-graph measurements when changing measured sources; see `CONTRIBUTING.md`.
- Use `npm test`, `npx tsc --noEmit` and `npm run build` for ordinary validation. Report which backend was actually tested.
