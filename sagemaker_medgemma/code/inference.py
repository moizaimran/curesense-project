# ==============================================================================
# sagemaker_medgemma/code/inference.py
#
# SageMaker inference handler for MedGemma 1.5-4B.
# ONLY handles model inference — all preprocessing (DICOM, CT windowing,
# ZIP extraction, montage building) is done by the caller (Flask on laptop).
#
# Input:  {"image_base64": "<base64 PIL-ready JPEG/PNG>", "prompt": "<text>"}
# Output: {"raw_text": "<model output>"}
#
# The Flask app decodes raw_text and parses it into the final JSON response.
# ==============================================================================

import base64
import gc
import io
import json
import os

os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

import torch
import torch._dynamo
from PIL import Image
from transformers import AutoModelForImageTextToText, AutoProcessor

MODEL_ID = "google/medgemma-1.5-4b-it"

_model     = None
_processor = None


def model_fn(model_dir):
    global _model, _processor

    torch._dynamo.config.disable = True

    print(f"[MedGemma] Loading {MODEL_ID} from {model_dir} ...")

    _processor = AutoProcessor.from_pretrained(model_dir)
    _model     = AutoModelForImageTextToText.from_pretrained(
        model_dir,
        torch_dtype           = torch.bfloat16,
        device_map            = "auto",
        attn_implementation   = "eager",
    )

    if torch.cuda.is_available():
        free, total = torch.cuda.mem_get_info(0)
        print(f"[MedGemma] GPU VRAM after load: {free/1e9:.1f} GB free / {total/1e9:.1f} GB total")

    print("[MedGemma] Model ready.")
    return {"model": _model, "processor": _processor}


def input_fn(request_body, content_type="application/json"):
    if content_type != "application/json":
        raise ValueError(f"Unsupported content type: {content_type}")
    return json.loads(request_body)


def predict_fn(data, model_dict):
    model     = model_dict["model"]
    processor = model_dict["processor"]

    image_b64 = data.get("image_base64", "")
    prompt    = data.get("prompt", "")

    if not image_b64:
        return {"raw_text": "", "error": "image_base64 is required"}
    if not prompt:
        return {"raw_text": "", "error": "prompt is required"}

    # Decode preprocessed image (already windowed/montaged by Flask)
    img_bytes = base64.b64decode(image_b64)
    image     = Image.open(io.BytesIO(img_bytes)).convert("RGB")

    messages = [{"role": "user", "content": [
        {"type": "image", "image": image},
        {"type": "text",  "text":  prompt},
    ]}]

    text   = processor.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)
    inputs = processor(text=text, images=image, return_tensors="pt").to(model.device)
    inputs.pop("token_type_ids", None)
    if "pixel_values" in inputs:
        inputs["pixel_values"] = inputs["pixel_values"].to(dtype=torch.bfloat16)

    prompt_len = inputs["input_ids"].shape[1]
    output_ids = None

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    try:
        with torch.inference_mode():
            output_ids = model.generate(**inputs, max_new_tokens=500, do_sample=False)
        raw_text = processor.decode(output_ids[0][prompt_len:], skip_special_tokens=True)
    finally:
        del inputs
        if output_ids is not None:
            del output_ids
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    return {"raw_text": raw_text}


def output_fn(prediction, accept="application/json"):
    return json.dumps(prediction), "application/json"
