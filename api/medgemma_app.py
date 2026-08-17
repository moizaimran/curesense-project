# ==============================================================================
# api/medgemma_app.py — FastAPI service for MedGemma 4B medical image analysis
#
# Run this on a Kaggle T4 GPU notebook. Preprocessing follows the windowing
# logic from Google's official medgemma notebooks:
#   • CT:    3-channel HU windowing (high_dimensional_ct_hugging_face.ipynb)
#   • MRI:   min-max grayscale normalization
#   • X-ray: single 2D image, no preprocessing
#
# Usage in Kaggle notebook cell:
# ──────────────────────────────
#   import threading, uvicorn
#   from pyngrok import ngrok
#   from api.medgemma_app import app as medgemma_app
#
#   # Start server
#   t = threading.Thread(
#       target=lambda: uvicorn.run(medgemma_app, host="0.0.0.0", port=5002, log_level="warning"),
#       daemon=True,
#   )
#   t.start()
#
#   # Expose via ngrok (set NGROK_AUTH_TOKEN in Kaggle secrets)
#   ngrok.set_auth_token(userdata.get("NGROK_AUTH_TOKEN"))
#   MEDGEMMA_URL = ngrok.connect(5002).public_url
#   print("MedGemma URL:", MEDGEMMA_URL)
#   # → Paste this URL into Backend .env as MEDGEMMA_SERVICE_URL
#
# Required Kaggle packages (add to notebook):
#   !pip install -q fastapi uvicorn pyngrok pydicom pdfplumber
#   Model: google/medgemma-1.5-4b-it (download via transformers)
# ==============================================================================

from __future__ import annotations

import base64
import gc
import io
import json
import os
import zipfile
from typing import Optional

# Must be set before torch is imported. Tells the CUDA allocator to use
# expandable segments so a large contiguous request can be satisfied by
# combining multiple non-contiguous free blocks, avoiding fragmentation OOM.
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="CureSense MedGemma Service", version="1.0")

# ── Model (loaded once on first real request) ─────────────────────────────────

_model     = None
_processor = None


def _load_model():
    global _model, _processor
    if _model is not None:
        return _model, _processor

    import torch
    import torch._dynamo
    from transformers import AutoProcessor, AutoModelForImageTextToText

    # T4 (SM75) cannot compile bfloat16 kernels natively. Without this,
    # the first model.generate() call triggers torch.inductor for each kernel
    # type, fails, and falls back — causing a 2–3 minute delay on first inference.
    torch._dynamo.config.disable = True

    # VRAM before load — confirms both GPUs are visible and have headroom
    if torch.cuda.is_available():
        for i in range(torch.cuda.device_count()):
            free, total = torch.cuda.mem_get_info(i)
            print(f"[MedGemma] GPU {i} VRAM before load: {free/1e9:.1f} GB free / {total/1e9:.1f} GB total")

    print("[MedGemma] Loading model google/medgemma-1.5-4b-it …")
    _processor = AutoProcessor.from_pretrained("google/medgemma-1.5-4b-it")

    _n_gpus = torch.cuda.device_count() if torch.cuda.is_available() else 0
    if _n_gpus >= 2:
        _device_map = {"": 1}
        print("[MedGemma] Pinning to GPU 1 (2 GPUs detected)")
    elif _n_gpus == 1:
        _device_map = {"": 0}
        print("[MedGemma] Pinning to GPU 0 (single GPU)")
    else:
        _device_map = "cpu"
        print("[MedGemma] No GPU — using CPU")

    # bfloat16: same exponent width as float32 (max ~3.4e38 vs float16's ~6.5e4).
    # Vision encoder activations that overflow float16 → inf → all-pad output
    # are handled safely in bfloat16.
    # attn_implementation="eager": T4 does not support native bfloat16 compilation,
    # so SDPA triggers a torch.compile/dynamo path that crashes at generate() time.
    # Eager uses plain Python attention — no JIT compilation, always works on T4.
    _model = AutoModelForImageTextToText.from_pretrained(
        "google/medgemma-1.5-4b-it",
        torch_dtype=torch.bfloat16,
        device_map=_device_map,
        attn_implementation="eager",
    )

    print("[MedGemma] Model loaded (bfloat16 + eager attention).")

    # VRAM after load — confirms the split: GPU 0 still free for Flask, GPU 1 mostly used
    if torch.cuda.is_available():
        for i in range(torch.cuda.device_count()):
            free, total = torch.cuda.mem_get_info(i)
            print(f"[MedGemma] GPU {i} VRAM after load:  {free/1e9:.1f} GB free / {total/1e9:.1f} GB total")

    return _model, _processor


