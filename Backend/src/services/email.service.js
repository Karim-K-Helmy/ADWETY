const crypto = require('crypto');
const env = require('../config/env');
const { AppError } = require('../utils/error-handling');

let cachedTransporter = null;

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function maskDestination(value = '') {
  const text = String(value || '');
  const [name, domain] = text.split('@');
  if (!domain) return text.replace(/.(?=.{2})/g, '*');
  return `${name.slice(0, 2)}***@${domain}`;
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  if (env.mailDriver === 'console') {
    if (['production', 'staging'].includes(env.nodeEnv)) {
      throw new AppError('Mail service is not available.', 503);
    }
    cachedTransporter = {
      async sendMail(payload) {
        console.log('[ADWETY MAIL CONSOLE]', {
          to: maskDestination(payload.to),
          subject: payload.subject,
          messageId: `console-${Date.now()}`,
        });
        return { messageId: `console-${Date.now()}` };
      },
    };
    return cachedTransporter;
  }

  if (env.mailDriver !== 'smtp') {
    throw new AppError('Mail service is not available.', 503);
  }

  if (!env.smtpHost || !env.smtpPort || !env.smtpUser || !env.smtpPass) {
    throw new AppError('Mail service is not available.', 503);
  }

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (_error) {
    throw new AppError('Mail service is not available.', 503);
  }

  cachedTransporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
    connectionTimeout: env.smtpConnectionTimeoutMs,
    greetingTimeout: env.smtpGreetingTimeoutMs,
    socketTimeout: env.smtpSocketTimeoutMs,
    tls: {
      rejectUnauthorized: env.smtpRejectUnauthorized,
    },
  });

  return cachedTransporter;
}

