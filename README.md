# PFx Image Studio

Live app: https://pfxamd.github.io/pfx-image-studio/

**App release:** Alpha 0.2.4. The browser interface release is independent of the frozen conversion core (`0.1.0`). The navbar badge reads from `app/release.ts`. Increase `studioVersion` with every change; CI and the Pages deployment workflow reject updates without a version increase.

Browser-first image conversion core for **JPG, PNG and WEBP**.

`Core v0.1` is frozen as the conversion engine. The browser application lives in a separate `app/` layer and consumes the public core API.

## Core v0.1

- local browser processing
- no backend and no image upload
- JPEG via MozJPEG
- PNG via OxiPNG / PNG codec
- WebP via libwebp
- lazy WASM codec loading
- typed codec registry
- deterministic conversion pipeline
- bounded, memory-aware scheduling
- image-dimension preflight
- batch conversion
- progress reporting
- cancellation and retry policies
- worker replacement after cancellation or worker failure
- typed errors
- framework-independent core

## Pipeline

```text
Input
  -> signature validation
  -> dimension preflight
  -> decode
  -> RGBA normalization
  -> conversion policies
  -> target codec
  -> encoded ArrayBuffer
  -> output metadata
```

## Stable public API

Runtime exports frozen for v0.1:

```text
Image3Core
Image3WorkerPool
Image3CoreError
CodecRegistry
createOutputBlob
```

Public TypeScript contracts are exported from `src/index.ts`.

Internal scheduling, memory, retry and pipeline helpers are intentionally not part of the stable public surface.

## Structure

```text
src/
  codecs/     codec contracts, registry and adapters
  errors/     typed core errors
  memory/     dimension parsing and working-set estimation
  output/     output helpers
  pipeline/   format detection and conversion
  queue/      bounded weighted scheduler
  retry/      retry policy
  types/      public core types
  workers/    worker protocol and lifecycle
```

## Validation

The core is checked with:

- strict TypeScript type checking
- unit tests
- build validation
- full 9-path JPG/PNG/WebP conversion matrix
- Chromium and Firefox browser tests
- alpha and quality tests
- worker cancellation and recovery tests
- corrupted-file tests
- batch stress tests
- memory-budget tests
- codec benchmark reporting

## Development

```bash
npm install
npm run check
npm run test:browser
```

## Raster Core integration (Alpha 0.2.3)

PFx Image Studio now consumes the independent PFx Raster Core browser entry
(pinned to a reviewed Git commit) **only for selected-image source inspection**.
It shows original dimensions, transparency and presence of an ICC profile in
the existing File details panel. This inspection is lazy, bounded to 16 MiB
per file, and never blocks conversion if a file is too large, malformed or
unsupported by the browser adapter.

The original frozen Image3 v0.1 worker/WASM conversion engine remains the
sole converter: no codec, progress, cancellation, retry, batching, quality
setting, output type or download behavior has changed. The external Raster
Core is not bundled by copying its source into this repository; it is an
independent pinned dependency. Re-evaluate compatibility before changing the
pin. Source inspection involves browser-native decoding and does not prove
output color fidelity.

## Optional Raster Core resize (Alpha 0.2.4)

Image Studio now optionally downscales a file to a **maximum width** using
Raster Core's browser adapter before handing the uncompressed PNG intermediate
to the **unchanged** Image3 WASM encoder. Resizing is off by default; a smaller
image is never enlarged or cropped. Aspect ratio is preserved. Each file uses
its individual effective workspace settings, including batch conversions.

The app-specific conversion worker runs preprocessing inside the already
memory-weighted Image3WorkerPool. Cancel/retry retires the worker as before;
no independent unbounded canvas task is started. JPEG, PNG and WebP final
encoding still use the existing Image3 codec settings. Original encoded size
and original input format remain attached to the completed result.

**Color fidelity caveat:** Browser Canvas converts ICC-tagged pixels to its
sRGB rendering space when resizing; it does not guarantee preservation of the
original ICC bytes, nor exact Sharp resampling. Resizing is an explicit user
opt-in. Large/unsupported files can fail with a specific error rather than
silently changing the original. Inactive resize uses the prior conversion
path unchanged.

## Application foundation

The current `app/` layer provides:

- React workspace shell
- drag and drop plus file picker
- multi-image file list
- JPG / PNG / WebP output controls
- quality and compression controls
- worker-backed conversion
- per-file and batch progress
- cancel and retry
- individual and batch download actions
- responsive structural layout
- isolated app TypeScript and unit tests
- Chromium and Firefox UI integration coverage

The desktop interface uses a fixed-height, image-centered workstation with independent scrolling for large file lists and shorter settings panels. Use the header icon to switch between light and dark mode; the selected appearance is retained locally.

## Scope

PFx Image Studio currently focuses on JPG, PNG and WebP conversion. Optional max-width downscaling is supported. Cropping and export presets are future directions, not existing features. The stable `Image3` core API remains unchanged for compatibility.

## License

Copyright 2026 PFxamd.

PFx Image Studio is licensed under Apache-2.0. Third-party codec notices are documented in `THIRD_PARTY_NOTICES.md`.
