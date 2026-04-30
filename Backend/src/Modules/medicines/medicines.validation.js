const { z } = require('zod');
const { isValidObjectId } = require('../../utils/helpers');

const stockStatus = z.enum(['in_stock', 'low_stock', 'out_of_stock', 'unknown']).optional();
const objectIdSchema = z.string().refine(isValidObjectId, 'Invalid ObjectId format');
const safeText = (min = 0, max = 2000) => z.string().min(min).max(max).refine((value) => !/<[^>]*>|javascript:|on\w+\s*=|data:/i.test(value), 'Invalid characters detected');
const safeUrl = z.string().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Only HTTP/HTTPS URLs are allowed');

const listSchema = z.object({
  body: z.object({}).strict(),
  query: z.object({
    q: z.string().max(100).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
    category: z.string().max(100).optional(),
    pharmacy_id: objectIdSchema.optional(),
    stock_status: stockStatus,
  }).strict(),
  params: z.object({}).strict(),
});

const byIdSchema = z.object({
  body: z.object({}).strict(),
  query: z.object({ inventory_id: objectIdSchema.optional() }).strict(),
  params: z.object({ id: objectIdSchema }),
});

const createSchema = z.object({
  body: z.object({
    name: safeText(2, 200),
    category: safeText(2, 100),
    strength: safeText(1, 100),
    form: safeText(1, 100),
    price: z.coerce.number().min(0).max(999999),
    quantity: z.coerce.number().min(0).max(999999),
    pharmacy_id: objectIdSchema,
    description: safeText(0, 2000).optional().default(''),
    image_url: safeUrl.optional().nullable(),
  }).strict(),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

const updateSchema = z.object({
  body: z.object({
    inventory_id: objectIdSchema.optional().nullable(),
    name: safeText(2, 200).optional(),
    category: safeText(2, 100).optional(),
    strength: safeText(1, 100).optional(),
    form: safeText(1, 100).optional(),
    price: z.coerce.number().min(0).max(999999).optional(),
    quantity: z.coerce.number().min(0).max(999999).optional(),
    pharmacy_id: objectIdSchema.optional().nullable(),
    description: safeText(0, 2000).optional(),
    image_url: safeUrl.optional().nullable(),
  }).strict(),
  query: z.object({}).strict(),
  params: z.object({ id: objectIdSchema }),
});

module.exports = { listSchema, byIdSchema, createSchema, updateSchema };
