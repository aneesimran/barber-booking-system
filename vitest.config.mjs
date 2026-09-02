import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

import react from "@vitejs/plugin-react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  oxc: {
    include: /\.(m?ts|[jt]sx?)$/,
    exclude: [/\/node_modules\//],
    lang: "jsx",
  },
  test: {
    globals: true,
    include: ["__tests__/**/*.test.{js,jsx,mjs}"],
    environment: "node",
    environmentMatchGlobs: [["__tests__/components/**", "jsdom"]],
    setupFiles: ["./__tests__/setup.js"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    env: {
      NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaSyFakeKeyForTestingPurposesOnly123456",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "barber-booking-d6dd5",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "barber-booking-d6dd5.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "barber-booking-d6dd5.firebasestorage.app",
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
      NEXT_PUBLIC_FIREBASE_APP_ID: "1:1234567890:web:abcdef123456",
      NEXT_PUBLIC_ADMIN_EMAILS: "aneeshairdresser@gmail.com,aneesimran@outlook.com,ali_raza89@hotmail.co.uk",
      CRON_SECRET: "test-cron-secret",
      STRIPE_SECRET_KEY: "sk_test_mock_stripe_key",
      RESEND_API_KEY: "re_test_mock_resend_key",
      TWILIO_ACCOUNT_SID: "AC_mock_twilio_account_sid",
      TWILIO_AUTH_TOKEN: "mock_twilio_auth_token",
      TWILIO_PHONE_NUMBER: "+447000000000",
    },
  },
});
