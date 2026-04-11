# 📖 HotelPro — Full Project Brief

> A complete breakdown of **every single file** in this codebase. Written in plain language so anyone can understand what's happening without needing to read the source code.

---

## 🗂️ Project Overview

**HotelPro** is a full-stack restaurant management web app built with **Next.js 16** and **Supabase**. It has two separate interfaces:

| Interface | URL | Who Uses It |
|-----------|-----|-------------|
| **Customer Menu** | `/customer?table=T-01` | Diners who scan a QR code at their table |
| **Admin Dashboard** | `/dashboard/orders` | Restaurant staff / admin |

Everything is one Next.js app. The customer app fetches menu items and submits orders; the dashboard app watches those orders live and lets staff manage them.

---

## 📁 Root-Level Config Files

### `.env.local`
> **What it does:** Stores secret/environment-specific values. Never committed to Git.

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public API key for Supabase |
| `NEXT_PUBLIC_RESTAURANT_ID` | A fixed string (`rest001`) that tags every order |
| `NEXT_PUBLIC_MENU_BASE_URL` | Base URL for QR codes (e.g. `http://192.168.1.5:3000`) |
| `NEXT_PUBLIC_MENU_CUSTOMER_PATH` | Path for the customer menu (`/customer`) |

---

### `package.json`
> **What it does:** Lists all npm dependencies and the four shell scripts (`dev`, `build`, `start`, `lint`).

Key libraries used:
- **`next`** — The React framework (v16)
- **`react` / `react-dom`** — React 19
- **`@supabase/supabase-js`** — Database + auth client
- **`motion`** — Animations (Framer Motion v12)
- **`lucide-react`** — Icon library
- **`tailwindcss`** — Utility CSS
- **`qrcode.react`** — Renders QR code images
- **`react-dnd`** — Drag-and-drop (used in floor plan editor)
- **`date-fns`** — Date formatting helpers
- **`recharts`** — Chart components

---

### `next.config.ts`
> Default Next.js configuration file. No custom settings are applied here; it exports the default Next config.

---

### `tsconfig.json`
> TypeScript compiler settings. Sets `@/` as a path alias pointing to the project root, so `import ... from '@/lib/api'` works everywhere.

---

### `eslint.config.mjs`
> ESLint rules config. Uses the standard Next.js ESLint preset to catch common React/Next mistakes.

---

### `postcss.config.mjs`
> PostCSS config for processing CSS. Registers the `@tailwindcss/postcss` plugin so Tailwind classes get compiled.

---

### `next-env.d.ts`
> Auto-generated TypeScript declaration file. Tells TypeScript about Next.js-specific types. **Don't edit this manually.**

---

### `supabase-schema.sql`
> A SQL script that defines the entire database structure in Supabase. This is basically a "blueprint" you run once in your Supabase SQL editor to create all the tables:
- `restaurants` — restaurant info
- `categories` — menu categories (Starters, Mains, etc.)
- `menu_items` — individual dishes
- `orders` — every order placed
- `order_items` — individual line items within an order
- `admin_users` — a custom table listing which email addresses can access the dashboard

---

### `git.txt` / `git_files.txt`
> Plain-text notes/file lists generated during development. Not part of the app logic — safe to ignore.

---

---

## 📁 `app/` — Next.js pages (App Router)

This is the heart of the app. Every folder inside `app/` becomes a URL route automatically.

---

### `app/layout.tsx` — **Root Layout**
> **URL:** wraps every page  
> **What it does:** The outermost shell of the entire app. Loads the `Inter` Google Font, imports global CSS, and wraps every page inside `<AuthProvider>` so the login state is available everywhere.

---

### `app/page.tsx` — **Root Redirect**
> **URL:** `/`  
> **What it does:** A one-liner. Anyone visiting `/` is immediately redirected to `/dashboard`. Nothing is rendered.

---

