// =============================================================================
// Backend/tests/textractService.test.js
//
// Coverage: textractService.extractCnicFields (GPT-4o Vision)
//
// Critical behaviours under test:
//  · Happy path: well-formed JSON → all four fields returned with confidence 1.
//  · Markdown code-fence stripped before JSON.parse.
//  · Partial extraction: missing fields return null, confidence 0.
//  · Completely unparseable response → all fields null, all confidence 0.
//  · OpenAI API error propagates as a thrown exception.
// =============================================================================

jest.mock("openai", () => {
  const mockCreate = jest.fn();
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
});

const OpenAI = require("openai");
const { extractCnicFields } = require("../services/textractService");

const mockCreate = new OpenAI().chat.completions.create;

function makeResponse(content) {
  return {
    choices: [{ message: { content } }],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("extractCnicFields", () => {
  test("happy path: returns all four fields with confidence 1", async () => {
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify({
      name:        "HASSAN RAHEEM",
      father_name: "ABDUL RAHEEM",
      cnic_number: "12345-6789012-3",
      expiry_date: "31-12-2030",
    })));

    const result = await extractCnicFields("base64data");

    expect(result.name).toBe("HASSAN RAHEEM");
    expect(result.father_name).toBe("ABDUL RAHEEM");
    expect(result.cnic_number).toBe("12345-6789012-3");
    expect(result.expiry_date).toBe("31-12-2030");
    expect(result.confidence.name).toBe(1);
    expect(result.confidence.father_name).toBe(1);
    expect(result.confidence.cnic_number).toBe(1);
    expect(result.confidence.expiry_date).toBe(1);
  });

  test("markdown code-fence is stripped before JSON.parse", async () => {
    const wrapped = "```json\n{\"name\":\"DR KHAN\",\"father_name\":null,\"cnic_number\":null,\"expiry_date\":null}\n```";
    mockCreate.mockResolvedValue(makeResponse(wrapped));

    const result = await extractCnicFields("base64data");

    expect(result.name).toBe("DR KHAN");
    expect(result.father_name).toBeNull();
    expect(result.confidence.name).toBe(1);
    expect(result.confidence.father_name).toBe(0);
  });

  test("partial extraction: missing fields return null with confidence 0", async () => {
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify({
      name:        "AMINA KHAN",
      father_name: null,
      cnic_number: null,
      expiry_date: null,
    })));

    const result = await extractCnicFields("base64data");

    expect(result.name).toBe("AMINA KHAN");
    expect(result.father_name).toBeNull();
    expect(result.cnic_number).toBeNull();
    expect(result.expiry_date).toBeNull();
    expect(result.confidence.name).toBe(1);
    expect(result.confidence.father_name).toBe(0);
    expect(result.confidence.cnic_number).toBe(0);
    expect(result.confidence.expiry_date).toBe(0);
  });

  test("completely unparseable response → all fields null, all confidence 0", async () => {
    mockCreate.mockResolvedValue(makeResponse("Sorry, I cannot read this image."));

    const result = await extractCnicFields("base64data");

    expect(result.name).toBeNull();
    expect(result.father_name).toBeNull();
    expect(result.cnic_number).toBeNull();
    expect(result.expiry_date).toBeNull();
    expect(Object.values(result.confidence).every(v => v === 0)).toBe(true);
  });

  test("empty model response → all fields null", async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });

    const result = await extractCnicFields("base64data");

    expect(result.name).toBeNull();
    expect(result.cnic_number).toBeNull();
  });

  test("OpenAI API error propagates as thrown exception", async () => {
    mockCreate.mockRejectedValue(new Error("openai_rate_limit"));

    await expect(extractCnicFields("base64data")).rejects.toThrow("openai_rate_limit");
  });

  test("passes base64 as image_url with high detail", async () => {
    mockCreate.mockResolvedValue(makeResponse("{}"));

    await extractCnicFields("TESTBASE64");

    const call = mockCreate.mock.calls[0][0];
    const imageContent = call.messages[1].content.find(c => c.type === "image_url");
    expect(imageContent.image_url.url).toBe("data:image/jpeg;base64,TESTBASE64");
    expect(imageContent.image_url.detail).toBe("high");
  });

  test("uses gpt-4o model", async () => {
    mockCreate.mockResolvedValue(makeResponse("{}"));

    await extractCnicFields("x");

    expect(mockCreate.mock.calls[0][0].model).toBe("gpt-4o");
  });
});
