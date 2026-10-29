"""ONNX Runtime EP resolution + GPU detection."""
from __future__ import annotations

import os
import platform
import subprocess
import sys
import sysconfig
from pathlib import Path
from typing import Any, Optional

from utils.logger import log


def _register_nvidia_dlls() -> None:
    """Prepend pip-installed CUDA DLL dirs to PATH on Windows."""
    if os.name != "nt":
        return
    try:
        import onnxruntime as _ort

        ort_root = Path(_ort.__file__).resolve().parent
        # Roots that may contain a sibling `nvidia/` tree: the folder the
        # onnxruntime package sits in, plus site-packages purelib.
        candidates = [ort_root.parent]
        purelib = Path(sysconfig.get_paths().get("purelib", ""))
        if purelib not in candidates:
            candidates.append(purelib)
        bins = sorted(
            {
                str(d)
                for root in candidates
                for d in root.glob("nvidia/*/bin")
                if root.is_dir()
            }
        )
        if not bins:
            return
        existing = os.environ.get("PATH", "")
        os.environ["PATH"] = os.pathsep.join(bins) + os.pathsep + existing
    except Exception:
        pass


_register_nvidia_dlls()

try:  # pragma: no cover - import failure only on broken installs
    import onnxruntime as ort
except ImportError:
    ort = None

_GPU_NAMES_CACHE: Optional[list[str]] = None
_DEVICE_CACHE: Optional[dict] = None

# Canonical ORT provider names.
_CUDA = "CUDAExecutionProvider"
_DML = "DmlExecutionProvider"
_COREML = "CoreMLExecutionProvider"
_CPU = "CPUExecutionProvider"


def get_available_providers() -> list[str]:
    """EPs the installed wheel supports."""
    if ort is None:
        return []
    try:
        return list(ort.get_available_providers())
    except Exception as e:
        log.warn(f"onnxruntime provider probe failed: {e}")
        return []


def resolve_providers(prefer: Optional[str] = None) -> list[str]:
    """Provider list for InferenceSession, in priority order.

    macOS GPU acceleration uses CoreMLExecutionProvider (Metal + Neural
    Engine under the hood). There is no separate Metal EP in ONNX Runtime.
    """
    env = os.environ.get("LUMINA_EP", "").strip().lower()
    if env in ("cuda", "dml", "coreml", "metal", "cpu"):
        pref = "coreml" if env == "metal" else env
    elif not prefer:
        pref = "auto"
    else:
        pref = prefer.strip().lower()
        if pref == "metal":
            pref = "coreml"

    avail = get_available_providers()

    if pref == "cpu":
        return [_CPU]
    if pref == "cuda":
        # Prefer CUDA; on Apple, CoreML is the GPU path (skip DML — same
        # models that reject DirectML often still run on CoreML).
        eps: list[str] = []
        if _CUDA in avail:
            eps.append(_CUDA)
        if _COREML in avail:
            eps.append(_COREML)
        eps.append(_CPU)
        return eps
    if pref == "dml":
        return [_DML, _CPU] if _DML in avail else [_CPU]
    if pref == "coreml":
        return [_COREML, _CPU] if _COREML in avail else [_CPU]

    # auto: CUDA → CoreML (Metal) → DirectML → CPU.
    # At most one GPU EP is typically present in a given wheel.
    eps = []
    if _CUDA in avail:
        eps.append(_CUDA)
    if _COREML in avail:
        eps.append(_COREML)
    if _DML in avail:
        eps.append(_DML)
    eps.append(_CPU)
    log.debug(f"Providers resolved: prefer={pref}, avail={avail}, result={eps}")
    return eps


def make_session_options() -> Any:
    """Session options shared by every model (graph fusion enabled)."""
    if ort is None:  # pragma: no cover
        raise RuntimeError("onnxruntime is not installed")
    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return opts


def _coreml_provider_options() -> dict[str, str]:
    """CoreML options: enable GPU/ANE compute units when available."""
    # "ALL" = CPU + GPU (Metal) + Apple Neural Engine.
    # Falls back gracefully on Intel Macs without ANE.
    return {
        "ModelFormat": "MLProgram",
        "MLComputeUnits": "ALL",
        "RequireStaticInputShapes": "0",
        "EnableOnSubgraphs": "1",
    }


def create_session(
    model_path,
    prefer: Optional[str] = None,
    sess_options: Optional[Any] = None,
) -> Any:
    """Build InferenceSession with resolved providers; falls back to CPU on failure."""
    if ort is None:  # pragma: no cover
        raise RuntimeError("onnxruntime is not installed")
    providers = resolve_providers(prefer)
    if sess_options is None:
        sess_options = make_session_options()
    assert sess_options is not None
    # Cache the optimized graph to disk — next load skips graph fusion.
    model_str = str(model_path)
    ep_tag = providers[0].replace("ExecutionProvider", "").lower()
    opt_path = f"{model_str}.{ep_tag}.opt"
    sess_options.optimized_model_filepath = opt_path
    cached = os.path.isfile(opt_path)
    log.debug(
        f"create_session: {os.path.basename(model_str)}, providers={providers}"
        + (", using cached optimized model" if cached else ", building optimized graph")
    )

    # CoreML accepts (name, options) tuples; others are plain strings.
    session_providers: list = []
    for p in providers:
        if p == _COREML:
            session_providers.append((p, _coreml_provider_options()))
        else:
            session_providers.append(p)

    try:
        session = ort.InferenceSession(
            str(model_path),
            sess_options=sess_options,
            providers=session_providers,
        )
    except Exception as e:
        if providers == [_CPU]:
            raise
        log.warn(
            f"GPU session failed ({e}); falling back to CPU for "
            f"{os.path.basename(str(model_path))}"
        )
        session = ort.InferenceSession(
            str(model_path),
            sess_options=sess_options,
            providers=[_CPU],
        )
    log.info(
        f"ONNX session: {os.path.basename(str(model_path))} -> "
        f"EP {session.get_providers()}"
    )
    return session


