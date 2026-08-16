# ==============================================================================
# glinker/images/pdf_analysis.py — PDF / medical document analysis via GPT
#
# Two paths, chosen automatically:
#   Text path   — pdfplumber extracts readable text → GPT text call (fast, cheap).
#                 Used for native digital PDFs.
#   Vision path — pages rendered to JPEG via pypdfium2 → GPT vision call.
#                 Used for scanned / photographed documents with no text layer.
#
# The caller always sees the same function signature and the same JSON schema
# regardless of which path was used.
# PHI: document content sent to LLM but never logged to console.
#
# Kaggle install:  !pip install pdfplumber pypdfium2
# ==============================================================================
import base64
import io
import json

from glinker import config

# If pdfplumber extracts fewer than this many characters across all pages,
# treat the document as scanned and switch to the vision path.
# Real digital PDFs yield thousands of chars; scanned ones yield 0–30 (metadata noise).
_MIN_TEXT_CHARS = 50

_TEXT_PAGE_CAP   = 20   # pages read by pdfplumber (matches existing behaviour)
_VISION_PAGE_CAP = 10   # pages rendered for vision (vision tokens cost more)

_SYSTEM_PROMPT = """\
You are a medical document analysis assistant. Analyze the provided medical document
(lab report, prescription, imaging report, discharge summary, etc.) and extract
clinically relevant information.

Return a JSON object with these exact keys:
{
  "summary":          "<2-3 sentence plain-language summary of what the document contains>",
  "findings":         ["<key finding 1>", "<key finding 2>"],
  "flagged_abnormal": true or false,
  "impression":       "<overall clinical impression, or empty string if not applicable>"
}

Rules:
- Flag abnormal ONLY if there are clearly out-of-range lab values, critical findings, or urgent recommendations.
- Do not invent information not present in the document.
- Keep findings concise — max 8 items.
- Return empty list [] for findings if no clinically relevant content is present."""


# ── Public entry point ────────────────────────────────────────────────────────

def analyze_pdf(pdf_base64: str, filename: str) -> dict:
    """
    Analyze a base64-encoded PDF.

    Automatically selects the text or vision path:
      • text path  — when pdfplumber yields ≥ _MIN_TEXT_CHARS characters.
      • vision path — when text is absent or negligible (scanned/photographed docs).

    Returns the same JSON schema on both paths. Raises ValueError if the document
    cannot be read at all.
    """
    pdf_bytes = base64.b64decode(pdf_base64)

    text = ""
    try:
        text = _extract_text(pdf_bytes)
    except RuntimeError:
        raise                   # missing dependency — surface immediately
    except Exception:
        pass                    # pdfplumber couldn't open it → try vision anyway

    if len(text) >= _MIN_TEXT_CHARS:
        return _analyze_text(text, filename)

    return _analyze_vision(pdf_bytes, filename)


# ── Text path ─────────────────────────────────────────────────────────────────

def _extract_text(pdf_bytes: bytes) -> str:
    try:
        import pdfplumber
    except ImportError:
        raise RuntimeError("pdfplumber is required: !pip install pdfplumber")

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages[:_TEXT_PAGE_CAP]]
    return "\n\n".join(p for p in pages if p.strip())


def _analyze_text(text: str, filename: str) -> dict:
    # Cap at ~3500 chars — stays well within token budget for reasoning models
    excerpt = text[:3500]

    response = config.openai_client.chat.completions.create(
        model=config.LLM_CONFIG["model"],
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Document filename: {filename}\n\n"
                    f"Document content:\n{excerpt}"
                ),
            },
        ],
        max_completion_tokens=config.LLM_CONFIG.get("pdf_analysis_max_tokens", 1500),
        response_format={"type": "json_object"},
    )

    result = _parse_response(response)
    result["model_used"] = "gpt"
    return result


# ── Vision path ───────────────────────────────────────────────────────────────

def _render_pages(pdf_bytes: bytes) -> list:
    """
    Render up to _VISION_PAGE_CAP PDF pages to JPEG base64 strings via pypdfium2.
    scale=2.0 gives 144 DPI — sharp enough for the model to read printed text.
    PHI: rendered page images are never logged.
    """
    try:
        import pypdfium2 as pdfium
    except ImportError:
        raise RuntimeError(
            "pypdfium2 is required for scanned PDFs: !pip install pypdfium2"
        )

    doc    = pdfium.PdfDocument(pdf_bytes)
    pages  = []
    for i in range(min(len(doc), _VISION_PAGE_CAP)):
        page   = doc[i]
        bitmap = page.render(scale=2.0)
        pil    = bitmap.to_pil()
        buf    = io.BytesIO()
        pil.save(buf, format="JPEG", quality=85)
        pages.append(base64.b64encode(buf.getvalue()).decode("utf-8"))

    return pages


def _analyze_vision(pdf_bytes: bytes, filename: str) -> dict:
    page_b64s = _render_pages(pdf_bytes)

    if not page_b64s:
        raise ValueError("PDF has no renderable pages.")

    # One image_url block per rendered page. PHI: content not logged.
    image_blocks = [
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}
        for b64 in page_b64s
    ]

    response = config.openai_client.chat.completions.create(
        model=config.LLM_CONFIG["model"],
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            f"Document filename: {filename}. "
                            "This is a scanned or photographed medical document. "
                            "Analyze all pages provided carefully."
                        ),
                    },
                    *image_blocks,
                ],
            },
        ],
        max_completion_tokens=config.LLM_CONFIG.get("pdf_analysis_max_tokens", 1500),
        response_format={"type": "json_object"},
    )

    result = _parse_response(response)
    result["model_used"] = "gpt"
    return result


# ── Shared response parser ────────────────────────────────────────────────────

def _parse_response(response) -> dict:
    """
    Parse a structured JSON response.
    With response_format=json_object the model guarantees valid JSON, so we
    call json.loads() directly — no fragile find("{")/rfind("}") scraping.
    """
    raw = response.choices[0].message.content
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError) as exc:
        raise ValueError(f"Model returned invalid JSON: {exc}") from exc
