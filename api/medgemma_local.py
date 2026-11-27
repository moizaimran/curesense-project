# ==============================================================================
# api/medgemma_local.py — Local Flask preprocessing + SageMaker inference
#
# Runs on your LAPTOP (port 5001). No GPU needed locally.
# All heavy preprocessing (DICOM, CT windowing, ZIP, montage) runs here on CPU.
# Only the final preprocessed image is sent to SageMaker for model inference.
#
# Backend/.env:
#   MEDGEMMA_SERVICE_URL=http://localhost:5001
#
# Environment variables needed:
#   SAGEMAKER_ENDPOINT  — e.g. curesense-medgemma
#   AWS_DEFAULT_REGION  — e.g. ap-southeast-2
#   AWS_PROFILE         — e.g. curesense  (uses ~/.aws credentials)
# ==============================================================================

from __future__ import annotations

import base64
import gc
import io
import json
import os
import zipfile
from typing import Optional

import boto3
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="CureSense MedGemma Local Preprocessor", version="2.0")

SAGEMAKER_ENDPOINT = os.environ.get("SAGEMAKER_ENDPOINT", "curesense-medgemma")
AWS_REGION         = os.environ.get("AWS_DEFAULT_REGION", "ap-southeast-2")

_sm_client = None

def _get_sm_client():
    global _sm_client
    if _sm_client is None:
        _sm_client = boto3.client("sagemaker-runtime", region_name=AWS_REGION)
    return _sm_client


# ── Prompts (identical to medgemma_app.py) ────────────────────────────────────

_XRAY_PROMPT = """\
You are a radiologist assistant. Analyze this chest X-ray image carefully.

Respond with ONLY a valid JSON object. Begin your response with { and end with }. No preamble, no explanation outside the JSON.

{
  "summary":          "<2-3 sentence plain-language description of what you see>",
  "findings":         ["<finding 1>", "<finding 2>"],
  "flagged_abnormal": false,
  "impression":       "<overall radiological impression>"
}
Set flagged_abnormal to true ONLY if you see clearly pathological findings."""

_CT_MRI_PROMPT_TEMPLATE = """\
You are a radiologist assistant analyzing a series of contiguous medical scan slices. \
The image shows {n} contiguous scan slices stacked vertically, top to bottom.

Based on all the slices provided, respond with ONLY a valid JSON object. Begin with {{ and end with }}.

{{
  "summary":          "<2-3 sentence plain-language description of the overall scan>",
  "findings":         ["<finding 1>", "<finding 2>"],
  "flagged_abnormal": false,
  "impression":       "<overall radiological impression>"
}}
Set flagged_abnormal to true ONLY if you see clearly pathological findings."""


# ── Preprocessing (CPU — runs locally) ───────────────────────────────────────

MAX_SLICES      = 85
INFERENCE_SLICES = 4
TILE             = 448


def _apply_hu_window(arr, wl, ww):
    lo, hi = wl - ww / 2.0, wl + ww / 2.0
    return np.clip((arr - lo) / (hi - lo), 0.0, 1.0)


def _ct_slices_to_images(volume):
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