# ── CT preprocessing — 3-channel HU windowing (from Google's official notebook)
# Source: notebooks/high_dimensional_ct_hugging_face.ipynb
#   window_clips = [(-1024, 1024), (-135, 215), (0, 80)]   ← exact notebook values
#   Red   = wide window        clip ( -1024,  1024 )  WL=   0, WW=2048
#   Green = soft tissue window clip (  -135,   215 )  WL=  40, WW= 350
#   Blue  = brain window       clip (     0,    80 )  WL=  40, WW=  80
# Verified against the notebook on 2026-08-16 — values match exactly.
# ─────────────────────────────────────────────────────────────────────────────

MAX_SLICES = 85

# Slices sent to the model per CT/MRI inference request.
#
# Slices are stacked into a single montage and sent as one image, so SigLIP
# always processes exactly 1 image regardless of slice count. Memory is no
# longer slice-count-dependent — 4 slices give better scan coverage.
INFERENCE_SLICES = 4


def _apply_hu_window(arr: np.ndarray, wl: float, ww: float) -> np.ndarray:
    lo, hi = wl - ww / 2.0, wl + ww / 2.0
    return np.clip((arr - lo) / (hi - lo), 0.0, 1.0)


def _ct_slices_to_images(volume: np.ndarray) -> list:
    """Convert CT volume (Z, H, W) to list of 3-channel PIL images."""
    from PIL import Image

    total  = volume.shape[0]
    step   = max(1, total // MAX_SLICES)
    slices = volume[::step][:MAX_SLICES]

    images = []
    for sl in slices:
        r = (_apply_hu_window(sl, wl=0,  ww=2048) * 255).astype(np.uint8)
        g = (_apply_hu_window(sl, wl=40, ww=350)  * 255).astype(np.uint8)
        b = (_apply_hu_window(sl, wl=40, ww=80)   * 255).astype(np.uint8)
        images.append(Image.fromarray(np.stack([r, g, b], axis=-1), mode="RGB"))
    return images


def _mri_slices_to_images(volume: np.ndarray) -> list:
    """Convert MRI volume (Z, H, W) to list of grayscale→RGB PIL images."""
    from PIL import Image

    v_min, v_max = float(volume.min()), float(volume.max())
    if v_max == v_min:
        norm = np.zeros_like(volume, dtype=np.uint8)
    else:
        norm = ((volume - v_min) / (v_max - v_min) * 255).astype(np.uint8)

    total  = norm.shape[0]
    step   = max(1, total // MAX_SLICES)
    slices = norm[::step][:MAX_SLICES]
    return [Image.fromarray(sl, mode="L").convert("RGB") for sl in slices]


def _create_thumbnail_montage(images: list, max_tiles: int = 9, tile_size: int = 128) -> str:
    """
    Pack up to max_tiles evenly-spaced slices into a small JPEG montage.
    Returns a base64-encoded JPEG (~30-100 KB) suitable for Cloudinary storage.
    """
    from PIL import Image

    if not images:
        return ""

    n = min(len(images), max_tiles)
    if len(images) <= n:
        picks = images[:n]
    else:
        indices = [int(round(i / (n - 1) * (len(images) - 1))) for i in range(n)] if n > 1 else [0]
        picks   = [images[i] for i in indices]

    cols    = min(3, n)
    rows    = (n + cols - 1) // cols
    montage = Image.new("RGB", (cols * tile_size, rows * tile_size), (0, 0, 0))

    for idx, img in enumerate(picks):
        thumb = img.copy().convert("RGB")
        thumb.thumbnail((tile_size, tile_size), Image.LANCZOS)
        x = (idx % cols) * tile_size + (tile_size - thumb.width) // 2
        y = (idx // cols) * tile_size + (tile_size - thumb.height) // 2
        montage.paste(thumb, (x, y))

    buf = io.BytesIO()
    montage.save(buf, format="JPEG", quality=65)
    return base64.b64encode(buf.getvalue()).decode()


# ── Prompts ───────────────────────────────────────────────────────────────────

_XRAY_PROMPT = """\
You are a radiologist assistant. Analyze this chest X-ray image carefully.

Respond with ONLY a valid JSON object. Begin your response with { and end with }. No preamble, no explanation outside the JSON.

{
  "summary":          "<2-3 sentence plain-language description of what you see>",
  "findings":         ["<finding 1>", "<finding 2>"],
  "flagged_abnormal": false,
  "impression":       "<overall radiological impression>"
}
Set flagged_abnormal to true ONLY if you see clearly pathological findings (e.g. consolidation, effusion, mass, fracture). Set it to false for a normal or unremarkable X-ray. If findings is empty, flagged_abnormal must be false."""

# CT/MRI prompt is split into instruction (placed before the images) and query
# (placed after), matching the multi-image format in the official notebook.
_CT_MRI_INSTRUCTION = (
    "You are a radiologist assistant analyzing a series of contiguous medical "
    "scan slices. Review all slices provided below carefully before responding."
)

_CT_MRI_QUERY = """\


Based on all the slices provided above, respond with ONLY a valid JSON object. Begin your response with { and end with }. No preamble, no explanation outside the JSON.

{
  "summary":          "<2-3 sentence plain-language description of the overall scan>",
  "findings":         ["<finding 1>", "<finding 2>"],
  "flagged_abnormal": false,
  "impression":       "<overall radiological impression>"
}
Set flagged_abnormal to true ONLY if you see clearly pathological findings (e.g. mass, haemorrhage, infarct, fracture, significant oedema). Set it to false for a normal or unremarkable scan. If findings is empty, flagged_abnormal must be false."""


# ── Text-format fallback parser ───────────────────────────────────────────────

def _parse_text_fallback(text: str) -> dict:
    """
    MedGemma 4B sometimes ignores JSON instructions and returns labeled text:
      FINDINGS: The lungs are clear...
      FLAGGED_ABNORMAL: true
      ABNORMAL_ITEMS: None
      IMPRESSION: Normal chest X-ray.
    This parser extracts those fields into the same dict shape as JSON output.
    """
    import re

    result = {
        "summary":          "",
        "findings":         [],
        "flagged_abnormal": False,
        "impression":       "",
    }

    # Each labeled section runs until the next ALL_CAPS_LABEL: or end of string
    _LABEL_RE = re.compile(
        r'^([A-Z][A-Z_]{2,}):\s*(.*?)(?=\n[A-Z][A-Z_]{2,}:|$)',
        re.MULTILINE | re.DOTALL,
    )

    found_any = False
    for m in _LABEL_RE.finditer(text):
        label = m.group(1)
        value = m.group(2).strip()
        found_any = True

        if label in ("FINDINGS", "SUMMARY"):
            result["summary"] = value
            parts = [p.strip() for p in re.split(r'(?<=[.!?])\s+|\n[-•*]\s*', value) if p.strip()]
            result["findings"] = parts or [value]
        elif label == "FLAGGED_ABNORMAL":
            result["flagged_abnormal"] = value.lower().startswith("true")
        elif label == "IMPRESSION":
            result["impression"] = value

    if not found_any:
        result["summary"] = text.strip()

    return result


# ── Inference helpers ─────────────────────────────────────────────────────────

_LOG_PATH = "/tmp/medgemma_debug.log"

def _log(msg: str) -> None:
    """Write a timestamped line to the debug log file (visible from Colab cells)."""
    import datetime
    line = f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}\n"
    with open(_LOG_PATH, "a") as f:
        f.write(line)


def _run_inference(prompt: str, image) -> dict:
    """Run MedGemma on a single PIL image (X-ray path)."""
    import torch

    model, processor = _load_model()

    messages = [{"role": "user", "content": [
        {"type": "image", "image": image},
        {"type": "text",  "text":  prompt},
    ]}]

    text   = processor.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)
    inputs = processor(text=text, images=image, return_tensors="pt").to(model.device)
    inputs.pop("token_type_ids", None)
    if "pixel_values" in inputs:
        inputs["pixel_values"] = inputs["pixel_values"].to(dtype=torch.bfloat16)

    output_ids = None
    prompt_len = inputs["input_ids"].shape[1]
    _log(f"xray prompt_len={prompt_len} pixel_values dtype={inputs['pixel_values'].dtype if 'pixel_values' in inputs else 'none'}")

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    try:
        with torch.inference_mode():
            output_ids = model.generate(**inputs, max_new_tokens=500, do_sample=False)
        generated_len = output_ids.shape[1] - prompt_len
        _log(f"xray generated_len={generated_len} first_10={output_ids[0][prompt_len:prompt_len+10].tolist()}")
        output = processor.decode(output_ids[0][prompt_len:], skip_special_tokens=True)
        _log(f"xray output (first 300): {output[:300]!r}")
    finally:
        del inputs
        if output_ids is not None:
            del output_ids
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    start = output.find("{")
    end   = output.rfind("}") + 1

    if start == -1 or end == 0:
        return _parse_text_fallback(output.strip())

    try:
        return json.loads(output[start:end])
    except json.JSONDecodeError:
        return _parse_text_fallback(output.strip())


def _run_multi_slice_inference(instruction: str, query: str, images: list) -> dict:
    """
    Run MedGemma on multiple CT/MRI slices packed into a single montage image.

    MedGemma 1.5-4B was fine-tuned on single-image tasks. Passing multiple
    images via the multi-image message format causes the model to refuse with
    "I am a text-based AI and cannot process medical images." Stacking slices
    into one image uses the identical single-image path that works for X-ray.
    """
    import torch
    from PIL import Image as PILImage

    model, processor = _load_model()

    n    = len(images)
    TILE = 448  # each slice is scaled to TILE×TILE; processor resizes combined to 896×896
    canvas = PILImage.new("RGB", (TILE, TILE * n))
    for i, img in enumerate(images):
        canvas.paste(img.resize((TILE, TILE), PILImage.LANCZOS), (0, i * TILE))

    prompt = (
        f"{instruction} "
        f"The image shows {n} contiguous scan slices stacked vertically, top to bottom.\n\n"
        f"{query}"
    )
    messages = [{"role": "user", "content": [
        {"type": "image", "image": canvas},
        {"type": "text",  "text":  prompt},
    ]}]

    text   = processor.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)
    inputs = processor(text=text, images=canvas, return_tensors="pt").to(model.device)
    inputs.pop("token_type_ids", None)
    if "pixel_values" in inputs:
        inputs["pixel_values"] = inputs["pixel_values"].to(dtype=torch.bfloat16)

    output_ids = None
    prompt_len = inputs["input_ids"].shape[1]
    _log(f"ct_mri prompt_len={prompt_len} n_slices={n} canvas={canvas.size}")

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    try:
        with torch.inference_mode():
            output_ids = model.generate(**inputs, max_new_tokens=500, do_sample=False)
        generated_len = output_ids.shape[1] - prompt_len
        _log(f"ct_mri generated_len={generated_len} first_10={output_ids[0][prompt_len:prompt_len+10].tolist()}")
        output = processor.decode(output_ids[0][prompt_len:], skip_special_tokens=True)
        _log(f"ct_mri output (first 500): {output[:500]!r}")
    finally:
        del inputs, canvas
        if output_ids is not None:
            del output_ids
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    start = output.find("{")
    end   = output.rfind("}") + 1

    if start == -1 or end == 0:
        return _parse_text_fallback(output.strip())

    try:
        return json.loads(output[start:end])
    except json.JSONDecodeError:
        return _parse_text_fallback(output.strip())


