const Drug = require('../../../DB/Models/drug.model');
const Inventory = require('../../../DB/Models/inventory.model');
const env = require('../../config/env');
const callGemini = require('./gemini.provider');
const callCustomModel = require('./custom-model.provider');
const { AppError } = require('../../utils/error-handling');

const nonMedicineWords = new Set([
  'tablet', 'tab', 'tabs', 'capsule', 'cap', 'caps', 'syrup', 'injection', 'inj', 'cream', 'ointment', 'drops', 'drop', 'spray', 'solution', 'suspension', 'gel', 'dose', 'daily', 'before', 'after', 'meal', 'meals', 'morning', 'night', 'evening', 'once', 'twice', 'three', 'times', 'take', 'use', 'days', 'day', 'week', 'doctor', 'patient', 'name', 'age', 'date', 'diagnosis', 'rx', 'medicine', 'medication', 'mg', 'ml', 'mcg', 'gm', 'g', 'iu', 'قرص', 'اقراص', 'كبسولة', 'شراب', 'حقن', 'مرهم', 'كريم', 'نقط', 'بخاخ', 'جرعة', 'مرة', 'مرتين', 'يوميا', 'قبل', 'بعد', 'الأكل', 'الاكل', 'صباحا', 'مساء', 'ليلا', 'الدكتور', 'المريض', 'الاسم', 'العمر', 'التاريخ', 'تشخيص'
]);

function normalizeText(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s.+%-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenize(value = '') {
  return normalizeText(value).split(' ').filter(Boolean);
}

function compactName(value = '') {
  return normalizeText(value).replace(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|gm|ml|iu|%|مجم|ملجم|جم|مل|وحدة)\b/gi, '').replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left && !right) return 0;
  if (!left || !right) return Math.max(left.length, right.length);
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let last = i - 1;
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const temp = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, last + (left[i - 1] === right[j - 1] ? 0 : 1));
      last = temp;
    }
  }
  return previous[right.length];
}

function similarity(a, b) {
  const left = compactName(a);
  const right = compactName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return Math.min(0.95, Math.max(0.72, Math.min(left.length, right.length) / Math.max(left.length, right.length)));
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size || 1;
  const tokenScore = intersection / union;
  const distance = levenshtein(left, right);
  const editScore = 1 - distance / Math.max(left.length, right.length, 1);
  return Math.max(tokenScore, editScore * 0.9);
}