def _mri_slices_to_images(volume):
    from PIL import Image
    v_min, v_max = float(volume.min()), float(volume.max())
    norm = np.zeros_like(volume, dtype=np.uint8) if v_max == v_min \
           else ((volume - v_min) / (v_max - v_min) * 255).astype(np.uint8)
    total  = norm.shape[0]
    step   = max(1, total // MAX_SLICES)
    slices = norm[::step][:MAX_SLICES]
    return [Image.fromarray(sl, mode="L").convert("RGB") for sl in slices]


def _build_montage(images):
    """Stack INFERENCE_SLICES evenly-spaced slices into one vertical image."""
    from PIL import Image as PILImage
    n = len(images)
    if n <= INFERENCE_SLICES:
        selected = images
    else:
        indices  = [int(round(i / (INFERENCE_SLICES - 1) * (n - 1))) for i in range(INFERENCE_SLICES)]
        selected = [images[i] for i in indices]

    canvas = PILImage.new("RGB", (TILE, TILE * len(selected)))
    for i, img in enumerate(selected):
        canvas.paste(img.resize((TILE, TILE), PILImage.LANCZOS), (0, i * TILE))
    return canvas, len(selected)


def _image_to_b64(img) -> str:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


def _is_zip(data: bytes) -> bool:
    return data[:4] == b'PK\x03\x04'


def _ext(name):
    return '.' + name.rsplit('.', 1)[-1].lower() if '.' in name.split('/')[-1] else ''


def _load_volume_from_zip(zip_bytes, modality):
    from PIL import Image
    _DCM_EXTS  = {'.dcm'}
    _IMG_EXTS  = {'.jpg', '.jpeg', '.png'}
    _SKIP_NAMES = {'dicomdir', 'dicom_dir'}

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        all_names = [n for n in zf.namelist() if not n.endswith('/')]
        dcm_names = sorted([n for n in all_names if _ext(n) in _DCM_EXTS])

        if not dcm_names:
            candidates = [n for n in all_names if _ext(n) == ''
                          and n.split('/')[-1].lower() not in _SKIP_NAMES]
            for name in candidates:
                try:
                    header = zf.read(name)[:132]
                    if len(header) >= 132 and header[128:132] == b'DICM':
                        dcm_names.append(name)
                except Exception:
                    pass
            dcm_names.sort()

        if dcm_names:
            return _dicoms_from_zip(zf, dcm_names, modality)

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

    raise ValueError("No recognised medical image files found in the ZIP.")


def _dicoms_from_zip(zf, dcm_names, modality):
    import pydicom
    slices = []
    for name in dcm_names:
        try:
            slices.append(pydicom.dcmread(io.BytesIO(zf.read(name))))
        except Exception:
            continue
    if not slices:
        raise ValueError("No readable DICOM slices found.")

    series_map = {}
    for dcm in slices:
        uid = getattr(dcm, 'SeriesInstanceUID', '__none__')
        series_map.setdefault(uid, []).append(dcm)
    if len(series_map) > 1:
        best_uid = max(series_map, key=lambda u: len(series_map[u]))
        slices   = series_map[best_uid]

    def _sort_key(dcm):
        try:    return float(dcm.ImagePositionPatient[2])
        except Exception: pass
        try:    return float(dcm.InstanceNumber)
        except Exception: return 0.0

    slices.sort(key=_sort_key)
    arrays = []
    for dcm in slices:
        try:
            arr = pydicom.pixels.apply_rescale(dcm.pixel_array, dcm).astype(np.float32)
        except Exception:
            try:    arr = dcm.pixel_array.astype(np.float32)
            except Exception: continue
        if arr.ndim == 2:
            arrays.append(arr)

    if not arrays:
        raise ValueError("Could not decode DICOM pixel data.")

    volume = np.stack(arrays)
    return _ct_slices_to_images(volume) if modality.upper() == "CT" else _mri_slices_to_images(volume)


# ── SageMaker call ────────────────────────────────────────────────────────────

def _call_sagemaker(image_b64: str, prompt: str) -> str:
    payload = json.dumps({"image_base64": image_b64, "prompt": prompt})
    resp    = _get_sm_client().invoke_endpoint(
        EndpointName = SAGEMAKER_ENDPOINT,
        ContentType  = "application/json",
        Accept       = "application/json",
        Body         = payload,
    )
    result = json.loads(resp["Body"].read())
    if "error" in result and result["error"]:
        raise RuntimeError(f"SageMaker error: {result['error']}")
    return result.get("raw_text", "")


def _parse_output(raw: str) -> dict:
    start = raw.find("{")
    end   = raw.rfind("}") + 1
    if start == -1 or end == 0:
        return {"summary": raw.strip(), "findings": [], "flagged_abnormal": False, "impression": ""}
    try:
        return json.loads(raw[start:end])
    except json.JSONDecodeError:
        return {"summary": raw.strip(), "findings": [], "flagged_abnormal": False, "impression": ""}


# ── Endpoints ─────────────────────────────────────────────────────────────────

class XrayRequest(BaseModel):
    image_base64: str


class CtMriRequest(BaseModel):
    image_base64: str
    modality:     Optional[str] = "ct"


@app.get("/health")
def health():
    return {"status": "ok", "mode": "local-preprocess+sagemaker", "endpoint": SAGEMAKER_ENDPOINT}


@app.post("/analyze/xray")
def analyze_xray(req: XrayRequest):
    from PIL import Image
    img_bytes = base64.b64decode(req.image_base64)
    img       = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    img_b64   = _image_to_b64(img)
    raw       = _call_sagemaker(img_b64, _XRAY_PROMPT)
    return _parse_output(raw)


@app.post("/analyze/ct-mri")
def analyze_ct_mri(req: CtMriRequest):
    from PIL import Image
    img_bytes = base64.b64decode(req.image_base64)
    modality  = (req.modality or "ct").upper()
    volume_images = None

    if _is_zip(img_bytes):
        try:
            volume_images = _load_volume_from_zip(img_bytes, modality)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc))

    if volume_images is None:
        try:
            import pydicom
            dcm    = pydicom.dcmread(io.BytesIO(img_bytes))
            volume = pydicom.pixels.apply_rescale(dcm.pixel_array, dcm).astype(np.float32)
            if volume.ndim == 2:
                volume = volume[np.newaxis, ...]
            volume_images = _ct_slices_to_images(volume) if modality == "CT" else _mri_slices_to_images(volume)
        except Exception:
            pass

    if volume_images is None:
        volume_images = [Image.open(io.BytesIO(img_bytes)).convert("RGB")]

    montage, n_slices = _build_montage(volume_images)
    montage_b64       = _image_to_b64(montage)
    prompt            = _CT_MRI_PROMPT_TEMPLATE.format(n=n_slices)

    try:
        raw = _call_sagemaker(montage_b64, prompt)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"SageMaker inference failed: {exc}")

    result = _parse_output(raw)
    result["modality"]   = modality
    result["model_used"] = "medgemma-1.5-4b"
    return result