function buildOtpEmail({ otp, purpose, destination }) {
  const purposeMap = {
    register: {
      arTitle: 'تأكيد حسابك في ADWETY',
      enTitle: 'Verify your ADWETY account',
      arLead: 'أدخل كود التحقق التالي لإكمال إنشاء حسابك.',
      enLead: 'Enter this verification code to finish creating your account.',
      subject: 'Your ADWETY verification code',
    },
    login: {
      arTitle: 'تسجيل الدخول إلى ADWETY',
      enTitle: 'ADWETY sign-in verification',
      arLead: 'أدخل كود التحقق التالي لإكمال تسجيل الدخول.',
      enLead: 'Enter this verification code to complete your sign in.',
      subject: 'Your ADWETY sign-in code',
    },
    password_reset: {
      arTitle: 'إعادة تعيين كلمة المرور',
      enTitle: 'Reset your ADWETY password',
      arLead: 'أدخل كود التحقق التالي لإعادة تعيين كلمة المرور الخاصة بحسابك.',
      enLead: 'Enter this verification code to reset your account password.',
      subject: 'Your ADWETY password reset code',
    },
    profile_update: {
      arTitle: 'تأكيد تعديل بيانات الحساب',
      enTitle: 'Confirm your ADWETY profile update',
      arLead: 'أدخل كود التحقق التالي لتأكيد البريد الإلكتروني الجديد.',
      enLead: 'Enter this verification code to confirm the new email address on your account.',
      subject: 'Your ADWETY profile verification code',
    },
  };

  const copy = purposeMap[purpose] || purposeMap.register;
  const safeOtp = escapeHtml(otp);
  const safeDestination = escapeHtml(destination);
  const expires = env.otpExpiresMinutes;
  const text = [
    copy.enTitle,
    '',
    `Your ADWETY verification code is: ${otp}`,
    `This code expires in ${expires} minutes.`,
    '',
    'If you did not request this code, you can safely ignore this message.',
    '',
    'Thanks,',
    'ADWETY Team',
    '',
    `Sent to: ${destination}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(copy.subject)}</title>
</head>
<body style="margin:0;background:#f4f8fb;font-family:Arial,Tahoma,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f8fb;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;overflow:hidden;">
          <tr>
            <td style="background:#0f766e;padding:28px;text-align:center;color:#ffffff;">
              <div style="font-weight:700;font-size:18px;letter-spacing:2px;">ADWETY</div>
              <h1 style="margin:18px 0 0;font-size:26px;line-height:1.35;font-weight:800;">${escapeHtml(copy.arTitle)}</h1>
              <p style="margin:12px 0 0;font-size:15px;line-height:1.8;color:#e6fffb;">${escapeHtml(copy.arLead)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 28px;text-align:center;">
              <p style="margin:0 0 16px;font-size:14px;color:#475569;">تم إرسال الرسالة إلى <strong style="color:#0f172a;direction:ltr;unicode-bidi:bidi-override;">${safeDestination}</strong></p>
              <div style="display:inline-block;background:#f8fafc;border:1px solid #cbd5e1;border-radius:18px;padding:16px 28px;font-size:36px;letter-spacing:10px;font-weight:900;color:#020617;direction:ltr;">${safeOtp}</div>
              <p style="margin:20px 0 0;font-size:14px;line-height:1.7;color:#475569;">ينتهي هذا الكود خلال <strong>${expires}</strong> دقائق. لا تشارك هذا الكود مع أي شخص.</p>
              <div style="height:1px;background:#e2e8f0;margin:28px 0;"></div>
              <div dir="ltr" style="text-align:left;">
                <h2 style="margin:0;font-size:18px;color:#0f172a;">${escapeHtml(copy.enTitle)}</h2>
                <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#475569;">${escapeHtml(copy.enLead)} The code expires in ${expires} minutes.</p>
                <p style="margin:14px 0 0;font-size:13px;line-height:1.7;color:#64748b;">If you did not request this code, you can safely ignore this email.</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:18px 28px;text-align:center;font-size:12px;color:#64748b;">
              ADWETY Team · This is an automatic security message.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: copy.subject, text, html };
}

async function sendMail(payload) {
  try {
    const transporter = getTransporter();
    const fromName = env.mailFromName || 'ADWETY';
    const fromEmail = env.mailFromEmail || env.smtpUser;
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      sender: fromEmail,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      replyTo: fromEmail,
      headers: {
        'X-Entity-Ref-ID': crypto.randomUUID(),
        'X-Auto-Response-Suppress': 'All',
      },
    });

    console.log('[ADWETY MAIL SENT]', {
      to: maskDestination(payload.to),
      subject: payload.subject,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
      driver: env.mailDriver,
    });

    return info;
  } catch (error) {
    cachedTransporter = null;
    console.error('[ADWETY MAIL ERROR]', {
      code: error.code,
      command: error.command,
      responseCode: error.responseCode,
      response: error.response,
      message: error.message,
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      user: env.smtpUser ? maskDestination(env.smtpUser) : '',
    });

    const message = String(error.message || error.response || '');
    const isAuthError = message.includes('535') || error.responseCode === 535 || error.code === 'EAUTH';
    const isConnectionError = ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED'].includes(error.code);

    if (isAuthError) {
      throw new AppError('Mail service is not available.', 503);
    }

    if (isConnectionError) {
      throw new AppError('Mail service is not available.', 503);
    }

    throw new AppError('Mail service is not available.', 503);
  }
}

async function sendSms({ to, message }) {
  console.log('[ADWETY SMS]', {
    provider: env.smsProvider,
    from: env.smsFrom,
    to,
    message: env.nodeEnv === 'production' ? '[redacted]' : message,
  });
  return true;
}

async function sendOtp({ email, phoneNumber, otp, purpose }) {
  if (env.showDevOtp && !['production', 'staging'].includes(env.nodeEnv)) {
    const maskedOtp = String(otp).slice(0, 2) + '*'.repeat(Math.max(0, String(otp).length - 2));
    console.log('[ADWETY DEV OTP]', { email: maskDestination(email), phoneNumber: phoneNumber ? maskDestination(phoneNumber) : '', purpose, otpHint: maskedOtp });
  }

  const normalizedPurpose = String(purpose || '').replace(/_/g, ' ');

  if (env.otpDeliveryChannel === 'sms' && phoneNumber) {
    const message = `Your ADWETY ${normalizedPurpose} OTP is ${otp}. It expires in ${env.otpExpiresMinutes} minutes.`;
    await sendSms({ to: phoneNumber, message });
    return { channel: 'sms', destination: phoneNumber };
  }

  if (!email) throw new AppError('OTP email destination is missing.', 422);

  const emailMessage = buildOtpEmail({ otp, purpose, destination: email });
  await sendMail({
    to: email,
    ...emailMessage,
  });

  return { channel: 'email', destination: email };
}

module.exports = { sendMail, sendSms, sendOtp, buildOtpEmail, getTransporter };
