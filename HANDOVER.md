# Avioscanner — Project Handover & Overview

This document provides a high-level context for continuing the development of **Avioscanner** within Cursor. It summarizes the architecture, core logic, and recent enhancements so you can pick up the work immediately without a line-by-line audit.

## 🚀 Project Overview
**Avioscanner** is a specialized flight search dashboard designed to track award availability using the **Seats.aero Partner API**. Users manage "Trip Ideas" and the dashboard scans for the best mileage deals across multiple airline programs.

## 🏗️ Technical Architecture

### 1. Frontend: Vanilla JS & Vite
-   **Core File**: `src/main.js` handles all state management, API orchestration, and modal logic.
-   **Styling**: `src/style.css` uses a modern, glassmorphism-inspired design system with CSS variables.
-   **Persistence**: 
    -   Trips and global settings (cabin class, seat count) are saved to `localStorage`.
    -   `availabilityCache`: An in-memory object (also saved to `localStorage`) that tracks the status and results of each trip scan.

### 2. Backend: Node/Express Proxy
-   **File**: `server/index.js` acts as a thin proxy.
-   **Role**: Forwards frontend-provided API keys (`x-api-key`) into the `Partner-Authorization` header for requests to `https://seats.aero/partnerapi`.
-   **Benefit**: Bypasses CORS restrictions and centralizes API proxying/observability.

## 💡 Core Logic: The "Hybrid Strategy"
Located in `searchAvailability()` (`src/main.js`), this is critical for API performance:
-   **Specific Fetch (1-2 programs)**: If the user selects only 1 or 2 mileage programs, the app fires parallel, targeted requests with the `source` parameter.
-   **Broad Fetch (3+ programs)**: To avoid hitting API rate limits or excessive requests, if 3+ programs are selected, it performs a single broad search and filters the results client-side in the `refreshAll()` loop.

## ✨ Key Features & Recent Enhancements

### Trip Management
-   **In-Place Editing**: You can edit a trip's Origin, Destination, and Dates directly inside the Detail Modal. Updating triggers an automatic re-scan of that specific trip.
-   **Global Settings**: Cabin class and seat count are global settings. Changing them clears the cache and triggers a full dashboard refresh.

### Dashboard UI
-   **Trip Cards**: Each card displays a summary of the **top 2 cheapest deals** currently found.
-   -   **Square Box Layout**: These deals are shown in distinct status boxes for high glanceability.
-   **Availability Indicators**: Status dots (idle, loading, success, error) provide live feedback during scans.

## 🛠️ Infrastructure & Setup
-   **API Key (current)**: User enters key in the frontend Settings panel; app stores it in `localStorage` and sends it to the proxy as `x-api-key`.
-   **OAuth2 (planned)**: Backend-managed token exchange and session handling.
-   **Development**: `npm run dev` starts both the Vite frontend and the Express backend (proxied via `vite.config.js`).

## 📋 Recommended Next Steps
1.  **Mobile Polish**: Ensure the new "Square Box" summaries wrap nicely on very small screens.
2.  **Filter Persistence**: Allow users to save specific search filters (e.g., direct flights only) per-trip.
3.  **Real-Time Status**: Improve the `refreshAll` visual feedback if many trips are being scanned simultaneously.
