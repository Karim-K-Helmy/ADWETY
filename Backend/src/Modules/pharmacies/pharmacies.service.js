const Pharmacy = require('../../../DB/Models/pharmacy.model');
const Inventory = require('../../../DB/Models/inventory.model');
const { AppError } = require('../../utils/error-handling');
const { validateObjectId } = require('../../utils/helpers');
const { stockStatusFromQuantity } = require('../medicines/medicines.service');
const { escapeRegex } = require('../../utils/security');

function getPharmacyScope(authUser, authMeta) {
  const role = authUser?.role;
  if (role !== 'pharmacy_admin') return null;
  const pharmacyId = authUser?.pharmacyId;
  if (!pharmacyId) throw new AppError('Forbidden: pharmacy admin is not assigned to a pharmacy', 403);
  return pharmacyId;
}

function assertPharmacyAccess(id, authUser, authMeta) {
  const scope = getPharmacyScope(authUser, authMeta);
  if (scope && String(id) !== String(scope)) throw new AppError('Forbidden: you can only access your assigned pharmacy', 403);
}

function normalizePharmacy(pharmacy, inventoryCount = 0) {
  return {
    id: pharmacy._id.toString(),
    name: pharmacy.name,
    address: pharmacy.address,
    phone: pharmacy.phone || '',
    email: pharmacy.email || '',
    working_hours: pharmacy.workingHours || '',
    google_maps_url: pharmacy.googleMapsUrl || '',
    status: pharmacy.status,
    distance_km: 0,
    rating: pharmacy.rating,
    latitude: pharmacy.latitude,
    longitude: pharmacy.longitude,
    image_url: pharmacy.imageUrl,
    is_featured: Boolean(pharmacy.isFeatured),
    inventory_count: inventoryCount,
  };
}

async function listPharmacies({ featured, q, status } = {}, authUser = null, authMeta = null) {
  const filter = {};
  const scope = getPharmacyScope(authUser, authMeta);
  if (scope) filter._id = scope;
  if (featured === 'true') filter.isFeatured = true;
  if (status) filter.status = status;
  if (!status) filter.status = { $in: ['approved', 'active', 'inactive'] };
  if (q) {
    const safeQuery = escapeRegex(String(q).slice(0, 80));
    filter.$or = [
      { name: { $regex: safeQuery, $options: 'i' } },
      { address: { $regex: safeQuery, $options: 'i' } },
      { phone: { $regex: safeQuery, $options: 'i' } },
      { email: { $regex: safeQuery, $options: 'i' } },
    ];
  }

  const pharmacies = await Pharmacy.find(filter).sort({ rating: -1, name: 1 }).lean();
  const counts = await Inventory.aggregate([
    { $match: { pharmacyId: { $in: pharmacies.map((pharmacy) => pharmacy._id) } } },
    { $group: { _id: '$pharmacyId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((item) => [String(item._id), item.count]));
  return pharmacies.map((pharmacy) => normalizePharmacy(pharmacy, countMap.get(String(pharmacy._id)) || 0));
}

async function getPharmacyDetails(id, authUser = null, authMeta = null) {
  validateObjectId(id);
  assertPharmacyAccess(id, authUser, authMeta);
  const pharmacy = await Pharmacy.findById(id).lean();
  if (!pharmacy) throw new AppError('Pharmacy not found', 404);
  const inventory = await Inventory.find({ pharmacyId: pharmacy._id }).populate('drugId', 'name strength form description imageUrl').lean();
  const lowStockCount = inventory.filter((item) => Number(item.quantity || 0) > 0 && Number(item.quantity || 0) < 10).length;
  const outOfStockCount = inventory.filter((item) => Number(item.quantity || 0) <= 0).length;
  return {
    pharmacy: normalizePharmacy(pharmacy, inventory.length),
    stats: {
      total_inventory_items: inventory.length,
      low_stock_count: lowStockCount,
      out_of_stock_count: outOfStockCount,
    },
    inventory: inventory.map((item) => ({
      drug: { id: item.drugId?._id?.toString() || '', name: item.drugId?.name || '', strength: item.drugId?.strength || '', form: item.drugId?.form || '', description: item.drugId?.description || '' },
      pharmacy: normalizePharmacy(pharmacy, inventory.length),
      inventory: { id: item._id.toString(), pharmacy_id: pharmacy._id.toString(), drug_id: item.drugId?._id?.toString() || '', price: item.price, quantity: item.quantity, stock_status: stockStatusFromQuantity(item.quantity), last_updated: item.lastUpdated },
    })),
  };
}

async function createPharmacy(payload) {
  const pharmacy = await Pharmacy.create({
    name: payload.name,
    address: payload.address,
    phone: payload.phone || '',
    email: payload.email || '',
    workingHours: payload.working_hours || '',
    googleMapsUrl: payload.google_maps_url || '',
    latitude: payload.latitude ?? 30.0444,
    longitude: payload.longitude ?? 31.2357,
    rating: payload.rating ?? 0,
    status: payload.status || 'active',
    isFeatured: Boolean(payload.is_featured),
    imageUrl: payload.image_url || null,
  });
  return normalizePharmacy(pharmacy.toObject(), 0);
}

async function updatePharmacy(id, payload, authUser = null, authMeta = null) {
  validateObjectId(id);
  assertPharmacyAccess(id, authUser, authMeta);
  const pharmacy = await Pharmacy.findById(id);
  if (!pharmacy) throw new AppError('Pharmacy not found', 404);
  const mapping = {
    working_hours: 'workingHours',
    google_maps_url: 'googleMapsUrl',
    is_featured: 'isFeatured',
    image_url: 'imageUrl',
  };
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined) return;
    const modelKey = mapping[key] || key;
    pharmacy[modelKey] = value;
  });
  await pharmacy.save();
  const inventoryCount = await Inventory.countDocuments({ pharmacyId: pharmacy._id });
  return normalizePharmacy(pharmacy.toObject(), inventoryCount);
}

async function deletePharmacy(id, authUser = null, authMeta = null) {
  validateObjectId(id);
  assertPharmacyAccess(id, authUser, authMeta);
  const pharmacy = await Pharmacy.findById(id);
  if (!pharmacy) throw new AppError('Pharmacy not found', 404);
  await Inventory.deleteMany({ pharmacyId: pharmacy._id });
  await Pharmacy.findByIdAndDelete(pharmacy._id);
  return { id, deleted: true };
}

module.exports = { listPharmacies, getPharmacyDetails, createPharmacy, updatePharmacy, deletePharmacy };