### `app/globals.css` — **Global Stylesheet**
> **What it does:** The main CSS file. Defines the entire design system using CSS variables:
- `--background`, `--foreground`, `--primary`, `--card`, etc. for **light mode**
- `.dark { ... }` block for **dark mode** variants
- `@theme inline` — Maps those variables to Tailwind's color system so you can use `bg-background`, `text-foreground`, etc.
- Base rules: typography sizes for `h1`–`h4`, `label`, `button`, `input`

---

### `app/favicon.ico`
> The little tab icon for the browser. Standard `.ico` image file.

---

## 📁 `app/login/`

### `app/login/page.tsx` — **Login Page**
> **URL:** `/login`  
> **What it does:** The full login screen that admins use to sign in. Contains:
- A dark animated background with floating colour orbs
- A tab switcher: **Sign In** / **Create Account** (signup)
- Email + password form with show/hide toggle
- **Password strength meter** (checks length, uppercase, number, special char)
- **Google sign-in** button
- On success → redirects admin to `/dashboard/orders`
- On failure → shows a friendly error message
- If already logged in as admin → auto-redirects away from this page

---

## 📁 `app/auth/callback/`

### `app/auth/callback/page.tsx` — **OAuth Callback Handler**
> **URL:** `/auth/callback`  
> **What it does:** A "loading" page that Google redirects back to after OAuth sign-in. It listens for the `SIGNED_IN` event from Supabase, then immediately redirects the user to `/dashboard/orders`. Shows a pulsing "H" logo while waiting.

---

## 📁 `app/unauthorized/`

### `app/unauthorized/page.tsx` — **Access Denied Page**
> **URL:** `/unauthorized`  
> **What it does:** Shown when someone logs in with a valid Google/email account but their email is **not** in the `admin_users` table. Displays:
- An animated red shield icon
- The user's email address
- A "Sign Out & Try Another Account" button
- A "Back to Login" button

---

## 📁 `app/dashboard/`

> All dashboard pages are protected. `dashboard/layout.tsx` checks for a valid session on mount and redirects to `/login` if none exists.

---

### `app/dashboard/layout.tsx` — **Dashboard Shell**
> **URL:** wraps all `/dashboard/*` pages  
> **What it does:** The persistent navigation chrome for every dashboard page. Handles:
- **Auth guard:** if not logged in, redirect to `/login`
- **Desktop sidebar:** collapsible (240 px → 80 px icon-only mode) with animated transitions
- **Mobile menu:** sliding drawer that opens from the left on small screens
- **Top navbar:** contains `<GlobalSearch />` and `<NotificationBell />`, plus a user avatar dropdown with Sign Out
- **Mobile bottom nav:** fixed 4-tab bar at the bottom of the screen
- Navigation links: Live Orders / Order History / Menu Management / Tables & QR

---

### `app/dashboard/page.tsx` — **Dashboard Index Redirect**
> **URL:** `/dashboard`  
> **What it does:** A one-liner redirect to `/dashboard/orders`. Nothing rendered.

---

### `app/dashboard/orders/page.tsx` — **Live Orders Page** ⭐
> **URL:** `/dashboard/orders`  
> **What it does:** The most important dashboard page. Loads in real-time from Supabase and shows:
1. **4 stat cards** — Active Orders, Tables Occupied, New Orders, Ready to Serve
2. **Floor Overview** — A dot-grid canvas showing all tables (coloured red=busy, green=available, amber=reserved). Click a table to see a tooltip with its current order items.
3. **Active Orders list** — Cards for each `new`/`preparing`/`done` order showing:
   - Order number, table, time-ago, status badge
   - Items list with quantity (hover to see X button)
   - "Add Item" button (opens a searchable popup with all menu items)
   - Action buttons: **Start Preparing** → **Mark as Ready** → **Mark as Paid**
   - **Delete** (trash icon)
4. Real-time subscription via `subscribeToOrders()` — updates automatically when a customer places an order
5. Table status auto-syncs: when an order becomes active, that table turns "busy" on the floor map

---

