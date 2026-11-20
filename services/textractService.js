const OpenAI = require("openai");

// Lazily initialised so test suites that don't call extractCnicFields don't
// require OPENAI_API_KEY to be present in the process environment.
let _openai;
function getClient() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

const SYSTEM_PROMPT = `You are a document reader that extracts information from Pakistani CNIC (National Identity Card) images.
Extract exactly these four fields and return ONLY valid JSON with no extra text:
{
  "name": "<full name in English as printed on the card, or null>",
  "father_name": "<father's full name in English as printed on the card, or null>",
  "cnic_number": "<CNIC number in format XXXXX-XXXXXXX-X, or null>",
  "expiry_date": "<expiry date as printed on the card, or null>"
}
If a field is not visible or not readable, set it to null.`;

/**
 * Extract fields from a CNIC image using GPT-4o Vision.
 * @param {string} imageBase64 - base64-encoded JPEG/PNG of the CNIC
 * @returns {{ name, father_name, cnic_number, expiry_date, confidence }}
 */
async function extractCnicFields(imageBase64) {
  const response = await getClient().chat.completions.create({
    model: "gpt-4o",
    max_tokens: 200,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url:    `data:image/jpeg;base64,${imageBase64}`,
              detail: "high",
            },
          },
          {
            type: "text",
            text: "Extract the CNIC fields and return JSON only.",
          },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() || "{}";

  // Strip markdown code fences if model wrapped it
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {};
  }

  return {
    name:        parsed.name        || null,
    father_name: parsed.father_name || null,
    cnic_number: parsed.cnic_number || null,
    expiry_date: parsed.expiry_date || null,
    confidence: {
      name:        parsed.name        ? 1 : 0,
      father_name: parsed.father_name ? 1 : 0,
      cnic_number: parsed.cnic_number ? 1 : 0,
      expiry_date: parsed.expiry_date ? 1 : 0,
    },
  };
}

module.exports = { extractCnicFields };
