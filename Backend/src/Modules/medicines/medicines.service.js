const mongoose = require('mongoose');
const Category = require('../../../DB/Models/category.model');
const Drug = require('../../../DB/Models/drug.model');
const Inventory = require('../../../DB/Models/inventory.model');
const Pharmacy = require('../../../DB/Models/pharmacy.model');
const SearchHistory = require('../../../DB/Models/searchhistory.model');
const { AppError } = require('../../utils/error-handling');
const { makePagination, validateObjectId } = require('../../utils/helpers');
const { escapeRegex } = require('../../utils/security');

function toObjectId(id) {
  validateObjectId(id);
  return new mongoose.Types.ObjectId(id);
}

function stockStatusFromQuantity(quantity) {
  const value = Number(quantity || 0);
  if (value <= 0) return 'out_of_stock';
  if (value < 10) return 'low_stock';
  return 'in_stock';
}

function normalizeMedicine(drug, item = null) {
  return {
    id: drug._id.toString(),
    name: drug.name,
    strength: drug.strength,
    form: drug.form,
    description: drug.description,
    category: drug.categoryId?.name || 'General',
    price: item?.price || 0,
    quantity: item?.quantity || 0,
    stock_status: item ? stockStatusFromQuantity(item.quantity) : 'unknown',
    image_url: drug.imageUrl,
    pharmacy_name: item?.pharmacyId?.name || '',
    pharmacy_id: item?.pharmacyId?._id?.toString() || null,
    inventory_id: item?._id?.toString() || null,
    address: item?.pharmacyId?.address || '',
    distance_km: 0,
    rating: item?.pharmacyId?.rating || 0,
    latitude: item?.pharmacyId?.latitude || 0,
    longitude: item?.pharmacyId?.longitude || 0,
    last_updated: item?.lastUpdated || drug.createdAt,
  };
}

async function ensureCategory(categoryName = 'General') {
  const name = String(categoryName || 'General').trim() || 'General';
  const existing = await Category.findOne({ name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } });
  if (existing) return existing;
  return Category.create({ name, description: `${name} medicines` });
}

async function trimSearchHistory(userId) {
  const oldRecords = await SearchHistory.find({ userId }).sort({ searchedAt: -1 }).skip(50).select('_id').lean();
  if (oldRecords.length) await SearchHistory.deleteMany({ _id: { $in: oldRecords.map((record) => record._id) } });
}

function getPharmacyScope(authUser, authMeta) {
  const role = authUser?.role;
  if (role !== 'pharmacy_admin') return null;
  const pharmacyId = authUser?.pharmacyId;
  if (!pharmacyId) throw new AppError('Forbidden: pharmacy admin is not assigned to a pharmacy', 403);
  return pharmacyId;
}

async function assertInventoryOwnership(inventory, authUser, authMeta) {
  const scope = getPharmacyScope(authUser, authMeta);
  if (!scope) return;
  if (!inventory || String(inventory.pharmacyId) !== String(scope)) {
    throw new AppError('Forbidden: you can only manage your assigned pharmacy inventory', 403);
  }
}

