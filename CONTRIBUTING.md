# Contributing to FlyRun

Issues and pull requests are welcome in English or Russian. Start with the [English README](README.en.md) or [русское описание](README.md), then run the project locally.

## Reporting an experiment

For unexpected behavior, include:

- Room seed and obstacle count.
- Browser version, operating system and CPU / WebGPU backend.
- Model time when the behavior started, and whether it persisted.
- Environmental feedback, synaptic transmission, direct-DN and stimulus-gain settings.
- Whether the run began from a reset or the settings were changed during it.
- Walking L/R, turning L/R, reverse and acceleration rates, if available.

Screenshots, recordings and small reproducible test cases help. A stationary fly does not by itself establish a neural failure: input encoding, motor decoding and collision physics can also cause it.

## Making changes

1. Fork the repository and create a branch for a focused change.
2. Explain the behavior being changed and how you measured it.
3. Run `npm test`, `npx tsc --noEmit` and `npm run build`.
4. For neural, sensory or physics changes, run the relevant full-graph checks and report the seed, backend and settings. Add a regression when it can catch the underlying failure.
5. Open a pull request with the problem, change, validation results and remaining limitations.

Read [SENSORY_EXPERIMENT.md](SENSORY_EXPERIMENT.md) before modifying the sensor or motor interface. The default experiment uses sensory-only inputs: visual input populations must remain disjoint from motor readout populations. Keep direct-DN inputs an explicitly selected control mode.

Movement in the default experiment must come from calculated motor spikes. Do not introduce hidden path following, forced turns on collision, teleports or direct motor stimulation to improve the apparent outcome. Alternative controllers are welcome as clearly named comparison experiments.

Keep these controls measurable: zero direct motor inputs in sensory mode; zero motor activity after reset with synaptic transmission disabled; motor activity decaying when transmission is disabled during a run. Changes in trajectory alone are not evidence of biological fidelity.

To refresh tracked measurements after changing the measured sources:

```sh
node scripts/sensory-validation.mjs --write-report
npm run build
node scripts/gpu-smoke.mjs --write-report
```

The second report needs hardware WebGPU and Chrome. Set `FLYRUN_CHROME` if Chrome is not at the harness's default macOS location. If you cannot run it, say so in the pull request; do not edit measurements or hashes to imply a test was run. Maintainers can complete the GPU check before release. Reports from different devices can legitimately show different trajectories.

Use the development server or any HTTPS static host for `dist/client`; see [DEPLOYMENT.md](DEPLOYMENT.md). Keep deployment targets, SSH usernames, internal hostnames, server paths and account-specific configuration outside this public repository, even when they contain no password or API key.

## Licensing

Contribute original code under the repository's MIT license and preserve the notices for reused material. Connectome data remains under CC BY 4.0; bundled upstream code and kernels retain their own licenses. Include the origin and license when adding external data or code.
