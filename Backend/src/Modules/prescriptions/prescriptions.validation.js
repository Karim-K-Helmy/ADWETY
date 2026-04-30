const { z } = require('zod');

const scanSchema = z.object({
  body: z.object({
    mock_text: z.string().max(5000).optional(),
    consent_to_ai_processing: z.enum(['true', '1', 'yes', 'on']).optional(),
  }).strict(),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

module.exports = { scanSchema };
