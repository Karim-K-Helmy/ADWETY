const crypto = require('crypto');
const Prescription = require('../../../DB/Models/prescription.model');
const PrescriptionExtractedDrug = require('../../../DB/Models/prescriptionextracteddrug.model');
const { saveBuffer } = require('../../services/storage.service');
const { extractPrescription } = require('../../services/ai/ai.service');
const { AppError } = require('../../utils/error-handling');
const env = require('../../config/env');
const { validateUploadedFileContent } = require('../../middleware/upload');

function publicPrescriptionId(id) {
  return crypto.createHmac('sha256', env.jwtSecret).update(String(id)).digest('hex').slice(0, 32);
}

function sanitizeMockText(value = '') {
  return String(value)
    .replace(/ignore\s+all\s+previous/gi, '[filtered]')
    .replace(/system\s+prompt/gi, '[filtered]')
    .replace(/developer\s+message/gi, '[filtered]')
    .slice(0, 5000);
}

async function scanPrescription({ file, userId, mockText, consentToAiProcessing = false }) {
  if (!userId) throw new AppError('Unauthorized', 401);
  if (!env.allowAiPrescriptionProcessing) throw new AppError('Prescription AI processing is disabled.', 403);
  if (!consentToAiProcessing) throw new AppError('AI processing consent is required for prescription scans.', 422);
  if (mockText && env.nodeEnv === 'production') throw new AppError('mock_text is disabled in production', 403);
  const safeMockText = mockText ? sanitizeMockText(mockText) : '';
  if (!file && !safeMockText) throw new AppError('Prescription image/PDF or mock_text is required', 422);
  if (file?.buffer) validateUploadedFileContent(file);

  const imageUrl = file?.buffer ? saveBuffer(file.buffer, file.originalname) : null;
  const prescription = await Prescription.create({
    userId,
    imageUrl,
    status: 'processing',
    extractedText: safeMockText || '',
  });

  let result;
  try {
    result = await extractPrescription({
      fileBuffer: file?.buffer || Buffer.from(safeMockText || ''),
      mimeType: file?.mimetype || 'text/plain',
      fallbackText: safeMockText || '',
    });
  } catch (error) {
    prescription.status = 'failed';
    prescription.extractedText = safeMockText || '';
    await prescription.save();
    throw error;
  }

  prescription.extractedText = result.extracted_text || '';
  prescription.status = 'completed';
  await prescription.save();

  await PrescriptionExtractedDrug.deleteMany({ prescriptionId: prescription._id });

  const savedExtractedDrugs = [];
  for (const item of result.drugs || []) {
    const created = await PrescriptionExtractedDrug.create({
      prescriptionId: prescription._id,
      drugId: item.matched_drug_id || null,
      extractedName: item.extracted_name,
      confidenceScore: item.confidence_score,
    });

    savedExtractedDrugs.push({
      id: created._id.toString(),
      extracted_name: item.extracted_name,
      confidence_score: item.confidence_score,
      match_score: item.match_score || 0,
      matched_drug: item.matched_drug,
    });
  }

  return {
    prescription_id: publicPrescriptionId(prescription._id),
    image_url: imageUrl,
    extracted_text: prescription.extractedText,
    extracted_drugs: savedExtractedDrugs,
    drugs: savedExtractedDrugs.filter((item) => item.matched_drug).map((item) => item.matched_drug),
  };
}

module.exports = { scanPrescription };
