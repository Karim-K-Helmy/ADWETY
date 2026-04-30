const { z } = require('zod');

const passwordSchema = z.string()
  .min(10, 'Password must be at least 10 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[0-9]/, 'Password must include a number');

const otpSchema = z.string().min(4).max(10).regex(/^[0-9]+$/, 'OTP must be numeric');
const otpTokenSchema = z.string().min(32).max(256);

const registerSchema = z.object({
  body: z.object({
    full_name: z.string().min(2).max(100),
    email: z.string().email().max(254),
    password: passwordSchema,
    phone_number: z.string().max(32).optional(),
  }),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

const verifyOtpSchema = z.object({
  body: z.object({
    otp_token: otpTokenSchema,
    otp: otpSchema,
  }),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(72),
  }),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

const forgotPasswordSchema = z.object({
  body: z.object({ email: z.string().email().max(254) }),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

const resetPasswordSchema = z.object({
  body: z.object({
    otp_token: otpTokenSchema,
    otp: otpSchema,
    new_password: passwordSchema,
  }).strict(),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
};
