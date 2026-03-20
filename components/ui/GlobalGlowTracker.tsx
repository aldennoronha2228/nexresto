"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function isBlockCandidate(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const cls = el.className;
  if (typeof cls !== "string") return false;

  const rect = el.getBoundingClientRect();
  const isVisibleSize = rect.width >= 56 && rect.height >= 36;
  if (!isVisibleSize) return false;

  // Avoid giant layout wrappers and full-screen overlays.
  const viewportFill = rect.width >= window.innerWidth * 0.95 && rect.height >= window.innerHeight * 0.95;
  if (viewportFill) return false;

  const hasRounded = cls.includes("rounded");
  const hasBorderLike =
    cls.includes("border") ||
    cls.includes("premium-glass") ||
    cls.includes("premium-sidebar") ||
    cls.includes("nexo-glow-border");

  const isLikelyContainer =
    el.tagName === "DIV" ||
    el.tagName === "ARTICLE" ||
    el.tagName === "SECTION" ||
    el.tagName === "ASIDE" ||
    el.tagName === "LI";

  if (!isLikelyContainer) return false;

  return isLikelyContainer && hasRounded && hasBorderLike;
}

export default function GlobalGlowTracker() {
  const pathname = usePathname();
  const path = pathname || "";
  const disableGlow =
    path.includes("/dashboard") ||
    path.startsWith("/admin") ||
    path.startsWith("/super-admin") ||
    path.startsWith("/customer");

  useEffect(() => {
    if (disableGlow) return;

    let rafId = 0;
    let refreshId = 0;
    let targets: HTMLElement[] = [];

    const collectTargets = () => {
      for (const el of targets) {
        el.classList.remove("global-glow-track");
      }

      targets = Array.from(document.querySelectorAll("body *")).filter(isBlockCandidate);
      for (const el of targets) {
        el.classList.add("global-glow-track");
        if (!el.style.getPropertyValue("--active")) {
          el.style.setProperty("--active", "0");
        }
        if (!el.style.getPropertyValue("--start")) {
          el.style.setProperty("--start", "0");
        }
      }
    };

    const updateGlow = (x: number, y: number) => {
      for (const el of targets) {
        const rect = el.getBoundingClientRect();
        const proximity = 220;

        const isNear =
          x > rect.left - proximity &&
          x < rect.right + proximity &&
          y > rect.top - proximity &&
          y < rect.bottom + proximity;

        if (!isNear) {
          el.style.setProperty("--active", "0");
          continue;
        }

        const cx = rect.left + rect.width * 0.5;
        const cy = rect.top + rect.height * 0.5;
        const angle = (180 * Math.atan2(y - cy, x - cx)) / Math.PI + 90;

        el.style.setProperty("--active", "1");
        el.style.setProperty("--start", String(angle));
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => updateGlow(e.clientX, e.clientY));
    };

    const onPointerLeave = () => {
      for (const el of targets) {
        el.style.setProperty("--active", "0");
      }
    };

    collectTargets();

    const observer = new MutationObserver(() => collectTargets());
    observer.observe(document.body, { childList: true, subtree: true });
    refreshId = window.setInterval(collectTargets, 1500);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("resize", collectTargets);
    document.addEventListener("visibilitychange", collectTargets);
    document.addEventListener("pointerleave", onPointerLeave);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (refreshId) window.clearInterval(refreshId);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", collectTargets);
      document.removeEventListener("visibilitychange", collectTargets);
      document.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [disableGlow]);

  return null;
}