### `app/dashboard/history/page.tsx` — **Order History Page**
> **URL:** `/dashboard/history`  
> **What it does:** Shows past orders (status = `paid` or `cancelled`). Features:
- **Time filters:** Today / Yesterday / This Week / This Month
- **4 KPI cards** — Total Revenue, Total Orders, Avg Order Value, Paid Orders
- **Table view** (desktop) or **card list** (mobile)
- **Export CSV** button — downloads all filtered orders as a `.csv` file

---

### `app/dashboard/menu/page.tsx` — **Menu Management Page**
> **URL:** `/dashboard/menu`  
> **What it does:** Full CRUD (Create / Read / Update / Delete) for menu items and categories. Features:
- **Category sidebar** with item counts + an "Add Category" button
- **Search bar** to filter items by name
- **Item cards** — show image/icon, name, price, category, veg/non-veg dot, availability toggle switch
- **Add Menu Item** → opens a modal form (name, price, category, veg/non-veg, image URL)
- **Edit** (pencil icon) → same modal, pre-filled
- **Delete** (trash icon) → confirm then delete
- **Availability toggle** — flips a switch that marks item as unavailable; changes appear immediately on the customer menu via localStorage + Supabase

---

### `app/dashboard/tables/page.tsx` — **Tables & QR Codes Page** ⭐
> **URL:** `/dashboard/tables`  
> **What it does:** Two views in one, toggled by a tab switch:

**QR Codes view (default):**
- Grid of QR code cards, one per table
- Each card shows the QR code image, table status dot, Preview button, Download button
- Download renders a styled PNG (gradient header, QR in centre, URL at bottom)
- **Download All** — downloads every table's QR as individual PNGs
- Each QR encodes `{MENU_BASE_URL}/customer?table=T-XX`

**Floor Plan view:**
- Drag-and-drop canvas where you can position tables
- Add/remove tables with +/- buttons
- Add walls (orange rectangles) and desks (blue rectangles)
- **Shift + Click** a wall/desk to delete it
- **Save Layout** — snapshots the current layout into a list
- **Load** — restore any saved layout from a dropdown
- All changes auto-save to `localStorage`

---

## 📁 `app/customer/`

> Public pages — no authentication required.

---

### `app/customer/layout.tsx` — **Customer Layout**
> **URL:** wraps all `/customer/*` pages  
> **What it does:** Minimal layout. Just wraps children in `<CartProvider>` so the cart state is available on all customer pages. Sets the page title to `"MENU"`.

---

### `app/customer/page.tsx` — **Customer Menu Page** ⭐
> **URL:** `/customer?table=T-01`  
> **What it does:** The customer-facing restaurant menu. This is what customers see when they scan a QR code. Contains:
- Sticky header with the **MENU** logo and table number, plus cart button and order history button
- **Hero banner** — a full-width restaurant photo with a gradient overlay and "Culinary Excellence" headline
- **Category filter strip** — horizontal scrollable pill buttons
- **Menu item grid** — 3 columns on desktop, 2 on tablet, 1 on mobile
- Items are fetched from **Supabase** on load, with a fallback to the static `menuData.ts` list
- Unavailable items show a greyed-out "Out of Stock" overlay
- Real-time subscription: if the dashboard marks an item unavailable, it disappears from the cart button here instantly
- **Mobile floating "View Cart" button**
- **Scroll-to-top** button (golden circle) appears after scrolling 400 px

---

### `app/customer/order-summary/page.tsx` — **Order Confirmation Page**
> **URL:** `/customer/order-summary?table=T-01`  
> **What it does:** The checkout / confirmation page. Immediately on mount it submits the cart to Supabase. Three states:
1. **Submitting** — spinning loader + "Sending your order…"
2. **Error** — red alert + error message + Try Again / Back to Menu buttons
3. **Success** — green checkmark, order number, items list with prices, service fee, total, "Order More" button
- After a successful submit, the cart is cleared
- A "live" pulsing green dot says "Order is now visible on the kitchen dashboard"

