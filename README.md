# ✈️ Avioscanner

**Avioscanner** is an award-travel monitoring dashboard built for people who want to systematically track premium-cabin opportunities, not run one-off searches.

Built for efficiency and elegance, Avioscanner leverages the [Seats.aero](https://seats.aero) Partner API to provide real-time status and mileage costs directly on your dashboard.

---

## 🎯 How Avioscanner Is Different

Most award tools are optimized for ad-hoc search. Avioscanner is optimized for repeat monitoring workflows:

- **Trip-Idea First Model**: Save and manage recurring target routes/date windows as persistent “Trip Ideas.”
- **Portfolio View, Not Single Query View**: Track multiple ideas simultaneously with at-a-glance status.
- **Decision-Ready Summaries**: Surface the top cheapest options directly on each card so you can triage quickly.
- **API-Efficient Scanning**: Uses a hybrid query strategy (broad vs targeted) to maximize useful results while controlling request load.

## ✨ Key Features

- **Dynamic Trip Management**: Create and track "Trip Ideas" with customizable origins, destinations, and date ranges.
- **In-Place Editing**: Update your trip parameters directly from the detail view and trigger instant re-scans.
- **Cheapest Options at a Glance**: Each trip card highlights the top 2 cheapest mileage deals found, presented in high-visibility "square box" status indicators.
- **Hybrid Search Strategy**: Intelligent API orchestration that alternates between broad and targeted fetches to maximize results while respecting API limits.
- **Premium UI**: A glassmorphism-inspired design with a dark-mode focus, smooth animations, and precise mathematical alignment.

## 🛠️ Technology Stack

- **Frontend**: Vite + Vanilla JavaScript (ESM)
- **Backend Proxy**: Node.js + Express (handles API authentication and CORS)
- **Styling**: Modern CSS3 with custom variables and flexbox layout
- **API**: [Seats.aero Partner API](https://seats.aero/partnerapi)

## 🔐 Authentication

Avioscanner supports both frontend-key auth and an OAuth2 beta flow:

- **Current setup**: user enters a Seats.aero Partner API key in the app Settings panel.  
  The key is stored in browser `localStorage` and sent to the backend proxy via `x-api-key`.
- **OAuth2 beta**: click **Connect with Seats.aero** in Settings after configuring backend OAuth env vars.

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- A **Seats.aero Partner API Key**

### Setup
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. (Optional) Create a `.env` file in the root directory for backend settings:
   ```env
   # Optional local port override (default: 3001)
   # PORT=3001

   # OAuth2 mode (beta)
   # SEATS_AERO_CLIENT_ID=your_client_id_here
   # SEATS_AERO_CLIENT_SECRET=your_client_secret_here
   # SEATS_AERO_REDIRECT_URI=https://your-domain.com/api/oauth/callback
   ```
4. Start the app and authenticate in Settings:
   - Paste your Seats.aero API key, or
   - Use **Connect with Seats.aero** (OAuth2 beta) if configured.

### Running Locally
Start the development server (runs both frontend and backend):
```bash
npm run dev
```
The dashboard will be available at `http://localhost:3000`.

---

> [!TIP]
> **Pro Tip**: Cabin class and seat count are global settings. Change them once to see how they impact all your tracked trips instantly!