# ── ZIP extraction ────────────────────────────────────────────────────────────

def _is_zip(data: bytes) -> bool:
    """ZIP files start with the magic bytes PK\x03\x04."""
    return data[:4] == b'PK\x03\x04'


def _load_volume_from_zip(zip_bytes: bytes, modality: str) -> list:
    """
    Extract a medical image volume from a ZIP archive.

    Handles the standard DICOM disc/CD structure where files inside a DICOM/
    subfolder have no extension (named IM0001, IM0002, ...).

    Priority order:
      1. Files with .dcm extension
      2. Extensionless files whose first 132 bytes contain the DICOM magic 'DICM'
         (covers standard hospital CD exports: DICOM/IM0001, DICOM/IM0002 ...)
      3. Standard images (.jpg / .jpeg / .png) — sorted by filename
    """
    from PIL import Image

    _DCM_EXTS = {'.dcm'}
    _IMG_EXTS = {'.jpg', '.jpeg', '.png'}

    # DICOMDIR and viewer-software blobs to skip even if extensionless
    _SKIP_NAMES = {'dicomdir', 'dicom_dir'}

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        all_names = [n for n in zf.namelist() if not n.endswith('/')]

        # Pass 1: files with explicit .dcm extension
        dcm_names = sorted([n for n in all_names if _ext(n) in _DCM_EXTS])

        # Pass 2: extensionless files — peek at magic bytes to detect DICOM
        # DICOM magic: bytes 128-131 == b'DICM'
        if not dcm_names:
            candidates = [
                n for n in all_names
                if _ext(n) == ''
                and n.split('/')[-1].lower() not in _SKIP_NAMES
            ]
            for name in candidates:
                try:
                    header = zf.read(name)[:132]
                    if len(header) >= 132 and header[128:132] == b'DICM':
                        dcm_names.append(name)
                except Exception:
                    pass
            dcm_names.sort()

        # Case 8 guard — Philips PAR/REC format
        par_files = [n for n in all_names if _ext(n) in {'.par', '.rec'}]
        if par_files:
            raise ValueError(
                "Philips PAR/REC format is not supported. "
                "Please ask your radiologist or imaging centre to export the scan as DICOM (.dcm) instead."
            )

        if dcm_names:
            return _dicoms_from_zip(zf, dcm_names, modality)

        # Pass 3: plain image files
        img_names = sorted([n for n in all_names if _ext(n) in _IMG_EXTS])
        if img_names:
            images = []
            for name in img_names:
                try:
                    images.append(Image.open(io.BytesIO(zf.read(name))).convert("RGB"))
                except Exception:
                    pass
            if images:
                return images

    raise ValueError(
        "No recognised medical image files found in the ZIP. "
        "Expected: a DICOM series (.dcm files or a DICOM/ folder from a hospital CD), "
        "or JPEG/PNG image exports."
    )


