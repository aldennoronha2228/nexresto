# HotelPro — Customer Digital Menu

This is the customer-facing frontend for the Premium Hotel Menu System. It is designed to be accessed via mobile devices when guests scan a table's QR code.

## 🚀 Two-Part System architecture
This repository (`customer-menu` branch) contains the **Customer Menu**.
The **Admin Dashboard** is located on the `main` branch of this repository.

### Customer Menu Features
- Mobile-first, highly polished UI using Radix UI primitives and complex animations.
- Dynamic categorization and instant search.
- Seamless cart management and order placement.
- Tied directly to table numbers via URL parameters (e.g., `?table=T-01`).

## 🛠️ Tech Stack
- **Framework:** Next.js 16 (App Router)
- **UI Components:** shadcn/ui + Radix UI
- **Styling:** Tailwind CSS + Framer Motion
- **Database:** Supabase (Used by the dashboard to read/write real-time orders)

## 💻 Local Development Setup

To test the end-to-end QR code flow, this server must be reachable by phones on the same local Wi-Fi network.

### 1. Environment Variables
Create a `.env.local` file in the root of this project:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_RESTAURANT_ID=rest001

# Set to your machine's LAN IP
NEXT_PUBLIC_MENU_BASE_URL=http://<YOUR_LAN_IP>:3001
NEXT_PUBLIC_MENU_CUSTOMER_PATH=/customer
```

### 2. Run the Server
We run this on a separate port (`3001`) so it doesn't conflict with the Admin Dashboard (`3000`), and we bind it to `0.0.0.0` so other devices on the LAN can reach it.

```bash
npm install
npm run dev -- --port 3001 --hostname 0.0.0.0
```

The menu will be accessible locally at `http://localhost:3001/customer` and from phones at `http://<YOUR_LAN_IP>:3001/customer`.
# Restaurent