def _windows_gpu_names() -> list[str]:
    """GPU names via Win32_VideoController (PowerShell)."""
    global _GPU_NAMES_CACHE
    if _GPU_NAMES_CACHE is not None:
        return _GPU_NAMES_CACHE
    names: list[str] = []
    try:
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        out = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }",
            ],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=flags,
        )
        names = [line.strip() for line in out.stdout.splitlines() if line.strip()]
        if names:
            log.info(f"Detected GPU(s): {', '.join(names)}")
    except Exception as e:
        log.debug(f"GPU name detection failed: {e}")
    _GPU_NAMES_CACHE = names
    return names


def _macos_gpu_names() -> list[str]:
    """GPU / chip names via system_profiler (Metal-capable adapters)."""
    global _GPU_NAMES_CACHE
    if _GPU_NAMES_CACHE is not None:
        return _GPU_NAMES_CACHE
    names: list[str] = []
    try:
        out = subprocess.run(
            ["system_profiler", "SPDisplaysDataType", "-detailLevel", "mini"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        for line in out.stdout.splitlines():
            stripped = line.strip()
            if stripped.startswith("Chipset Model:"):
                name = stripped.split(":", 1)[1].strip()
                if name:
                    names.append(name)
        # Apple Silicon often shows under SPHardware when displays is empty.
        if not names:
            hw = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            brand = hw.stdout.strip()
            if brand:
                names.append(brand)
            elif platform.machine() in ("arm64", "aarch64"):
                names.append("Apple Silicon")
        if names:
            log.info(f"Detected GPU(s): {', '.join(names)}")
    except Exception as e:
        log.debug(f"macOS GPU name detection failed: {e}")
    _GPU_NAMES_CACHE = names
    return names


def _pick_gpu(names: list[str], provider: str) -> Optional[str]:
    """Pick the GPU to display, preferring discrete adapters."""
    skip = (
        "microsoft basic",
        "basic render",
        "remote display",
        "virtualbox",
        "vmware",
        "cirrus",
        "paravirtual",
    )
    usable = [n for n in names if not any(s in n.lower() for s in skip)]
    if not usable:
        return None
    discrete = (
        "nvidia", "geforce", "radeon", "rtx", "gtx", "quadro", "arc",
        "apple", "m1", "m2", "m3", "m4", "m5",
    )
    if provider == "cuda":
        for n in usable:
            low = n.lower()
            if "nvidia" in low or "geforce" in low or "quadro" in low:
                return n
    if provider == "coreml":
        for n in usable:
            low = n.lower()
            if any(
                k in low
                for k in (
                    "apple", "m1", "m2", "m3", "m4", "m5",
                    "radeon", "intel iris", "intel uhd",
                )
            ):
                return n
    for n in usable:
        low = n.lower()
        if any(k in low for k in discrete):
            return n
    return usable[0]


def get_device_info() -> dict:
    """Probe active EP + GPU names. Cheap after the first call (cached)."""
    global _DEVICE_CACHE
    if _DEVICE_CACHE is not None:
        return dict(_DEVICE_CACHE)

    eps = get_available_providers()
    log.debug(f"Device info: available providers={eps}")
    # An explicit LUMINA_EP=cpu override (GPU toggle off) forces CPU even
    # when the wheel ships a GPU EP.
    forced_cpu = os.environ.get("LUMINA_EP", "").strip().lower() == "cpu"
    has_gpu_ep = (
        (_CUDA in eps or _DML in eps or _COREML in eps) and not forced_cpu
    )

    gpus: list[str] = []
    if has_gpu_ep:
        if os.name == "nt":
            gpus = _windows_gpu_names()
        elif sys.platform == "darwin":
            gpus = _macos_gpu_names()

    if not forced_cpu and _CUDA in eps:
        provider, ep = "cuda", _CUDA
    elif not forced_cpu and _COREML in eps:
        provider, ep = "coreml", _COREML
    elif not forced_cpu and _DML in eps:
        provider, ep = "dml", _DML
    else:
        provider, ep = "cpu", _CPU

    info = {
        "provider": provider,  # "cuda" | "dml" | "coreml" | "cpu"
        "ep": ep,              # full ORT provider name
        "providers": list(eps),  # every EP the wheel supports (priority order)
        "gpus": gpus,
        "gpuName": _pick_gpu(gpus, provider),
        "onnxRuntime": ort.__version__ if ort else None,
        # GPU EP is available in this wheel — actual per-session success is
        # verified lazily when each model loads (create_session fallback).
        "accelerated": provider != "cpu",
    }
    _DEVICE_CACHE = info
    return dict(info)


def configure(use_gpu: bool) -> dict:
    """Set/clear the ``LUMINA_EP`` override for this backend process.

    Effective immediately for every session created afterwards
    (:func:`resolve_providers` reads the env per call; the keep-one-hot
    policy unloads models after each step, so the next pipeline step picks
    up the new EP). Also resets the device-info cache. Returns the updated
    :func:`get_device_info` result.
    """
    global _DEVICE_CACHE
    if use_gpu:
        os.environ.pop("LUMINA_EP", None)
        log.info("GPU acceleration enabled (LUMINA_EP cleared -> auto)")
    else:
        os.environ["LUMINA_EP"] = "cpu"
        log.info("GPU acceleration disabled (LUMINA_EP=cpu)")
    _DEVICE_CACHE = None
    return get_device_info()
