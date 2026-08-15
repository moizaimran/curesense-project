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
import io
import json
from typing import Optional

import numpy as np
from fastapi import FastAPI
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
    from transformers import AutoProcessor, AutoModelForImageTextToText

    # VRAM before load — confirms both GPUs are visible and have headroom
    if torch.cuda.is_available():
        for i in range(torch.cuda.device_count()):
            free, total = torch.cuda.mem_get_info(i)
            print(f"[MedGemma] GPU {i} VRAM before load: {free/1e9:.1f} GB free / {total/1e9:.1f} GB total")

    print("[MedGemma] Loading model google/medgemma-1.5-4b-it …")
    _processor = AutoProcessor.from_pretrained("google/medgemma-1.5-4b-it")

    # Pin to GPU 1 so MedGemma never competes with Flask's Whisper + GLiNER on GPU 0.
    # Fallback: Kaggle occasionally provisions only 1 T4 despite the "2x T4" setting —
    # device_map={"": 1} would raise an error in that case, so we detect and fall back.
    _n_gpus = torch.cuda.device_count() if torch.cuda.is_available() else 0
    if _n_gpus >= 2:
        _device_map = {"": 1}
        print("[MedGemma] Pinning to GPU 1 (2 GPUs detected)")
    else:
        print(f"[MedGemma] WARNING: only {_n_gpus} GPU(s) available — falling back to device_map='auto'")
        _device_map = "auto"

    _model = AutoModelForImageTextToText.from_pretrained(
        "google/medgemma-1.5-4b-it",
        torch_dtype=torch.bfloat16,
        device_map=_device_map,
    )
    print("[MedGemma] Model loaded.")

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

# Slices sent to the model per CT/MRI request.
# T4 memory budget: ~8 GB used by 4B weights leaves ~8 GB for activations.
# Each image produces 256 vision tokens; 10 images → 2 560 tokens → ~560 MB KV
# cache across 28 layers.  Inference time ≈ 60-90 s on T4 — within the 180 s
# axios timeout set in imageController.js.  Raising above 15 risks OOM.
INFERENCE_SLICES = 10


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


# ── Prompts ───────────────────────────────────────────────────────────────────

_XRAY_PROMPT = """\
You are a radiologist assistant. Analyze this chest X-ray image carefully.

Return ONLY a valid JSON object with these exact keys:
{
  "summary":          "<2-3 sentence plain-language description>",
  "findings":         ["<finding 1>", "..."],
  "flagged_abnormal": true or false,
  "abnormal_items":   ["<abnormal finding>", "..."],
  "impression":       "<overall radiological impression>",
  "disclaimer":       "This AI analysis is for informational purposes only and does not constitute a medical diagnosis. Please consult a radiologist.",
  "model_used":       "medgemma-1.5-4b"
}
Flag abnormal only if clearly pathological findings are visible."""

# CT/MRI prompt is split into instruction (placed before the images) and query
# (placed after), matching the multi-image format in the official notebook.
_CT_MRI_INSTRUCTION = (
    "You are a radiologist assistant analyzing a series of contiguous medical "
    "scan slices. Review all slices provided below carefully before responding."
)

_CT_MRI_QUERY = """\


Based on all the slices provided above, return ONLY a valid JSON object with these exact keys:
{
  "summary":          "<2-3 sentence plain-language description of the overall scan>",
  "modality":         "<CT or MRI>",
  "findings":         ["<finding 1>", "..."],
  "flagged_abnormal": true or false,
  "abnormal_items":   ["<abnormal finding>", "..."],
  "impression":       "<overall radiological impression>",
  "disclaimer":       "This AI analysis is for informational purposes only and does not constitute a medical diagnosis. Please consult a radiologist.",
  "model_used":       "medgemma-1.5-4b"
}
Flag abnormal only if clearly pathological findings are visible."""


# ── Inference helper ──────────────────────────────────────────────────────────

