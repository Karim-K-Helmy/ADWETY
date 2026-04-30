const { z } = require('zod');
const { isValidObjectId } = require('../../utils/helpers');

const statusSchema = z.enum(['pending', 'approved', 'rejected', 'active', 'inactive']);
const objectIdSchema = z.string().refine(isValidObjectId, 'Invalid ObjectId format');
const safeText = (min = 0, max = 2000) => z.string().min(min).max(max).refine((value) => !/<[^>]*>|javascript:|on\w+\s*=|data:/i.test(value), 'Invalid characters detected');
const safeUrl = z.string().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Only HTTP/HTTPS URLs are allowed');

const listSchema = z.object({
  body: z.object({}).strict(),
  query: z.object({
    featured: z.enum(['true', 'false']).optional(),
    q: z.string().max(100).optional(),
    status: statusSchema.optional(),
  }).strict(),
  params: z.object({}).strict(),
});

const byIdSchema = z.object({
  body: z.object({}).strict(),
  query: z.object({}).strict(),
  params: z.object({ id: objectIdSchema }),
});

const createBody = z.object({
  name: safeText(2, 200),
  address: safeText(3, 500),
  phone: z.string().max(32).optional().default(''),
  email: z.string().email().optional().or(z.literal('')).default(''),
  working_hours: safeText(0, 200).optional().default(''),
  status: statusSchema.optional().default('active'),
  rating: z.coerce.number().min(0).max(5).optional().default(0),
  latitude: z.coerce.number().min(-90).max(90).optional().default(30.0444),
  longitude: z.coerce.number().min(-180).max(180).optional().default(31.2357),
  google_maps_url: safeUrl.optional().or(z.literal('')).default(''),
  is_featured: z.boolean().optional().default(false),
  image_url: safeUrl.optional().nullable(),
}).strict();

const createSchema = z.object({ body: createBody, query: z.object({}).strict(), params: z.object({}).strict() });
const updateSchema = z.object({ body: createBody.partial().strict(), query: z.object({}).strict(), params: z.object({ id: objectIdSchema }) });

module.exports = { listSchema, byIdSchema, createSchema, updateSchema };