---

### `app/customer/order-history/page.tsx` — **Customer Order History**
> **URL:** `/customer/order-history`  
> **What it does:** Shows past orders for this browser session (stored in `localStorage` via CartContext). Lists orders as expandable accordion cards showing all items and prices. This is local-only history (not from Supabase).

---

---

## 📁 `components/` — Reusable UI Building Blocks

---

### `components/customer/MenuItemCard.tsx`
> **What it does:** A single menu item card. Shows the food photo, name, description, price, category badge, and "Add to Cart" button. If the item is `available=false`, it shows a "Out of Stock" dark overlay and disables the button. Animates in with a scale-up on mount and lifts on hover.

---

### `components/customer/CategoryFilter.tsx`
> **What it does:** The horizontal scrollable row of category filter pills (All / Breakfast / Appetizers / etc.). The active pill slides an animated green background using `layoutId`. Clicking a pill updates `activeCategory` in the parent.

---

### `components/customer/CartDrawer.tsx`
> **What it does:** A slide-in drawer from the right side of the screen showing the shopping cart. Contains:
- Dark green header with item count
- Scrollable list of cart items, each with image, name, price, quantity selector, delete button, and subtotal
- Sticky footer with total price + "Proceed to Checkout" button (navigates to `/customer/order-summary`)
- A blurred backdrop overlay

---

### `components/customer/QuantitySelector.tsx`
> **What it does:** A tiny `−` / number / `+` control used inside `CartDrawer`. When the quantity changes, the number animates briefly in gold colour. Decreasing to 0 removes the item from cart.

---

### `components/dashboard/NotificationBell.tsx`
> **What it does:** The bell icon in the dashboard top navbar. Subscribes to Supabase real-time `INSERT` events on the `orders` table. When a new order arrives:
- Plays a subtle "ding" sound via the Web Audio API
- Adds a notification to an in-memory list
- Shows a red unread badge count on the bell
- The bell icon animates (rocks back and forth) while there are unread notifications
- Clicking the bell opens a dropdown panel listing all notifications with timestamps
- Can dismiss individual notifications or "Clear All"

---

### `components/dashboard/GlobalSearch.tsx`
> **What it does:** The search bar in the dashboard top navbar. Features:
- Debounced search (250 ms) that queries Supabase in parallel for matching **orders** (by table number/status) and **menu items** (by name)
- Static "Quick Navigation" links shown when the input is empty
- Keyboard navigation: `↑ ↓` to move, `Enter` to navigate, `Esc` to close
- Animated dropdown results panel with badges (order status, item availability)
- Clicking a result navigates to the relevant dashboard page

---

### `components/ui/switch.tsx`
> **What it does:** A simple toggle switch component built on top of `@radix-ui/react-switch`. Used in the Menu Management page to toggle item availability on/off. Blue when on, grey when off.

---

---

## 📁 `context/` — Global State Providers

---

### `context/AuthContext.tsx`
> **What it does:** Manages the logged-in user state across the entire app. Wraps the app in `<AuthProvider>`:
- On startup, reads the current Supabase session
- Checks if the user's email is in the `admin_users` table (`checkIsAdmin`)
- If admin, records the `last_login` timestamp
- Listens for auth state changes (login/logout/token refresh)
- Exposes `{ session, user, isAdmin, loading, signOut }` to any component via `useAuth()` hook

---

### `context/CartContext.tsx`
> **What it does:** Manages the shopping cart for the customer menu. Wraps customer pages in `<CartProvider>`:
- `cart` — array of items currently in the cart
- `addToCart` — adds or increments an item
- `removeFromCart` — removes an item entirely
- `updateQuantity` — set qty; if `<= 0`, removes the item
- `clearCart` — empties the cart (called after a successful order submission)
- `totalItems` / `totalPrice` — computed values
- `isCartOpen` / `setIsCartOpen` — controls the CartDrawer visibility
- `orderHistory` / `saveOrder` — customer's past orders, persisted to `localStorage`