def _run_inference(prompt: str, image) -> dict:
    """Run MedGemma on a single PIL image with the given prompt."""
    import torch

    model, processor = _load_model()

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text",  "text":  prompt},
            ],
        }
    ]

    inputs = processor.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    ).to(model.device, dtype=torch.bfloat16)

    with torch.inference_mode():
        output_ids = model.generate(**inputs, max_new_tokens=512, do_sample=False)

    # Decode only the newly generated tokens
    prompt_len = inputs["input_ids"].shape[1]
    output = processor.decode(output_ids[0][prompt_len:], skip_special_tokens=True)

    start = output.find("{")
    end   = output.rfind("}") + 1

    if start == -1 or end == 0:
        return {
            "summary":          output.strip(),
            "findings":         [],
            "flagged_abnormal": False,
            "abnormal_items":   [],
            "impression":       "",
            "disclaimer":       "This AI analysis is for informational purposes only and does not constitute a medical diagnosis.",
            "model_used":       "medgemma-1.5-4b",
        }

    try:
        return json.loads(output[start:end])
    except json.JSONDecodeError:
        return {
            "summary":          output.strip(),
            "findings":         [],
            "flagged_abnormal": False,
            "abnormal_items":   [],
            "impression":       "",
            "disclaimer":       "This AI analysis is for informational purposes only and does not constitute a medical diagnosis.",
            "model_used":       "medgemma-1.5-4b",
        }


def _run_multi_slice_inference(instruction: str, query: str, images: list) -> dict:
    """
    Run MedGemma on multiple slices in a single forward pass.

    Message structure (mirrors high_dimensional_ct_hugging_face.ipynb):
      [instruction text] → [image][SLICE 1] → … → [image][SLICE N] → [query text]

    All PIL images are passed directly to apply_chat_template; the processor
    encodes them into vision tokens alongside the text tokens.
    """
    import torch

    model, processor = _load_model()

    content: list = [{"type": "text", "text": instruction}]
    for i, img in enumerate(images, 1):
        content.append({"type": "image", "image": img})
        content.append({"type": "text",  "text":  f"SLICE {i}"})
    content.append({"type": "text", "text": query})

    messages = [{"role": "user", "content": content}]

    inputs = processor.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    ).to(model.device, dtype=torch.bfloat16)

    with torch.inference_mode():
        output_ids = model.generate(**inputs, max_new_tokens=512, do_sample=False)

    prompt_len = inputs["input_ids"].shape[1]
    output     = processor.decode(output_ids[0][prompt_len:], skip_special_tokens=True)

    start = output.find("{")
    end   = output.rfind("}") + 1

    _fallback = {
        "summary":          output.strip(),
        "findings":         [],
        "flagged_abnormal": False,
        "abnormal_items":   [],
        "impression":       "",
        "disclaimer":       "This AI analysis is for informational purposes only and does not constitute a medical diagnosis.",
        "model_used":       "medgemma-1.5-4b",
    }

    if start == -1 or end == 0:
        return _fallback

    try:
        return json.loads(output[start:end])
    except json.JSONDecodeError:
        return _fallback


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
    result    = _run_inference(_XRAY_PROMPT, img)
    result["model_used"] = "medgemma-1.5-4b"
    return result


@app.post("/analyze/ct-mri")
def analyze_ct_mri(req: CtMriRequest):
    from PIL import Image

    img_bytes = base64.b64decode(req.image_base64)
    modality  = (req.modality or "ct").upper()

    # Try DICOM first, fall back to standard image
    volume_images = None
    try:
        import pydicom
        dcm = pydicom.dcmread(io.BytesIO(img_bytes))
        # apply_rescale converts raw stored pixels → Hounsfield units using the
        # RescaleSlope and RescaleIntercept tags embedded in the DICOM file.
        # Without this the CT windowing operates on raw pixel values (0–4095),
        # not HU values (-1024–+3071), producing blank or solid images.
        # This mirrors the exact call used in Google's high_dimensional_ct_hugging_face.ipynb.
        volume = pydicom.pixels.apply_rescale(dcm.pixel_array, dcm).astype(np.float32)
        if volume.ndim == 2:
            volume = volume[np.newaxis, ...]  # single slice → (1, H, W)
        volume_images = _ct_slices_to_images(volume) if modality == "CT" else _mri_slices_to_images(volume)
    except Exception:
        pass

    if volume_images is None:
        # Not DICOM — treat as a standard JPG/PNG
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

    result = _run_multi_slice_inference(_CT_MRI_INSTRUCTION, _CT_MRI_QUERY, selected_slices)
    result["modality"]   = modality
    result["model_used"] = "medgemma-1.5-4b"
    return result
