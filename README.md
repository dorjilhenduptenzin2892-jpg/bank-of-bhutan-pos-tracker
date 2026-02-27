<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/2bf5f6ca-1637-437b-9749-96840e0313d1

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create `.env.local` in the project root (you can copy from `.env.example`) and set:
   - `GEMINI_API_KEY=...`
   - `VITE_GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/.../exec`
3. In Google Apps Script, deploy as **Web app** and ensure:
   - URL ends with `/exec` (not `/dev`)
   - Access is allowed for your usage (for public fetch, use "Anyone")
4. Run the app:
   `npm run dev`