---

---

## 📁 `lib/` — Helper Functions & Utilities

---

### `lib/supabase.ts`
> **What it does:** Creates and exports two Supabase client instances:
- `supabase` — **Dashboard client.** Persists the auth session in `localStorage` (key: `hotel-menu-auth-v13`). Used by all dashboard pages and auth logic.
- `supabaseCustomer` — **Customer client.** No session, no token refresh, no session URL detection. Completely anonymous. Used by customer-facing pages so no accidental auth bleeds from dashboard to customer interface.

---

### `lib/types.ts`
> **What it does:** TypeScript type definitions that match the Supabase database schema exactly. Defines:
- `MenuItem` — a row in the `menu_items` table
- `Category` — a row in the `categories` table
- `OrderItem` — a row in the `order_items` table
- `Order` — a row in the `orders` table
- `Restaurant` — a row in the `restaurants` table
- `DashboardOrder` — a flattened/simplified version of Order used internally in dashboard pages (avoids nested joins)

---

### `lib/api.ts`
> **What it does:** All database-reading/writing functions for the **dashboard**. Every function talks to Supabase using the authenticated `supabase` client. Functions include:

**Orders:**
- `fetchActiveOrders()` — gets orders with status `new/preparing/done`, joins `order_items`
- `fetchOrderHistory(limit)` — gets orders with status `paid/cancelled`
- `updateOrderStatus(orderId, status)` — changes an order's status
- `deleteOrder(orderId)` — hard deletes an order
- `subscribeToOrders(onChange)` — sets up a real-time Postgres changes listener; calls `onChange` with fresh orders on every change

**Menu Items:**
- `fetchMenuItems()` — gets all items with their category joined
- `toggleMenuItemAvailability(itemId, available)` — marks item on/off menu
- `deleteMenuItem(itemId)` — hard deletes
- `createMenuItem(item)` — inserts a new item
- `updateMenuItem(itemId, updates)` — partial update

**Categories:**
- `fetchCategories()` — returns all categories ordered by `display_order`
- `createCategory(name, displayOrder)` — inserts a new category
- `updateCategory(id, name)` — rename
- `deleteCategory(id)` — hard delete

**Helpers:**
- `mapOrder(raw)` — converts a raw Supabase join result into a `DashboardOrder` (flatter structure, human-readable time)
- `formatTimeAgo(isoString)` — converts a timestamp to "Just now", "5 min ago", "2h ago"

---

### `lib/auth.ts`
> **What it does:** All authentication helper functions:
- `signInWithGoogle()` — starts Google OAuth flow, redirects to `/auth/callback`
- `signInWithEmail(email, password)` — email/password login
- `signUpWithEmail(email, password, fullName)` — creates a new Supabase auth user
- `signOut()` — logs out
- `getSession()` — returns the current session or null
- `checkIsAdmin(user)` — queries the `admin_users` table to see if this email is an active admin
- `updateLastLogin(email)` — writes the current timestamp to `admin_users.last_login`

---

### `lib/menuAvailability.ts`
> **What it does:** A `localStorage`-based availability override system. When the dashboard toggles an item off, it writes to `localStorage` so:
1. The change is instant (no waiting for Supabase round-trip)
2. The change survives page reloads on the same device
3. The customer menu reads these overrides on top of whatever Supabase says

Functions:
- `getAvailabilityMap()` — reads `{ [itemId]: boolean }` from localStorage
- `setItemAvailability(itemId, available)` — writes one item's flag
- `applyAvailabilityOverrides(items)` — merges localStorage overrides onto a list of items
- `seedAvailabilityMap(items)` — on first load, seeds localStorage from what Supabase says (without overwriting existing overrides)

---

