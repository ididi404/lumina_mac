/**
 * Assemble the Python runtime bundle for Lumina on macOS.
 *
 * Usage:  node scripts/bundle-macos.mjs [--arch=arm64|x64]
 *
 * Defaults to the host arch. Produces build/bundle-coreml-<arch>/:
 *   python/            relocatable CPython (python-build-standalone)
 *   ort/coreml/        onnxruntime wheel (CoreML / Metal EP)
 *   backend/           python/ source
 *   manifest.json      { variant: "coreml", arch, python, onnxruntime, ... }
 *
 * Metal GPU acceleration comes from ONNX Runtime's CoreMLExecutionProvider
 * (no separate Metal EP exists in official ORT wheels).
 */
import { spawnSync } from "child_process";
import {
  createWriteStream,
  rmSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  statSync,
  chmodSync,
  unlinkSync,
  linkSync,
} from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(ROOT, "scripts");
const BUILD = path.join(ROOT, "build");

const PY_VER = "3.13.17";
const PBS_TAG = "20261021";
const ORT_VER = "1.23.2";

const REQ_BACKEND = path.join(SCRIPTS, "requirements-backend.txt");
const REQ_ORT = path.join(SCRIPTS, "requirements-ort-macos.txt");

/** ORT wheel names that share site-packages with the backend. */
const COMMON_DEPS = new Set([
  "flatbuffers",
  "mpmath",
  "numpy",
  "packaging",
  "protobuf",
  "sympy",
  "coloredlogs",
  "humanfriendly",
]);

/**
 * Actually extract into the app. sympy/mpmath are ORT tooling deps (~31 MB)
 * and are not required for CoreML inference; coloredlogs/humanfriendly are
 * optional logging helpers.
 */
const RUNTIME_COMMON_DEPS = new Set([
  "flatbuffers",
  "numpy",
  "packaging",
  "protobuf",
]);

/** Host arch → pip platform tags + PBS naming. */
const ARCH_MAP = {
  arm64: {
    // Try newer tags first — numpy often needs 14_0 while ORT ships 13_0.
    pipTags: ["macosx_14_0_arm64", "macosx_13_0_arm64", "macosx_12_0_arm64"],
    pbs: "aarch64-apple-darwin",
  },
  x64: {
    pipTags: ["macosx_14_0_x86_64", "macosx_13_0_x86_64", "macosx_12_0_x86_64"],
    pbs: "x86_64-apple-darwin",
  },
};

