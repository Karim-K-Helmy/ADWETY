const env = require('../../config/env');

function stripCodeFence(text = '') {
  return String(text)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function parseGeminiJson(text = '') {
  const clean = stripCodeFence(text);
  try {
    return JSON.parse(clean);
  } catch (_error) {
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      return JSON.parse(clean.slice(first, last + 1));
    }
    throw new Error('Gemini did not return valid JSON.');
  }
}

module.exports = async function callGemini({ fileBuffer, mimeType, prompt }) {
  if (!env.geminiApiKey) throw new Error('Missing GEMINI_API_KEY');
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || !fileBuffer.length) throw new Error('Missing prescription file buffer');

  const response = await fetch(`${env.geminiBaseUrl}/models/${env.geminiModel}:generateContent?key=${env.geminiApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: fileBuffer.toString('base64') } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        topK: 32,
        responseMimeType: 'application/json',
      },
    }),
    signal: AbortSignal.timeout(env.aiTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '{}';
  return parseGeminiJson(text);
};