### `lib/submitOrder.ts`
> **What it does:** Handles the two-step database write when a customer places an order:
1. `INSERT` a row into `orders` (restaurant ID, table number, total, status = `new`)
2. `INSERT` rows into `order_items` (one per cart item)
- If step 2 fails, it deletes the step-1 row to avoid orphan orders
- Returns `{ orderId, dailyOrderNumber }` on success
- Uses `supabaseCustomer` (no auth required)

---

### `lib/utils.ts`
> **What it does:** A single utility function `cn(...classes)` that merges Tailwind class names intelligently. Uses `clsx` to conditionally join class names and `tailwind-merge` to deduplicate conflicting Tailwind classes (e.g., `bg-red-500 bg-blue-500` → keeps only `bg-blue-500`).

---

---

## 📁 `data/` — Static Data

---

### `data/menuData.ts`
> **What it does:** A hardcoded list of 22 menu items used as a **fallback** if Supabase is not available. Organised into 5 categories: Breakfast, Appetizers, Main Course, Desserts, Beverages. Each item has: `id`, `name`, `description`, `price`, `image` (Unsplash URL), `category`. Also exports the `categories` string array.

---

### `data/sharedData.ts`
> **What it does:** A single source of truth for data that both customer and dashboard pages need.
- Re-exports `menuItems` and `categories` from `menuData.ts`
- Defines the `Table` interface (id, name, seats, x, y, status)
- Defines the `MenuItem` interface for the dashboard's "Add Item" panel
- `defaultTables` — 18 pre-defined tables (T-01 through T-18) with x/y positions
- `getTables()` — reads tables from `localStorage` (key `hotelmenu_floorplan_tables`), falls back to `defaultTables`
- `setTables(tables)` — writes tables to the in-memory variable AND `localStorage`
- `updateTableStatus(tableId, status)` — helper that gets, modifies, and saves in one call

---

---

## 📁 `public/` — Static Assets

Files served directly at `/filename.ext`. All are default Next.js placeholder SVGs:
- `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` — decorative icons from the default Next.js scaffold. None of these are actually used in the app UI.

---

---

## 🔄 How Data Flows (The Big Picture)

```
Customer scans QR code (/customer?table=T-01)
  → Fetches menu from Supabase (menu_items + categories tables)
  → Applies localStorage availability overrides
  → Customer adds items to CartContext
  → Taps "Proceed to Checkout"
  → /customer/order-summary submits to Supabase (orders + order_items)

Dashboard (/dashboard/orders)
  → Supabase real-time fires → NotificationBell rings
  → Orders list auto-refreshes
  → Staff taps "Start Preparing" → updateOrderStatus() → Supabase
  → Staff taps "Mark as Ready" → status = 'done'
  → Staff taps "Mark as Paid" → status = 'paid' → disappears from Live Orders → appears in History
```

---

## 🔐 Authentication Flow

```
/login → signInWithEmail() or signInWithGoogle()
       → Google OAuth: redirects via /auth/callback
       → AuthContext checks checkIsAdmin(user)
       → isAdmin = true  → /dashboard/orders
       → isAdmin = false → /unauthorized
       → dashboard/layout.tsx guards every /dashboard/* page
```

---

## 🗄️ Supabase Database Tables

| Table | Purpose |
|-------|---------|
| `restaurants` | Restaurant name + logo |
| `categories` | Menu categories (Starters, Mains…) |
| `menu_items` | All dishes — name, price, type, availability |
| `orders` | Every customer order — table, status, total |
| `order_items` | Line items inside an order |
| `admin_users` | Whitelist of emails allowed to access the dashboard |

---

## 🧩 Key Design Decisions

| Decision | Why |
|----------|-----|
| Two Supabase clients | Keeps admin sessions separate from anonymous customer calls |
| localStorage for availability | Instant UI response + device persistence even if Supabase is slow |
| Static menu fallback | Customer menu still works even if Supabase isn't configured |
| `DashboardOrder` type | Simplifies the shape of data passed around in the UI vs. raw Supabase joins |
| `subscribeToOrders` with random channel ID | Prevents collisions when multiple browser tabs are open |
