import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { env } from '../config/env';
import { getJson, postJson } from '../lib/api';
import { clearStoredSession, getStoredSession, setStoredSession } from '../lib/storage';

const AuthContext = createContext(null);

function inferFallbackRole(email, preferredRole) {
  if (preferredRole) return preferredRole;
  if (email === env.demoUsers.super_admin.email) return 'super_admin';
  if (email === env.demoUsers.pharmacy_admin.email) return 'pharmacy_admin';
  if (email === env.demoUsers.support_admin.email) return 'support_admin';
  return 'user';
}

function buildSession(payload, fallback = {}) {
  const role = payload.role || (payload.account_type === 'user' ? 'user' : null);
  const demoMode = Boolean(payload.demo_mode || fallback.demoMode);
  if (!role && !demoMode) {
    throw new Error('Invalid session payload from server.');
  }
  const accountType = payload.account_type || (role === 'user' ? 'user' : 'admin');
  return {
    id: payload.id || (demoMode ? 'demo-user' : ''),
    email: payload.email || fallback.email || '',
    name: payload.name || fallback.email || 'ADWETY User',
    role: role || fallback.role || 'user',
    accountType,
    pharmacyName: role === 'pharmacy_admin' ? (payload.pharmacy_name || fallback.pharmacyName || '') : null,
    demoMode,
    token: null,
    emailVerified: Boolean(payload.email_verified),
    phoneNumber: payload.phone_number || fallback.phoneNumber || '',
    phoneVerified: Boolean(payload.phone_verified),
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isBooting, setIsBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      try {
        const marker = getStoredSession();
        if (!marker) return;
        const result = await getJson('/profile/me');
        if (cancelled) return;
        const profile = result?.data || {};
        const nextSession = buildSession(profile, { email: profile.email, role: profile.role });
        setSession(nextSession);
        setStoredSession({ authenticated: true });
      } catch (_error) {
        if (!cancelled) {
          setSession(null);
          clearStoredSession();
        }
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    }

    hydrateSession();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => ({
    session,
    isAuthenticated: Boolean(session),
    isBooting,
    async login({ email, password, role }) {
      try {
        const result = await postJson('/auth/login', { email, password });
        const payload = result?.data || {};
        if (payload.requires_otp) {
          return { ...payload, email, role };
        }
        const nextSession = buildSession(payload, { email, role });
        setSession(nextSession);
        setStoredSession({ authenticated: true });
        return nextSession;
      } catch (backendError) {
        if (!env.enableDemoAuth || env.isProduction) throw backendError;

        const preset = env.demoUsers[role];
        if (!preset || !preset.password) throw backendError;
        if (email !== preset.email || password !== preset.password) throw backendError;

        const nextSession = buildSession({
          email: preset.email,
          name: preset.name,
          role,
          demo_mode: true,
          token: null,
        }, { email: preset.email, role, demoMode: true, pharmacyName: preset.pharmacyName });
        setSession(nextSession);
        setStoredSession({ authenticated: true });
        return nextSession;
      }
    },
    async verifyLoginOtp({ otpToken, otp, email, role }) {
      const result = await postJson('/auth/login/verify-otp', { otp_token: otpToken, otp });
      const payload = result?.data || {};
      const nextSession = buildSession(payload, { email, role });
      setSession(nextSession);
      setStoredSession({ authenticated: true });
      return nextSession;
    },
    async register({ fullName, email, password, phoneNumber }) {
      const result = await postJson('/auth/register', {
        full_name: fullName,
        email,
        password,
        phone_number: phoneNumber,
      });
      const payload = result?.data || {};
      if (payload.requires_otp || payload.queued) return { ...payload, email, role: 'user' };
      const nextSession = buildSession(payload, { email, role: 'user' });
      setSession(nextSession);
      setStoredSession({ authenticated: true });
      return nextSession;
    },
    async verifyRegisterOtp({ otpToken, otp, email }) {
      const result = await postJson('/auth/register/verify-otp', { otp_token: otpToken, otp });
      const payload = result?.data || {};
      const nextSession = buildSession(payload, { email, role: 'user' });
      setSession(nextSession);
      setStoredSession({ authenticated: true });
      return nextSession;
    },
    async requestPasswordReset({ email }) {
      const result = await postJson('/auth/forgot-password', { email });
      return result?.data || {};
    },
    async resetPassword({ email, otpToken, otp, newPassword }) {
      const body = {
        otp,
        new_password: newPassword,
      };
      if (otpToken) body.otp_token = otpToken;
      else throw new Error('OTP token is required to reset your password.');
      const result = await postJson('/auth/reset-password', body);
      return result?.data || {};
    },
    updateSessionProfile(profile) {
      if (!profile || !session) return null;
      const nextSession = {
        ...session,
        email: profile.email || session.email,
        name: profile.name || session.name,
        role: profile.role || session.role,
        accountType: profile.account_type || session.accountType,
        phoneNumber: profile.phone_number || session.phoneNumber || '',
        emailVerified: Boolean(profile.email_verified),
        phoneVerified: Boolean(profile.phone_verified),
      };
      setSession(nextSession);
      setStoredSession({ authenticated: true });
      return nextSession;
    },
    logout() {
      postJson('/auth/logout', {}).catch(() => {});
      setSession(null);
      clearStoredSession();
    },
  }), [session, isBooting]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}
