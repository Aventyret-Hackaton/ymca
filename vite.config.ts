import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// The camera only works on HTTPS (or localhost). `npm run dev:phone` serves
// the app on the local network with a self-signed certificate so it can be
// opened on a phone.
export default defineConfig(({ mode }) => ({
  plugins: mode === "phone" ? [basicSsl()] : [],
}));