function hostArch() {
  const m = process.arch;
  if (m === "arm64") return "arm64";
  if (m === "x64") return "x64";
  throw new Error(`Unsupported host arch: ${m}`);
}

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.error) {
    console.error(`Failed to run ${cmd}: ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function fetchFile(url, dest, minBytes = 0) {
  console.log(`Downloading ${url}`);
  const tmp = `${dest}.part`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
    const size = statSync(tmp).size;
    if (size < minBytes) throw new Error(`Download too small: ${size} bytes`);
    rmSync(dest, { force: true });
    copyFileSync(tmp, dest);
    console.log(`  -> ${(size / 1024 / 1024).toFixed(1)} MB`);
  } finally {
    rmSync(tmp, { force: true });
  }
}

function distName(wheel) {
  return wheel.split("-")[0].replaceAll("_", "-").toLowerCase();
}

function listWheels(dir) {
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".whl"))
        .sort()
    : [];
}

function extractTarGz(archive, dest) {
  mkdirSync(dest, { recursive: true });
  const r = spawnSync("tar", ["-xzf", archive, "-C", dest], {
    stdio: "inherit",
  });
  if (r.error || r.status !== 0) {
    throw new Error(`Failed to extract ${archive} (exit ${r.status})`);
  }
}

function extractZip(zip, dest) {
  mkdirSync(dest, { recursive: true });
  const r = spawnSync("tar", ["-xf", zip, "-C", dest], { stdio: "inherit" });
  if (r.error || r.status !== 0) {
    throw new Error(`Failed to extract ${zip} (exit ${r.status})`);
  }
}

function copyTree(src, dst, skip = () => false) {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const rel = entry.name;
    if (skip(rel)) continue;
    const s = path.join(src, rel);
    const d = path.join(dst, rel);
    if (entry.isDirectory()) {
      mkdirSync(d, { recursive: true });
      copyTree(s, d, skip);
    } else {
      mkdirSync(path.dirname(d), { recursive: true });
      copyFileSync(s, d);
    }
  }
}

/** Recursively delete matching paths under root. */
function rmMatching(root, pred) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (pred(entry.name, p, true)) rmSync(p, { recursive: true, force: true });
      else rmMatching(p, pred);
    } else if (pred(entry.name, p, false)) {
      rmSync(p, { force: true });
    }
  }
}

/**
 * Drop packaging fat that is unused at runtime.
 * Keeps one python binary (hardlinks aliases) and strips ORT tooling.
 */
function slimBundle(out, pyRoot, sitePkgs, ortRoot) {
  const before = Number(mbOf(out));

  // 1) One CPython binary — PBS ships three 17 MB copies after copyFileSync.
  const binDir = path.join(pyRoot, "bin");
  const primary = path.join(binDir, "python3.13");
  if (existsSync(primary)) {
    for (const name of ["python", "python3"]) {
      const alias = path.join(binDir, name);
      try {
        if (existsSync(alias)) unlinkSync(alias);
        linkSync(primary, alias);
        chmodSync(alias, 0o755);
      } catch (e) {
        console.warn(`  hardlink ${name}: ${e.message}`);
      }
    }
  }
  for (const name of readdirSync(binDir)) {
    if (
      /^(idle|pip|pydoc)/.test(name) ||
      name.endsWith("-config") ||
      name.endsWith("2to3")
    ) {
      rmSync(path.join(binDir, name), { force: true });
    }
  }

  // 2) Headers / docs / stdlib IDE & ensurepip.
  for (const rel of [
    "include",
    "share",
    path.join("lib", "python3.13", "idlelib"),
    path.join("lib", "python3.13", "tkinter"),
    path.join("lib", "python3.13", "turtledemo"),
    path.join("lib", "python3.13", "ensurepip"),
    path.join("lib", "python3.13", "config-3.13-darwin"),
  ]) {
    rmSync(path.join(pyRoot, rel), { recursive: true, force: true });
  }

  // 3) Pip + unused ORT transitive packages (if somehow present).
  for (const name of [
    "pip",
    "sympy",
    "mpmath",
    "coloredlogs",
    "humanfriendly",
  ]) {
    rmSync(path.join(sitePkgs, name), { recursive: true, force: true });
  }
  rmMatching(sitePkgs, (name, _p, isDir) => {
    if (!isDir) return name.endsWith(".pyi") || name === "py.typed";
    return (
      name === "pip" ||
      name.startsWith("pip-") ||
      name.startsWith("sympy-") ||
      name.startsWith("mpmath-") ||
      name.startsWith("coloredlogs-") ||
      name.startsWith("humanfriendly-") ||
      name === "__pycache__" ||
      name.endsWith(".dist-info")
    );
  });

  // 4) ORT: keep capi + package init; drop offline tools / transformers.
  const ortPkg = path.join(ortRoot, "onnxruntime");
  for (const name of [
    "tools",
    "datasets",
    "transformers",
    "quantization",
    "backend",
  ]) {
    rmSync(path.join(ortPkg, name), { recursive: true, force: true });
  }
  rmMatching(ortRoot, (name, _p, isDir) => {
    if (isDir) return name === "__pycache__" || name.endsWith(".dist-info");
    return name.endsWith(".pyi") || name === "py.typed";
  });

  // 5) Backend source caches.
  rmMatching(path.join(out, "backend"), (name, _p, isDir) => {
    return isDir ? name === "__pycache__" : name.endsWith(".pyc");
  });

  const after = Number(mbOf(out));
  console.log(
    `Slimmed bundle: ${before} MB → ${after} MB (−${(before - after).toFixed(0)} MB)`,
  );
}

function pipCmd() {
  const candidates = [
    path.join(ROOT, "venv", "bin", "python"),
    process.env.PYTHON || "",
    "python3.13",
    "python3",
  ].filter(Boolean);
  for (const py of candidates) {
    if (py.includes("/") && !existsSync(py)) continue;
    const r = spawnSync(py, ["-c", "import sys; print(sys.version)"], {
      encoding: "utf-8",
    });
    if (r.status === 0) return [py, "-m", "pip"];
  }
  throw new Error("No usable Python found for pip download");
}

async function ensureStandalonePython(arch) {
  const meta = ARCH_MAP[arch];
  const name = `cpython-${PY_VER}+${PBS_TAG}-${meta.pbs}-install_only.tar.gz`;
  const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${name}`;
  const dest = path.join(BUILD, "embed-macos", name);
  mkdirSync(path.dirname(dest), { recursive: true });
  if (existsSync(dest) && statSync(dest).size > 10 * 1024 * 1024) {
    console.log(`Standalone python already cached: ${dest}`);
    return dest;
  }
  rmSync(dest, { force: true });
  await fetchFile(url, dest, 10 * 1024 * 1024);
  return dest;
}

/**
 * Download wheels for a target macOS arch.
 * Same-arch: let pip resolve against the host (most reliable).
 * Cross-arch: try several macosx_* tags until the set resolves.
 */
function downloadWheels(dest, reqFile, arch) {
  if (listWheels(dest).length > 0) {
    console.log(`Wheels already downloaded: ${dest}`);
    return;
  }
  mkdirSync(dest, { recursive: true });
  const [pip, ...pipArgs] = pipCmd();
  const base = [
    ...pipArgs,
    "download",
    "-r",
    reqFile,
    "--only-binary=:all:",
    "--python-version",
    "313",
    "--implementation",
    "cp",
    "--dest",
    dest,
  ];

  if (arch === hostArch()) {
    sh(pip, base);
    return;
  }

  const tags = ARCH_MAP[arch].pipTags;
  const needOrt = reqFile === REQ_ORT;
  let lastErr = null;
  for (const tag of tags) {
    console.log(`Trying pip platform tag: ${tag}`);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    const r = spawnSync(pip, [...base, "--platform", tag], {
      stdio: "inherit",
    });
    const wheels = listWheels(dest);
    const ok =
      r.status === 0 &&
      wheels.length > 0 &&
      (!needOrt || wheels.some((w) => w.startsWith("onnxruntime")));
    if (ok) return;
    lastErr = r.status;
  }
  throw new Error(
    `Failed to download macOS ${arch} wheels (last exit ${lastErr})`,
  );
}

function mbOf(dir) {
  let n = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else n += statSync(f).size;
    }
  };
  walk(dir);
  return (n / 1024 / 1024).toFixed(0);
}

