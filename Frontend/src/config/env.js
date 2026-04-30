export const env = {
  isProduction: import.meta.env.PROD,
  appName: import.meta.env.VITE_APP_NAME || 'ADWETY Dashboard',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:6500/api/v1',
  csrfCookieName: import.meta.env.VITE_CSRF_COOKIE_NAME || 'adwety_csrf',
  port: Number(import.meta.env.VITE_PORT || 6501),
  defaultRole: import.meta.env.VITE_DEFAULT_ROLE || 'super_admin',
  enableDemoAuth: String(import.meta.env.VITE_ENABLE_DEMO_AUTH || 'false') === 'true',
  maxUploadSizeMb: Number(import.meta.env.VITE_MAX_UPLOAD_SIZE_MB || 10),
  aiProvider: import.meta.env.VITE_AI_PROVIDER || 'gemini',
  geminiModel: import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash',
  customAiLabel: import.meta.env.VITE_CUSTOM_AI_LABEL || 'Future Custom Model',
  enableAiScan: String(import.meta.env.VITE_ENABLE_AI_SCAN || 'true') === 'true',
  appVersion: import.meta.env.VITE_APP_VERSION || '2.2.0-security-deliverability',
  demoUsers: {
    owner: {
      email: import.meta.env.VITE_OWNER_EMAIL || '',
      password: '',
      name: import.meta.env.VITE_OWNER_NAME || 'System Owner',
    },
    super_admin: {
      email: import.meta.env.VITE_SUPER_ADMIN_EMAIL || '',
      password: '',
      name: import.meta.env.VITE_SUPER_ADMIN_NAME || 'Super Admin',
    },
    pharmacy_admin: {
      email: import.meta.env.VITE_PHARMACY_ADMIN_EMAIL || '',
      password: '',
      name: import.meta.env.VITE_PHARMACY_ADMIN_NAME || 'Pharmacy Manager',
      pharmacyName: import.meta.env.VITE_DEMO_PHARMACY_NAME || '',
    },
    support_admin: {
      email: import.meta.env.VITE_SUPPORT_ADMIN_EMAIL || '',
      password: '',
      name: import.meta.env.VITE_SUPPORT_ADMIN_NAME || 'Support Admin',
    },
    user: {
      email: import.meta.env.VITE_USER_EMAIL || '',
      password: '',
      name: import.meta.env.VITE_USER_NAME || 'ADWETY User',
    },
  },
};