def _ext(name: str) -> str:
    return '.' + name.rsplit('.', 1)[-1].lower() if '.' in name.split('/')[-1] else ''


def _dicoms_from_zip(zf: zipfile.ZipFile, dcm_names: list, modality: str) -> list:
    """Read, sort, and preprocess all DICOM slices from an open ZipFile."""
    import pydicom

    slices = []
    for name in dcm_names:
        try:
            dcm = pydicom.dcmread(io.BytesIO(zf.read(name)))
            slices.append(dcm)
        except Exception:
            continue

    if not slices:
        raise ValueError(
            "No readable DICOM slices found. "
            "The files may be old-format DICOM (pre-1993) without the standard header, "
            "which is not supported. Please ask your imaging centre for a modern DICOM export."
        )

    # Multiple series in one ZIP — auto-select the largest (most slices).
    # Hospital exports typically bundle scout + axial + coronal + sagittal in one study.
    # The axial series always has the most slices and is the primary diagnostic series.
    series_map: dict = {}
    for dcm in slices:
        uid = getattr(dcm, 'SeriesInstanceUID', '__none__')
        series_map.setdefault(uid, []).append(dcm)
    if len(series_map) > 1:
        best_uid = max(series_map, key=lambda uid: len(series_map[uid]))
        slices   = series_map[best_uid]
        print(f"[MedGemma] {len(series_map)} series detected — auto-selected largest ({len(slices)} slices)")

    def _sort_key(dcm):
        try:
            return float(dcm.ImagePositionPatient[2])
        except Exception:
            pass
        try:
            return float(dcm.InstanceNumber)
        except Exception:
            return 0.0

    slices.sort(key=_sort_key)

    arrays = []
    for dcm in slices:
        try:
            arr = pydicom.pixels.apply_rescale(dcm.pixel_array, dcm).astype(np.float32)
        except Exception:
            try:
                arr = dcm.pixel_array.astype(np.float32)
            except Exception:
                continue  # skip slices whose pixel data can't be decoded
        if arr.ndim == 2:
            arrays.append(arr)

    if not arrays:
        raise ValueError(
            "Could not decode the DICOM pixel data. "
            "The scan uses JPEG Lossless compression which requires pylibjpeg. "
            "Add this line to your Kaggle notebook install cell and re-run: "
            "!pip install -q pylibjpeg pylibjpeg-libjpeg"
        )

    volume = np.stack(arrays)  # (Z, H, W)
    return _ct_slices_to_images(volume) if modality.upper() == "CT" else _mri_slices_to_images(volume)


