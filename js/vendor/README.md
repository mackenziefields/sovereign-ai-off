# Vendored libraries

## PDF.js (pdfjs-dist 4.10.38), Apache-2.0
Used only by the Review Studio, to show a learner's own uploaded PDF on this device and locate quoted passages. Nothing is uploaded.
- `pdf.min.mjs` (352,645 bytes) and `pdf.worker.min.mjs` (1,375,838 bytes), copied unmodified from `package/build/` of the npm tarball
  `https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-4.10.38.tgz`.
- Tarball integrity checked against npm's published value: `sha512-/Y3fcFrXEAsMjJXeL9J8+ZG9U01LbuWaYypvDW2ycW1jL269L3js3DVBjDJ0Up9Np1uqDXsDrRihHANhZOlwdQ==`
- License: `LICENSE-pdfjs.txt`.
- Loaded lazily (dynamic import) the first time a PDF is opened, not at start-up, and cached by the service worker for offline use after that.
