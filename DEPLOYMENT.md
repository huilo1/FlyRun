# Host your own FlyRun

FlyRun exports a static website. You do not need the maintainer's infrastructure, an inference API or a database.

## Build and serve locally

Use Node.js 22.13 or newer, npm and Python 3:

```sh
npm ci
npm test
npx tsc --noEmit
npm run build
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist/client
```

Open `http://localhost:8000`. Keep this server running while using the app.

## Publish on a static host

Upload the contents of `dist/client` to a static hosting provider of your choice and enable HTTPS. The app currently expects to be served at the domain root because its neural data and Worker URLs begin with `/`.

- Serve JavaScript and WebAssembly with their correct MIME types.
- Preserve the bytes of `.gz.bin` graph assets. These are files the application's loader decompresses; do not label them with `Content-Encoding: gzip` or transparently unpack them during deployment.
- Publish all generated Worker assets and the complete `neural` directory together with the HTML.
- Publish only the static output. Source files, Git history, local environment files and infrastructure configuration are not website assets.
- WebGPU requires a secure context (HTTPS or localhost). CPU fallback remains available when WebGPU cannot initialize.

## Check the compiled Worker

With the local static server above running, execute in another terminal:

```sh
FLYRUN_BUNDLE_DIR=dist/client FLYRUN_BASE_URL=http://localhost:8000 npm run test:worker
```

This exercises the compiled Worker and full graph on CPU, including disabling and restoring synaptic transmission. For hardware WebGPU checks, use `npm run test:gpu`; see [CONTRIBUTING.md](CONTRIBUTING.md).

Store real deployment targets and account-specific settings outside the repository. The checked-in hosting metadata describes the static output only and contains no live hosting account binding.