# ── Endpoints ─────────────────────────────────────────────────────────────────

class XrayRequest(BaseModel):
    image_base64: str


class CtMriRequest(BaseModel):
    image_base64: str
    modality:     Optional[str] = "ct"  # "ct" or "mri"


@app.get("/health")
def health():
    return {"status": "ok", "model": "medgemma-1.5-4b-it"}


@app.post("/analyze/xray")
def analyze_xray(req: XrayRequest):
    from PIL import Image

    img_bytes = base64.b64decode(req.image_base64)
    img       = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    return _run_inference(_XRAY_PROMPT, img)


@app.post("/analyze/ct-mri")
def analyze_ct_mri(req: CtMriRequest):
    from PIL import Image

    img_bytes = base64.b64decode(req.image_base64)
    modality  = (req.modality or "ct").upper()

    volume_images = None

    # ── Path 1: ZIP archive (DICOM series or image folder) ────────────────────
    if _is_zip(img_bytes):
        try:
            volume_images = _load_volume_from_zip(img_bytes, modality)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc))

    # ── Path 2: Single DICOM file ─────────────────────────────────────────────
    if volume_images is None:
        try:
            import pydicom
            dcm = pydicom.dcmread(io.BytesIO(img_bytes))
            # apply_rescale converts raw stored pixels → Hounsfield units using the
            # RescaleSlope/RescaleIntercept DICOM tags, matching Google's notebook.
            volume = pydicom.pixels.apply_rescale(dcm.pixel_array, dcm).astype(np.float32)
            if volume.ndim == 2:
                volume = volume[np.newaxis, ...]  # single slice → (1, H, W)
            volume_images = _ct_slices_to_images(volume) if modality == "CT" else _mri_slices_to_images(volume)
        except Exception:
            pass

    # ── Path 3: Single JPEG / PNG ─────────────────────────────────────────────
    if volume_images is None:
        img           = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        volume_images = [img]

    # Select INFERENCE_SLICES evenly-spaced slices from the preprocessed list.
    # Uses the same round-based distribution as the official notebook's slice sampler.
    n = len(volume_images)
    if n <= INFERENCE_SLICES:
        selected_slices = volume_images
    else:
        indices         = [int(round(i / (INFERENCE_SLICES - 1) * (n - 1))) for i in range(INFERENCE_SLICES)]
        selected_slices = [volume_images[idx] for idx in indices]

    try:
        result = _run_multi_slice_inference(_CT_MRI_INSTRUCTION, _CT_MRI_QUERY, selected_slices)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}")

    result["modality"]      = modality
    result["model_used"]    = "medgemma-1.5-4b"
    try:
        result["thumbnail_b64"] = _create_thumbnail_montage(selected_slices)
    except Exception:
        result["thumbnail_b64"] = ""

    return result