async function main() {
  const archArg = process.argv.find((a) => a.startsWith("--arch="));
  const arch = archArg ? archArg.split("=")[1] : hostArch();
  if (!ARCH_MAP[arch]) {
    throw new Error(`Unknown arch '${arch}' (expected arm64|x64)`);
  }
  const out = path.join(BUILD, `bundle-coreml-${arch}`);
  const wheelsBackend = path.join(BUILD, `wheels-backend-macos-${arch}`);
  const wheelsOrt = path.join(BUILD, `wheels-ort-macos-${arch}`);

  console.log(`=== Bundling Lumina (CoreML / Metal) for macOS ${arch} ===`);

  mkdirSync(BUILD, { recursive: true });
  const pyArchive = await ensureStandalonePython(arch);
  downloadWheels(wheelsBackend, REQ_BACKEND, arch);
  downloadWheels(wheelsOrt, REQ_ORT, arch);

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  // 1. relocatable CPython — archive root is usually "python/"
  const extractTmp = path.join(BUILD, `embed-macos-extract-${arch}`);
  rmSync(extractTmp, { recursive: true, force: true });
  extractTarGz(pyArchive, extractTmp);
  const extractedPy = existsSync(path.join(extractTmp, "python"))
    ? path.join(extractTmp, "python")
    : extractTmp;
  copyTree(extractedPy, path.join(out, "python"));
  rmSync(extractTmp, { recursive: true, force: true });

  const pyRoot = path.join(out, "python");
  const pyBin = path.join(pyRoot, "bin", "python3");
  if (!existsSync(pyBin)) {
    throw new Error(`python3 missing after extract: ${pyBin}`);
  }
  chmodSync(pyBin, 0o755);

  // 2. backend deps → site-packages
  const sitePkgs = path.join(pyRoot, "lib", "python3.13", "site-packages");
  mkdirSync(sitePkgs, { recursive: true });
  const backendWheels = listWheels(wheelsBackend).filter(
    (w) => !COMMON_DEPS.has(distName(w)),
  );
  console.log(
    `Extracting ${backendWheels.length} backend wheels -> site-packages`,
  );
  for (const w of backendWheels) {
    extractZip(path.join(wheelsBackend, w), sitePkgs);
  }
  const commonWheels = listWheels(wheelsOrt).filter(
    (w) =>
      RUNTIME_COMMON_DEPS.has(distName(w)) && !w.startsWith("onnxruntime"),
  );
  const skippedOrtDeps = listWheels(wheelsOrt).filter(
    (w) =>
      COMMON_DEPS.has(distName(w)) &&
      !RUNTIME_COMMON_DEPS.has(distName(w)) &&
      !w.startsWith("onnxruntime"),
  );
  console.log(
    `Extracting ${commonWheels.length} common wheels -> site-packages` +
      (skippedOrtDeps.length
        ? ` (skip ${skippedOrtDeps.map(distName).join(", ")})`
        : ""),
  );
  for (const w of commonWheels) {
    extractZip(path.join(wheelsOrt, w), sitePkgs);
  }

  // 3. onnxruntime (CoreML) → ort/coreml/
  const ortWheel = listWheels(wheelsOrt).find((w) =>
    w.startsWith("onnxruntime"),
  );
  if (!ortWheel) throw new Error(`onnxruntime wheel not found in ${wheelsOrt}`);
  const ortRoot = path.join(out, "ort", "coreml");
  extractZip(path.join(wheelsOrt, ortWheel), ortRoot);

  // 4. backend source
  copyTree(
    path.join(ROOT, "python"),
    path.join(out, "backend"),
    (rel) => rel === "__pycache__" || rel.endsWith(".pyc"),
  );

  // 5. manifest
  writeFileSync(
    path.join(out, "manifest.json"),
    JSON.stringify(
      {
        variant: "coreml",
        arch,
        platform: "darwin",
        python: PY_VER,
        onnxruntime: ORT_VER,
        acceleration: "CoreMLExecutionProvider (Metal + Neural Engine)",
        backend: "resources/backend (from python/)",
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  // 6. Drop unused fat (duplicate python bins, sympy, ORT tools, …).
  slimBundle(out, pyRoot, sitePkgs, ortRoot);

  const checks = [
    [pyBin, "python3"],
    [path.join(out, "backend", "run_backend.py"), "run_backend.py"],
    [path.join(sitePkgs, "numpy"), "numpy in site-packages"],
    [path.join(ortRoot, "onnxruntime"), "onnxruntime in ort/coreml"],
  ];
  for (const [p, label] of checks) {
    if (!existsSync(p)) throw new Error(`Bundle check failed: ${label}`);
  }

  // Quick CoreML probe with the bundled interpreter (same arch only).
  if (arch === hostArch()) {
    const probe = spawnSync(
      pyBin,
      [
        "-c",
        "import sys; sys.path.insert(0, r'" +
          ortRoot.replaceAll("'", "\\'") +
          "'); import onnxruntime as o; print(o.__version__); print(o.get_available_providers()); import cv2, numpy, fastapi; print('deps-ok')",
      ],
      { encoding: "utf-8" },
    );
    if (probe.status !== 0) {
      console.warn("ORT probe failed:", probe.stderr || probe.stdout);
    } else {
      console.log("ORT probe:", probe.stdout.trim());
    }
  }

  console.log(`\n=== Done: ${out} ===`);
  console.log(`  python:      ${mbOf(path.join(out, "python"))} MB`);
  console.log(`  ort/coreml:  ${mbOf(ortRoot)} MB`);
  console.log(`  total:       ${mbOf(out)} MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