function cleanCandidateName(value = '') {
  return String(value)
    .replace(/[•*#|]/g, ' ')
    .replace(/^\s*(?:rx|r\/x|drug|medicine|medication|name|اسم الدواء|دواء|العلاج)\s*[:：-]?\s*/i, '')
    .replace(/\b(?:tab|tablet|cap|capsule|syrup|injection|inj|cream|ointment|drops|spray|solution|suspension)\b\.?/gi, ' ')
    .replace(/\b(?:take|use|dose|daily|before|after|meal|meals|morning|night|evening|once|twice|times|days?)\b.*$/i, '')
    .replace(/\b(?:\d+\s*(?:x|×)\s*\d+|\d+\/\d+|\d+\s*(?:days?|weeks?))\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,.;:\-\s]+|[,.;:\-\s]+$/g, '')
    .trim();
}

function isLikelyMedicineName(value = '') {
  const cleaned = cleanCandidateName(value);
  const normalized = normalizeText(cleaned);
  if (cleaned.length < 3 || cleaned.length > 80) return false;
  const tokens = normalized.split(' ').filter(Boolean);
  if (!tokens.length || tokens.every((token) => nonMedicineWords.has(token) || /^\d+$/.test(token))) return false;
  if (/^(?:\d+|[+\-.%]+)$/.test(normalized)) return false;
  if (/\b(?:name|date|doctor|patient|diagnosis|address|phone|signature)\b/i.test(normalized)) return false;
  return true;
}

function uniqueDrugs(items = []) {
  const seen = new Set();
  const result = [];
  items.forEach((item) => {
    const name = cleanCandidateName(item.extracted_name || item.name || item.drug || item.medicine || '');
    if (!isLikelyMedicineName(name)) return;
    const key = normalizeText(name);
    if (seen.has(key)) return;
    seen.add(key);
    result.push({
      extracted_name: name,
      confidence_score: Math.max(0, Math.min(1, Number(item.confidence_score ?? item.confidence ?? 0.55))),
    });
  });
  return result;
}

function extractCandidatesFromText(text = '') {
  const rows = String(text)
    .split(/[\n\r;,]+/)
    .flatMap((row) => row.split(/\s{2,}/))
    .map((row) => cleanCandidateName(row))
    .filter(Boolean);

  const candidates = [];
  rows.forEach((row) => {
    const chunks = row.split(/(?:\s+-\s+|\s+\d+\s*(?:mg|mcg|g|gm|ml|iu|%|مجم|ملجم|جم|مل)\b)/i).map((item) => cleanCandidateName(item));
    chunks.forEach((chunk) => {
      if (isLikelyMedicineName(chunk)) candidates.push({ extracted_name: chunk, confidence_score: 0.45 });
    });
  });
  return uniqueDrugs(candidates);
}

function parseRawResult(rawResult, fallbackText = '') {
  const parsed = typeof rawResult === 'string' ? JSON.parse(rawResult) : (rawResult || {});
  const extractedText = String(parsed.extracted_text || parsed.text || parsed.ocr_text || fallbackText || '').trim();
  const rawDrugs = Array.isArray(parsed.drugs) ? parsed.drugs : Array.isArray(parsed.medicines) ? parsed.medicines : [];
  const drugs = uniqueDrugs(rawDrugs);
  return {
    extracted_text: extractedText,
    drugs: drugs.length ? drugs : extractCandidatesFromText(extractedText),
  };
}

async function getCatalog() {
  return Drug.find({}).select('name strength form description imageUrl').lean();
}

function buildPrompt(catalogSample = []) {
  const catalogNames = catalogSample.slice(0, 250).map((drug) => `${drug.name}${drug.strength ? ` ${drug.strength}` : ''}${drug.form ? ` ${drug.form}` : ''}`).join(', ');
  const schemaHint = JSON.stringify({ extracted_text: 'string', drugs: [{ extracted_name: 'string', confidence_score: 0.0 }] });
  return [
    'You are a medical prescription OCR and medicine-name extraction engine for Arabic and English prescriptions.',
    'Read the uploaded prescription image or PDF carefully and extract only real medicine names that appear in the file.',
    'Do not reuse examples, do not guess, and do not invent names. If the handwriting is unreadable, return an empty drugs array for that part.',
    'Keep strengths when attached to medicine names, such as 500mg or 1g. Ignore patient data, doctor data, dates, directions, dosage frequency, and generic words like tablet or syrup when they are not part of the medicine name.',
    `Return strict JSON only with exactly this structure: ${schemaHint}`,
    catalogNames ? `Known catalog names for matching context only, not for hallucination: ${catalogNames}` : '',
  ].filter(Boolean).join('\n');
}

function bestCatalogMatch(extractedName, catalog = []) {
  let best = null;
  catalog.forEach((drug) => {
    const score = similarity(extractedName, `${drug.name} ${drug.strength || ''}`.trim());
    if (!best || score > best.score) best = { drug, score };
  });
  if (!best || best.score < 0.54) return null;
  return best;
}

async function getDrugPharmacies(drugIds = []) {
  if (!drugIds.length) return new Map();
  const rows = await Inventory.find({ drugId: { $in: drugIds } })
    .populate('pharmacyId', 'name address latitude longitude rating phone email workingHours googleMapsUrl status')
    .sort({ quantity: -1, price: 1 })
    .lean();
  const grouped = new Map();
  rows.forEach((row) => {
    const key = String(row.drugId);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({
      id: row.pharmacyId?._id?.toString() || null,
      name: row.pharmacyId?.name || '',
      address: row.pharmacyId?.address || '',
      phone: row.pharmacyId?.phone || '',
      email: row.pharmacyId?.email || '',
      working_hours: row.pharmacyId?.workingHours || '',
      google_maps_url: row.pharmacyId?.googleMapsUrl || '',
      latitude: row.pharmacyId?.latitude || 0,
      longitude: row.pharmacyId?.longitude || 0,
      rating: row.pharmacyId?.rating || 0,
      price: row.price,
      quantity: row.quantity,
      inventory_id: row._id.toString(),
      stock_status: Number(row.quantity || 0) <= 0 ? 'out_of_stock' : Number(row.quantity || 0) < 10 ? 'low_stock' : 'in_stock',
    });
  });
  return grouped;
}

async function matchExtractedNames(drugs = [], catalog = []) {
  const preliminary = uniqueDrugs(drugs).map((item) => {
    const matched = bestCatalogMatch(item.extracted_name, catalog);
    return {
      extracted_name: item.extracted_name,
      confidence_score: Number(item.confidence_score || 0.5),
      match_score: matched ? Number(matched.score.toFixed(3)) : 0,
      matched_drug_id: matched?.drug?._id?.toString() || null,
      matched_drug_raw: matched?.drug || null,
    };
  });

  const pharmacyMap = await getDrugPharmacies(preliminary.map((item) => item.matched_drug_id).filter(Boolean));

  return preliminary.map((item) => ({
    extracted_name: item.extracted_name,
    confidence_score: Math.max(0, Math.min(1, Number(item.confidence_score || 0.5))),
    match_score: item.match_score,
    matched_drug_id: item.matched_drug_id,
    matched_drug: item.matched_drug_raw
      ? {
          id: item.matched_drug_raw._id.toString(),
          name: item.matched_drug_raw.name,
          strength: item.matched_drug_raw.strength,
          form: item.matched_drug_raw.form,
          description: item.matched_drug_raw.description,
          image_url: item.matched_drug_raw.imageUrl,
          pharmacies: pharmacyMap.get(item.matched_drug_id) || [],
        }
      : null,
  }));
}

async function callConfiguredProvider({ fileBuffer, mimeType, prompt }) {
  if (env.aiProvider === 'custom') return callCustomModel({ fileBuffer, mimeType, prompt });
  if (env.aiProvider === 'gemini') return callGemini({ fileBuffer, mimeType, prompt });
  if (env.aiProvider === 'none' || env.aiProvider === 'off') return null;
  throw new AppError(`Unsupported AI_PROVIDER: ${env.aiProvider}`, 500);
}

async function extractPrescription({ fileBuffer, mimeType, fallbackText = '' }) {
  const catalog = await getCatalog();
  const prompt = buildPrompt(catalog);
  let parsed;

  if (mimeType === 'text/plain' && fallbackText) {
    parsed = parseRawResult({ extracted_text: fallbackText, drugs: extractCandidatesFromText(fallbackText) }, fallbackText);
  } else {
    try {
      const rawResult = await callConfiguredProvider({ fileBuffer, mimeType, prompt });
      if (!rawResult) throw new Error('AI provider is disabled.');
      parsed = parseRawResult(rawResult, fallbackText);
    } catch (error) {
      if (fallbackText && env.aiFallbackEnabled) {
        parsed = parseRawResult({ extracted_text: fallbackText, drugs: extractCandidatesFromText(fallbackText) }, fallbackText);
      } else {
        console.error('[AI EXTRACTION ERROR]', { message: error.message, provider: env.aiProvider });
        throw new AppError('Prescription extraction failed. Please try again later.', 502);
      }
    }
  }

  const matchedDrugs = await matchExtractedNames(parsed.drugs || [], catalog);
  return {
    extracted_text: parsed.extracted_text || fallbackText || '',
    drugs: matchedDrugs,
  };
}

module.exports = { extractPrescription, extractCandidatesFromText, normalizeText, similarity };
