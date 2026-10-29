/**
 * electron-builder config for Lumina macOS (CoreML / Metal).
 *
 * Builds separate arm64 and x64 artifacts (native onnxruntime wheels are
 * arch-specific — a single universal binary would need two Python runtimes).
 *
 * Output: dist/macos/Lumina-<version>-mac-<arch>.dmg (+ zip for updates)
 */
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Arch selected via LUMINA_MAC_ARCH (arm64|x64); defaults to host. */
const ARCH = process.env.LUMINA_MAC_ARCH || process.arch;
const ARCH_NORM = ARCH === "x86_64" ? "x64" : ARCH;
if (ARCH_NORM !== "arm64" && ARCH_NORM !== "x64") {
  throw new Error(`LUMINA_MAC_ARCH must be arm64 or x64 (got ${ARCH})`);
}

const BUNDLE = path.join(ROOT, "build", `bundle-coreml-${ARCH_NORM}`);

/** @type {import("electron-builder").Configuration} */
const config = {
  appId: "com.lumina.app",
  productName: "Lumina",
  directories: {
    output: "dist/macos",
    buildResources: "assets",
  },
  files: ["dist/main/**", "dist/preload/**", "dist/renderer/**"],
  publish: {
    provider: "github",
    owner: "lumina-tl",
    repo: "lumina",
    channel: "macos",
  },
  extraResources: [
    {
      from: BUNDLE,
      to: ".",
      filter: ["**/*"],
    },
  ],
  mac: {
    category: "public.app-category.graphics-design",
    target: [
      { target: "dmg", arch: [ARCH_NORM] },
      { target: "zip", arch: [ARCH_NORM] },
    ],
    artifactName: "Lumina-${version}-mac-${arch}.${ext}",
    darkModeSupport: true,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: path.join(ROOT, "assets", "entitlements.mac.plist"),
    entitlementsInherit: path.join(ROOT, "assets", "entitlements.mac.plist"),
    extendInfo: {
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: "Lumina Project",
          CFBundleTypeRole: "Editor",
          LSHandlerRank: "Owner",
          LSItemContentTypes: ["com.lumina.lmi"],
          CFBundleTypeExtensions: ["lmi"],
        },
      ],
      UTExportedTypeDeclarations: [
        {
          UTTypeIdentifier: "com.lumina.lmi",
          UTTypeDescription: "Lumina Project File",
          UTTypeConformsTo: ["public.data"],
          UTTypeTagSpecification: {
            "public.filename-extension": ["lmi"],
          },
        },
      ],
    },
  },
  dmg: {
    artifactName: "Lumina-${version}-mac-${arch}.${ext}",
  },
};

export default config;
