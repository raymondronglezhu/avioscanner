# ✈️ Avioscanner

**Avioscanner** is a premium mileage award availability tracker. It allows you to monitor flight "Trip Ideas" across multiple airline mileage programs simultaneously, helping you find the absolute best deals for your next adventure.

Built for efficiency and elegance, Avioscanner leverages the [Seats.aero](https://seats.aero) Partner API to provide real-time status and mileage costs directly on your dashboard.

---

## ✨ Key Features

- **Dynamic Trip Management**: Create and track "Trip Ideas" with customizable origins, destinations, and date ranges.
- **In-Place Editing**: Update your trip parameters directly from the detail view and trigger instant re-scans.
- **Cheapest Options at a Glance**: Each trip card highlights the top 2 cheapest mileage deals found, presented in high-visibility "square box" status indicators.
- **Hybrid Search Strategy**: Intelligent API orchestration that alternates between broad and targeted fetches to maximize results while respecting API limits.
- **Premium UI**: A glassmorphism-inspired design with a dark-mode focus, smooth animations, and precise mathematical alignment.

## 🛠️ Technology Stack

- **Frontend**: Vite + Vanilla JavaScript (ESM)
- **Backend Proxy**: Node.js + Express (Handles API authentication and CORS)
- **Styling**: Modern CSS3 with custom variables and flexbox layout
- **API**: [Seats.aero Partner API](https://seats.aero/partnerapi)

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
3. Create a `.env` file in the root directory and add your API key:
   ```env
   SEATS_AERO_API_KEY=your_key_here
   ```

### Running Locally
Start the development server (runs both frontend and backend):
```bash
npm run dev
```
The dashboard will be available at `http://localhost:5173`.

---

> [!TIP]
> **Pro Tip**: Cabin class and seat count are global settings. Change them once to see how they impact all your tracked trips instantly!
