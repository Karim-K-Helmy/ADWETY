const env = require('../../config/env');

module.exports = async function callCustomModel({ fileBuffer, mimeType, prompt }) {
  if (!env.customAiApiUrl) throw new Error('Missing CUSTOM_AI_API_URL');
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || !fileBuffer.length) throw new Error('Missing prescription file buffer');

  const response = await fetch(env.customAiApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.customAiApiKey ? { Authorization: `Bearer ${env.customAiApiKey}` } : {}),
    },
    body: JSON.stringify({
      model: env.customAiModel,
      mime_type: mimeType,
      file_base64: fileBuffer.toString('base64'),
      prompt,
    }),
    signal: AbortSignal.timeout(env.aiTimeoutMs),
  });

  if (!response.ok) throw new Error(`Custom AI request failed with status ${response.status}`);
  return response.json();
};
