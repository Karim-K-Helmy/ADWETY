const { z } = require('zod');
const { isValidObjectId } = require('../../utils/helpers');

const objectIdSchema = z.string().refine(isValidObjectId, 'Invalid ObjectId format');
const roleSchema = z.enum(['super_admin', 'pharmacy_admin', 'support_admin']);
const approvalStatusSchema = z.enum(['pending', 'approved', 'rejected']);

const passwordSchema = z.string()
  .min(10, 'Password must be at least 10 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[0-9]/, 'Password must include a number');

const safeText = (min = 0, max = 200) => z.string()
  .min(min)
  .max(max)
  .refine((value) => !/<[^>]*>|javascript:|on\w+\s*=|data:/i.test(value), 'Invalid characters detected');

const listSchema = z.object({
  body: z.object({}).strict(),
  query: z.object({
    role: roleSchema.optional(),
    approval_status: approvalStatusSchema.optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  }).strict(),
  params: z.object({}).strict(),
});

const createSchema = z.object({
  body: z.object({
    full_name: safeText(2, 100),
    email: z.string().email().max(254),
    password: passwordSchema,
    phone_number: z.string().max(32).optional().default(''),
    role: roleSchema,
    pharmacy_id: objectIdSchema.optional().nullable(),
  }).strict(),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

const updateSchema = z.object({
  body: z.object({
    full_name: safeText(2, 100).optional(),
    phone_number: z.string().max(32).optional(),
    role: roleSchema.optional(),
    pharmacy_id: objectIdSchema.optional().nullable(),
    is_active: z.boolean().optional(),
  }).strict(),
  query: z.object({}).strict(),
  params: z.object({ id: objectIdSchema }),
});

const byIdSchema = z.object({
  body: z.object({}).strict(),
  query: z.object({}).strict(),
  params: z.object({ id: objectIdSchema }),
});

module.exports = { listSchema, createSchema, updateSchema, byIdSchema };
