# PFx Image Studio

Live app: https://pfxamd.github.io/pfx-image-studio/

**App release:** Alpha 0.3.1. The browser interface release is independent of the frozen conversion core (`0.1.0`). The navbar badge reads from `app/release.ts`. Increase `studioVersion` with every change; CI and the Pages deployment workflow reject updates without a version increase.

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

## Direct RGBA resampling (Alpha 0.2.5)

The opt-in resize step now calls `resizeToRgba()` from pinned Raster Core
0.5.0-alpha.3. Raster Core uses an explicit, bounded, premultiplied-alpha
Lanczos3 downsampler. The application worker passes these raw pixels directly
to the original Image3 codec registry, preserving the selected JPEG/PNG/WebP
encoding options. No intermediate PNG is encoded or decoded for resized files.

With resize disabled, or with a maximum width above the source width, the
original Image3 conversion pipeline still runs unchanged. The same worker-pool
cancellation, retry and batch queue remain in use. The resampling pipeline
filters 8-bit sRGB pixels and converts embedded ICC to sRGB when a resize is
explicitly requested; the original ICC bytes are not retained in resized output.
Source images are never modified.

## Resize performance and concurrency (Alpha 0.2.6)

The app adds a dedicated abort-aware single-flight queue for the optional,
memory-heavy Raster Core resize operation. Only one resized image occupies
the extra Canvas/Float32 RGBA memory at a time; ordinary Image3 jobs retain
their original worker concurrency. Queued resize jobs can be cancelled promptly,
and permit release is idempotent. Pixel quality and codec settings are unchanged.
This reduces the risk of concurrent working buffers exhausting memory; it
does **not** measure or guarantee peak process RSS on real mobile hardware.

Browser tests now cover three-image batches and cancellation/retry in
Chromium, Firefox, and mobile-profile emulated Chromium. The mobile profile
tests touch/viewport behavior on a desktop runner, **not a physical phone**.

## Deployment verification and release acceptance (Alpha 0.2.7)

GitHub Pages now publishes `release.json` containing the built Git commit SHA and
Studio release. After each successful Pages upload, a separate verification job
fetches the actual public site and checks its release metadata against the
exact pushed commit, checks compiled JavaScript/CSS are served, and converts
and downloads a test image from the deployed page in Chromium. This detects
stale or incomplete public deployments, instead of equating build success with
live availability.

Browser release acceptance separately exercises 10 generated images through
the optional Raster Core resize queue and the Image3 encoder, verifies all
complete, and downloads a valid ZIP in Chromium, Firefox and mobile-emulated
Chromium. Stress cancellation/retry remains covered by the existing tests.

**Limits:** Browser emulation is not measurement on a physical smartphone.
The release manifest attests source identity but is not a cryptographic
supply-chain signature. No private user photographs are deployed.

## On-device diagnostics (Alpha 0.2.8)

Open the separate diagnostic page: `/diagnostics/`. It is not added to the
main tool's settings or conversion workflow.

The user explicitly starts the test. The page generates deterministic synthetic
PNG images **locally**, then uses the same Studio worker pool, Raster Core
downscaler and Image3 WebP encoder as the actual application. It measures
one unchanged-size conversion, two downscales and a sequential 10-image
resize+encode batch. It reports elapsed times, output dimensions/format,
requestAnimationFrame activity and supported JS heap readings, and offers
Copy report / Save report buttons for voluntary manual sharing.

The diagnostics page has no network telemetry and **does not upload test
images or reports**. The resulting report is not a peak physical RAM, GPU or
native decoder memory reading. `performance.memory` may be missing or
limited, and mobile browser backgrounding affects frame measurements.
The test is intended for an actual foreground phone browser; the CI mobile
project remains only a desktop-based emulator.

## Repeated on-device validation (Alpha 0.2.9)

The same isolated `/diagnostics/` page now separates worker-pool construction,
the **first conversion** (including lazy worker/codec startup) and the median
of 5 subsequent conversions with identical input. The page runs five repeat
measurements for medium and large inputs, plus five distinct generated 3000×2000 stress images and a
10-image sequential batch: **31 operations total**. Median and 90th percentile
latencies, each operation duration, and main-thread frame gaps are included
per workload. Backgrounding the tab or stopping the test prevents a false
success report.

First-conversion overhead is not a direct measurement of WASM initialization;
it may include worker creation, lazy codec loading, decoding and encoding.
Synthetic images are not a photo-quality test. Browser-provided JS heap is
not peak device RAM and is often unavailable on Firefox. Avoid comparing
numbers from different device temperatures or browser states as benchmarks.

## Worker stage profiler and UI responsiveness (Alpha 0.3.0)

The opt-in /diagnostics/ benchmark uses the same production Studio worker.
A diagnostic-only flag adds timings for the existing Image3 decoder and encoder
(including cold lazy imports), and Raster Core 0.5.0-alpha.5 reports exact
native-bitmap decode, 8-bit RGBA extraction and Lanczos3 filtering times.
Normal conversions do not create a timing registry or report these fields.
No changes to codecs, resize algorithm or existing settings.

Diagnostic fixture creation now uses a dedicated OffscreenCanvas worker where
supported. Browsers without this capability fall back to the previous
main-thread Canvas path, which is **explicitly shown in the report**. A
preparation-phase UI-frame-gap count distinguishes fixture generation from
image conversion. The 'outside worker' figure includes input preflight,
scheduling, module startup and message/transfer time; it is NOT direct
main-thread CPU utilization.

The report still measures 31 operations (cold first, 5 warmed, 5 medium,
5 large, 5 large-image stress and 10-image batch), now with stage medians,
cold-codec cost and per-phase responsiveness. The benchmark runs locally
on the user's device, no uploads. Time measurements alone cannot identify
the exact cause of operating-system scheduling or GPU frame gaps. Firefox
mobile does not expose reliable process peak RAM via the Web Performance API.

## Pixel-identical faster resizing (Alpha 0.3.1)

Studio now pins the independent Raster Core 0.5.0-alpha.6. The browser Lanczos3
filter reuses byte-strided tap addresses and optimizes fully opaque images,
without changing its filtering result. Five deterministic fixtures check every
RGBA byte against the previous core version (including semi-transparent alpha,
vertical-first, thin-line, and late-alpha cases).

A private real-life photograph and several large synthetic RGBA inputs were
compared locally in Chromium; pixel outputs matched bit-for-bit and the
filter ran faster on the test machine. Actual mobile Firefox performance
requires a new on-device run: /diagnostics/ shows stage-specific resample
timing, and may show smaller improvements than Chromium.

No changes to Image3 codecs, conversion options, download behavior, ICC
permissions, or memory bounds. The source photo was not committed.

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