async function listMedicines({ q = '', page = 1, limit = 50, category, pharmacy_id, stock_status }, userId = null, authUser = null, authMeta = null) {
  const scope = getPharmacyScope(authUser, authMeta);
  if (scope && pharmacy_id && String(pharmacy_id) !== String(scope)) {
    throw new AppError('Forbidden: cross-pharmacy access denied', 403);
  }
  const effectivePharmacyId = scope || pharmacy_id;
  const pagination = makePagination({ page, limit });
  const search = String(q || '').trim();
  const safeSearch = escapeRegex(search.slice(0, 80));
  const filter = safeSearch ? { name: { $regex: safeSearch, $options: 'i' } } : {};
  const drugs = await Drug.find(filter)
    .populate('categoryId', 'name')
    .sort({ name: 1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .lean();

  if (userId && search) {
    SearchHistory.create({ userId, queryText: search }).then(() => trimSearchHistory(userId)).catch(() => {});
  }

  const drugIds = drugs.map((drug) => drug._id);
  const inventoryFilter = { drugId: { $in: drugIds } };
  if (effectivePharmacyId) inventoryFilter.pharmacyId = toObjectId(effectivePharmacyId);

  const inventory = await Inventory.find(inventoryFilter)
    .populate('pharmacyId', 'name address latitude longitude rating status phone email workingHours googleMapsUrl')
    .lean();

  let rows = drugs.flatMap((drug) => {
    const items = inventory.filter((entry) => String(entry.drugId) === String(drug._id));
    if (!items.length && !effectivePharmacyId) return [normalizeMedicine(drug)];
    return items.map((item) => normalizeMedicine(drug, item));
  });

  if (category) rows = rows.filter((row) => row.category.toLowerCase() === String(category).toLowerCase());
  if (stock_status) rows = rows.filter((row) => row.stock_status === stock_status);
  return rows;
}

async function getMedicineById(id, authUser = null, authMeta = null) {
  validateObjectId(id);
  const scope = getPharmacyScope(authUser, authMeta);
  const drug = await Drug.findById(id).populate('categoryId', 'name').lean();
  if (!drug) throw new AppError('Medicine not found', 404);
  const inventory = await Inventory.find({ drugId: drug._id, ...(scope ? { pharmacyId: scope } : {}) }).populate('pharmacyId', 'name address latitude longitude rating imageUrl').lean();
  return {
    id: drug._id.toString(),
    name: drug.name,
    strength: drug.strength,
    form: drug.form,
    description: drug.description,
    image_url: drug.imageUrl,
    category: drug.categoryId?.name || 'General',
    pharmacies: inventory.map((item) => ({
      id: item.pharmacyId?._id?.toString() || null,
      name: item.pharmacyId?.name || '',
      address: item.pharmacyId?.address || '',
      latitude: item.pharmacyId?.latitude || 0,
      longitude: item.pharmacyId?.longitude || 0,
      rating: item.pharmacyId?.rating || 0,
      price: item.price,
      quantity: item.quantity,
      inventory_id: item._id.toString(),
      stock_status: stockStatusFromQuantity(item.quantity),
    })),
  };
}

async function createMedicine(payload, authUser = null, authMeta = null) {
  const scope = getPharmacyScope(authUser, authMeta);
  const pharmacyId = scope || payload.pharmacy_id;
  validateObjectId(pharmacyId, 'pharmacy_id');
  const category = await ensureCategory(payload.category);
  const pharmacy = await Pharmacy.findById(pharmacyId);
  if (!pharmacy) throw new AppError('Selected pharmacy was not found', 404);

  const drug = await Drug.create({
    categoryId: category._id,
    name: payload.name,
    strength: payload.strength,
    form: payload.form,
    description: payload.description || '',
    imageUrl: payload.image_url || null,
  });

  const inventory = await Inventory.create({
    pharmacyId: pharmacy._id,
    drugId: drug._id,
    price: payload.price,
    quantity: payload.quantity,
    lastUpdated: new Date(),
  });

  const saved = await Drug.findById(drug._id).populate('categoryId', 'name').lean();
  const savedInventory = await Inventory.findById(inventory._id).populate('pharmacyId', 'name address latitude longitude rating').lean();
  return normalizeMedicine(saved, savedInventory);
}

async function updateMedicine(id, payload, authUser = null, authMeta = null) {
  validateObjectId(id);
  if (payload.inventory_id) validateObjectId(payload.inventory_id, 'inventory_id');
  if (payload.pharmacy_id) validateObjectId(payload.pharmacy_id, 'pharmacy_id');
  const drug = await Drug.findById(id);
  if (!drug) throw new AppError('Medicine not found', 404);

  const scope = getPharmacyScope(authUser, authMeta);
  if (scope) {
    if (payload.pharmacy_id && String(payload.pharmacy_id) !== String(scope)) {
      throw new AppError('Forbidden: cross-pharmacy access denied', 403);
    }
    payload.pharmacy_id = scope;
  }

  let inventory = null;
  const hasInventoryFields = payload.pharmacy_id || payload.price !== undefined || payload.quantity !== undefined;
  if (payload.inventory_id) {
    inventory = await Inventory.findOne({
      _id: payload.inventory_id,
      drugId: drug._id,
      ...(scope ? { pharmacyId: scope } : {}),
    });
    if (!inventory) throw new AppError('Inventory item not found or access denied', 404);
  } else if (payload.pharmacy_id || scope) {
    inventory = await Inventory.findOne({ drugId: drug._id, pharmacyId: payload.pharmacy_id || scope });
  }
  await assertInventoryOwnership(inventory, authUser, authMeta);

  if (!scope) {
    if (payload.category) drug.categoryId = (await ensureCategory(payload.category))._id;
    ['name', 'strength', 'form', 'description'].forEach((field) => {
      if (payload[field] !== undefined) drug[field] = payload[field];
    });
    if (payload.image_url !== undefined) drug.imageUrl = payload.image_url || null;
    await drug.save();
  }

  const nextPharmacyId = scope || payload.pharmacy_id;
  if (!inventory && nextPharmacyId) {
    inventory = new Inventory({ drugId: drug._id, pharmacyId: nextPharmacyId, price: payload.price || 0, quantity: payload.quantity || 0 });
  }

  if (inventory && hasInventoryFields) {
    if (nextPharmacyId) inventory.pharmacyId = nextPharmacyId;
    if (payload.price !== undefined) inventory.price = payload.price;
    if (payload.quantity !== undefined) inventory.quantity = payload.quantity;
    inventory.lastUpdated = new Date();
    await inventory.save();
  }

  const saved = await Drug.findById(drug._id).populate('categoryId', 'name').lean();
  const savedInventory = inventory ? await Inventory.findById(inventory._id).populate('pharmacyId', 'name address latitude longitude rating').lean() : null;
  return normalizeMedicine(saved, savedInventory);
}

async function deleteMedicine(id, { inventory_id } = {}, authUser = null, authMeta = null) {
  validateObjectId(id);
  if (inventory_id) validateObjectId(inventory_id, 'inventory_id');
  const drug = await Drug.findById(id);
  if (!drug) throw new AppError('Medicine not found', 404);

  const scope = getPharmacyScope(authUser, authMeta);
  if (scope && !inventory_id) throw new AppError('Forbidden: pharmacy admins must delete a specific inventory item', 403);

  if (inventory_id) {
    const inventory = await Inventory.findOne({
      _id: inventory_id,
      drugId: drug._id,
      ...(scope ? { pharmacyId: scope } : {}),
    });
    await assertInventoryOwnership(inventory, authUser, authMeta);
    if (!inventory) throw new AppError('Inventory item not found or access denied', 404);
    await Inventory.deleteOne({ _id: inventory._id });
    const remaining = await Inventory.countDocuments({ drugId: drug._id });
    if (!remaining) await Drug.findByIdAndDelete(drug._id);
    return { id, inventory_id, deleted: true, drug_deleted: remaining === 0 };
  }

  await Inventory.deleteMany({ drugId: drug._id });
  await Drug.findByIdAndDelete(drug._id);
  return { id, deleted: true, drug_deleted: true };
}

module.exports = {
  listMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  stockStatusFromQuantity,
};
