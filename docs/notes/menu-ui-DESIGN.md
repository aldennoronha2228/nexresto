# Design System: The Nocturnal Editorial

## 1. Overview & Creative North Star: "The Silent Maître D'"
This design system rejects the "digital template" aesthetic in favor of a high-end, print-inspired editorial experience. Our Creative North Star is **The Silent Maître D'**: an interface that is authoritative yet hushed, guiding the guest through a culinary journey without the noise of traditional UI.

We break the "standard app" mold by utilizing extreme typographic scale and intentional asymmetry. By pairing oversized, romantic serifs with a rigid, utilitarian sans-serif, we create a tension that feels both historic and avant-garde. This is not a menu; it is a curated gallery of flavors.

## 2. Colors: Tonal Depth over Structural Lines
The palette is rooted in deep obsidian and natural earth tones, mimicking the interior of a dimly lit, boutique establishment.

*   **Primary (#B5CCC1 - Soft Sage):** Used sparingly for botanical accents or "Chef's Recommendations." It represents organic freshness.
*   **Secondary (#CA917A - Muted Clay):** Used for "warmth" tokens—fire-roasted items, vintage pairings, or soft CTAs.
*   **The "No-Line" Rule:** While the initial brief mentioned 1px borders, as a Director-level evolution, we will largely move away from them for sectioning. Structural boundaries are defined by shifting from `surface` (#0E0E0E) to `surface-container-low` (#131313). 
*   **Surface Hierarchy:** Use the `surface-container` tiers to create "plates" of content. 
    *   *Base:* `surface` (#0E0E0E)
    *   *Sectioning:* `surface-container-low` (#131313) for category blocks.
    *   *Highlight:* `surface-bright` (#2C2C2C) for active selection or focused modals.
*   **The "Glass" Nuance:** To maintain a premium feel, floating overlays (like a wine list modal) should use `surface-container-high` with a 0.8 opacity and a 20px backdrop blur, allowing the dark background to bleed through softly.

## 3. Typography: The Editorial Tension
Typography is the primary architecture of this system. We use a "High-Contrast Scale" to evoke luxury fashion journals.

*   **Display (Noto Serif):** Set at `display-lg` (3.5rem) or `display-md` (2.75rem). Use this for category titles (e.g., *Entrées*, *The Cellar*). It should feel "too big" for the screen, occasionally bleeding off the edge or using asymmetrical alignment to break the grid.
*   **Body (Inter):** Set at `body-md` (0.875rem) with a tight letter-spacing (-0.02em). This provides a technical, precise contrast to the flowery serif.
*   **Prices (Inter Bold):** Prices should never use the Serif font. They are data points. Use `title-sm` (1rem) in `on-surface-variant` to keep them present but secondary to the dish's name.

## 4. Elevation & Depth: Tonal Layering
In a boutique environment, shadows are distracting. We create depth through "The Layering Principle."

*   **The Layering Principle:** Instead of shadows, we stack surfaces. A "Card" for a featured dish should be `surface-container-lowest` (#000000) sitting on a `surface-container-low` (#131313) background. This creates a "recessed" look, like a carved-out niche in a wall.
*   **The "Ghost Border" Fallback:** Where separation is strictly required (e.g., input fields), use the `outline-variant` (#484848) at **20% opacity**. It should be felt, not seen.
*   **Zero Roundedness:** This system uses a `0px` radius across all components. Sharp corners convey a knife-edge precision and architectural rigor.

## 5. Components: Precision Utensils

### Buttons
*   **Primary:** A solid block of `primary` (#B5CCC1) with `on-primary` (#30443C) text. No rounded corners. Sizing is generous (16px top/bottom, 32px left/right).
*   **Secondary:** A "Ghost" button. No background, 1px border using `outline-variant` at 40% opacity. Text in `primary`.

### Cards & Lists
*   **Forbid Dividers:** Do not use horizontal lines to separate menu items. Use `body-lg` spacing (1rem) between items. The price should be right-aligned or placed immediately after the description in a muted tone to create a clean horizontal scan.
*   **Interactive Cards:** On hover, change the background from `surface` to `surface-container-low`.

### Inputs & Selection
*   **Text Inputs:** Bottom-border only (1px, #222). Labels should be in `label-sm`, all-caps, with 0.1em letter spacing, positioned above the input.
*   **Selection Chips:** Square corners. Active state uses `secondary-container` (#59311F) with `on-secondary-container` (#EFB199) text.

### Custom Component: The "Provenance Tag"
*   A small, all-caps label using `label-sm` in `secondary` (#CA917A) placed above a dish title to indicate origin (e.g., "OAKLAND CREEK"). It acts as a micro-header to establish the editorial feel.

## 6. Do's and Don'ts

### Do:
*   **Embrace Negative Space:** If a screen feels "empty," you are doing it right. Give the typography room to breathe.
*   **Use Asymmetry:** Align the category title (Serif) to the left, and the menu items (Sans) slightly indented or offset to the right.
*   **Monochrome Data:** Keep functional elements (steppers, quantities, prices) in strictly monochrome tones. Use the accent colors (`sage` or `clay`) only for narrative elements.

### Don't:
*   **No Rounded Corners:** Never use a border-radius. Even a 2px radius breaks the architectural "Boutique" intent.
*   **No Standard Icons:** Avoid "bubbly" or filled icons. Use ultra-thin (1px) line icons if absolutely necessary, but prefer text-based labels.
*   **No Gradients:** The depth comes from the color hex shifts (Tonal Layering), not from linear or radial fades.