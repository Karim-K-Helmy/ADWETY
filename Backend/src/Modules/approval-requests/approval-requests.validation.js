const { z } = require('zod');
const { isValidObjectId } = require('../../utils/helpers');

const objectIdSchema = z.string().refine(isValidObjectId, 'Invalid ObjectId format');
const safeText = z.string()
  .max(500)
  .refine((value) => !/<[^>]*>|javascript:|on\w+\s*=|data:/i.test(value), 'Invalid characters detected');

const listSchema = z.object({
  body: z.object({}).strict(),
  query: z.object({
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    type: z.string().max(50).optional(),
    role: z.enum(['super_admin', 'pharmacy_admin', 'support_admin']).optional(),
  }).strict(),
  params: z.object({}).strict(),
});

const actionSchema = z.object({
  body: z.object({}).strict(),
  query: z.object({}).strict(),
  params: z.object({ id: objectIdSchema }),
});

const rejectSchema = z.object({
  body: z.object({ rejection_reason: safeText.optional().default('Rejected by Owner') }).strict(),
  query: z.object({}).strict(),
  params: z.object({ id: objectIdSchema }),
});

module.exports = { listSchema, actionSchema, rejectSchema };
