'use client';
import { useEffect } from 'react';

const NUM_FRAMES = 48;
const UHD_WIDTH = 3840;
const UHD_HEIGHT = 2160;
const UHD_PIXELS = UHD_WIDTH * UHD_HEIGHT;

export default function RootPage() {
  useEffect(() => {
    /* ── QR pattern ─────────────────────────────────────────────────── */
    const P = [1,1,1,1,1,1,1,0,0,1,0,0,0,0,0,1,0,1,1,0,1,1,1,0,1,0,0,1,0,1,1,1,0,1,0,1,1,0,1,1,1,0,1,0,0,1,0,0,0,0,0,1,0,1,1,1,1,1,1,1,1,0,1,0,0,1,0,1,0,0,0,0,0,1,1,0,1,1,0,1,1];
    const qrg = document.getElementById('qrg');
    if (qrg) P.forEach(v => { const d = document.createElement('div'); if (!v) d.classList.add('w'); qrg.appendChild(d); });

    /* ── Helpers ─────────────────────────────────────────────────────── */
    const bar  = document.getElementById('lbar')  as HTMLElement | null;
    const ltxt = document.getElementById('ltxt')  as HTMLElement | null;
    const loader = document.getElementById('loader') as HTMLElement | null;

    function loadScript(src: string, cb: () => void) {
      const s = document.createElement('script'); s.src = src; s.async = true; s.onload = cb;
      document.head.appendChild(s);
    }

    /* ── Frame preloading ────────────────────────────────────────────── */
    const frameImgs: HTMLImageElement[] = new Array(NUM_FRAMES).fill(null);
    let framesLoaded = 0, gsapReady = false, framesReady = false;

    function tryInit() {
      if (!gsapReady || !framesReady) return;
      setTimeout(() => { if (loader) loader.classList.add('done'); initCanvas(); }, 400);
    }

    for (let i = 0; i < NUM_FRAMES; i++) {
      const img = new Image();
      const idx = i;
      img.onload = img.onerror = () => {
        framesLoaded++;
        const pct = framesLoaded / NUM_FRAMES;
        if (bar) bar.style.width = (pct * 100) + '%';
        if (pct > 0.33 && ltxt?.textContent === 'Loading frames') ltxt.textContent = 'Preparing scene';
        if (pct > 0.66 && ltxt?.textContent === 'Preparing scene') ltxt.textContent = 'Almost ready';
        if (framesLoaded === NUM_FRAMES) { framesReady = true; tryInit(); }
      };
      img.src = `/frames/frame_${String(idx + 1).padStart(3, '0')}.jpg`;
      frameImgs[idx] = img;
    }

    if (ltxt) ltxt.textContent = 'Loading frames';

    /* ── Load GSAP in parallel ───────────────────────────────────────── */
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js', () => {
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js', () => {
        gsapReady = true; tryInit();
      });
    });

    /* ── Canvas + scroll init (runs after both ready) ────────────────── */
    function initCanvas() {
      const gsap = (window as any).gsap;
      const ScrollTrigger = (window as any).ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);

      const canvas = document.getElementById('cv') as HTMLCanvasElement | null;
      const ctx = canvas ? canvas.getContext('2d') : null;
      let cw = 0, ch = 0, currentIdx = 0;

      function resizeCanvas() {
        if (!canvas) return;
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewportPixels = viewportW * viewportH * dpr * dpr;

        // Keep desktop scroll playback crisp by targeting at least a 4K render surface.
        const targetPixels = viewportW >= 1024 ? Math.max(viewportPixels, UHD_PIXELS) : viewportPixels;
        const renderScale = Math.sqrt(targetPixels / (viewportW * viewportH));

        cw = canvas.width = Math.round(viewportW * renderScale);
        ch = canvas.height = Math.round(viewportH * renderScale);
        canvas.style.width = `${viewportW}px`;
        canvas.style.height = `${viewportH}px`;

        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
        }
        drawFrame(currentIdx);
      }

      function drawFrame(idx: number) {
        if (!ctx) return;
        const img = frameImgs[Math.max(0, Math.min(idx, NUM_FRAMES - 1))];
        if (!img?.complete || !img.naturalWidth) return;
        ctx.clearRect(0, 0, cw, ch);
        const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
        ctx.drawImage(img, (cw - img.naturalWidth * scale) / 2, (ch - img.naturalHeight * scale) / 2, img.naturalWidth * scale, img.naturalHeight * scale);
      }

      window.addEventListener('resize', resizeCanvas);
      resizeCanvas();

      const spacerEl = document.getElementById('spacer');
      const spacerEnd = spacerEl ? spacerEl.offsetHeight : window.innerHeight * 6;
      const hint  = document.getElementById('hint')  as HTMLElement | null;
      const phone = document.getElementById('phone') as HTMLElement | null;

      /* Keep hero visual stable during scroll */
      currentIdx = 0;
      drawFrame(currentIdx);

      /* Hint */
      ScrollTrigger.create({ start: 100, end: 200, onEnter: () => { if (hint) hint.style.opacity = '0'; }, onLeaveBack: () => { if (hint) hint.style.opacity = '1'; } });

      /* Cards & phone */
      const seg = spacerEnd / 5;
      const overlap = seg * 0.12;
      const cards = ['c1','c2','c3','c4'].map(id => document.getElementById(id) as HTMLElement | null);
      const show = (el: HTMLElement | null) => { if (el) gsap.to(el, { opacity: 1, duration: 0.5 }); };
      const hide = (el: HTMLElement | null) => { if (el) gsap.to(el, { opacity: 0, duration: 0.3 }); };
      const showExclusive = (index: number) => {
        cards.forEach((el, i) => { if (i === index) show(el); else hide(el); });
      };

      ScrollTrigger.create({ start: seg * 0, end: seg * 1 + overlap, onEnter: () => showExclusive(0), onEnterBack: () => showExclusive(0), onLeaveBack: () => hide(cards[0]), onLeave: () => hide(cards[0]) });
      ScrollTrigger.create({ start: seg * 1 - overlap, end: seg * 2 + overlap, onEnter: () => showExclusive(1), onEnterBack: () => showExclusive(1), onLeaveBack: () => hide(cards[1]), onLeave: () => hide(cards[1]) });

      let phoneIv: ReturnType<typeof setInterval> | null = null;
      ScrollTrigger.create({
        start: seg * 2 - overlap, end: seg * 3 + overlap,
        onEnter: () => {
          showExclusive(2); if (phone) gsap.to(phone, { x: 0, opacity: 1, duration: 0.7, ease: 'power3.out' });
          const screens = ['s0','s1','s2','s3']; let si = 0;
          const next = () => { document.querySelectorAll('.scr').forEach(s => s.classList.remove('on')); const el = document.getElementById(screens[si]); if (el) el.classList.add('on'); si = (si + 1) % screens.length; };
          next(); if (!phoneIv) phoneIv = setInterval(next, 1800);
        },
        onEnterBack: () => { showExclusive(2); if (phone) gsap.to(phone, { x: 0, opacity: 1, duration: 0.7, ease: 'power3.out' }); },
        onLeave: () => { hide(cards[2]); if (phone) gsap.to(phone, { x: '140%', opacity: 0, duration: 0.5 }); if (phoneIv) { clearInterval(phoneIv); phoneIv = null; } },
        onLeaveBack: () => { hide(cards[2]); if (phone) gsap.to(phone, { x: '140%', opacity: 0, duration: 0.5 }); if (phoneIv) { clearInterval(phoneIv); phoneIv = null; } },
      });
      ScrollTrigger.create({
        start: seg * 3 - overlap, end: seg * 5,
        onEnter: () => {
          showExclusive(3);
          if (phone) { gsap.to(phone, { x: 0, opacity: 1, duration: 0.7, ease: 'power3.out' }); document.querySelectorAll('.scr').forEach(s => s.classList.remove('on')); const d = document.getElementById('s4'); if (d) d.classList.add('on'); }
        },
        onEnterBack: () => { showExclusive(3); if (phone) gsap.to(phone, { x: 0, opacity: 1, duration: 0.7, ease: 'power3.out' }); },
        onLeave: () => { hide(cards[3]); if (phone) gsap.to(phone, { x: '140%', opacity: 0, duration: 0.5 }); },
        onLeaveBack: () => { hide(cards[3]); if (phone) gsap.to(phone, { x: '140%', opacity: 0, duration: 0.5 }); },
      });

      /* Counters */
      [{ id: 'tv0', t: 35, s: '%' }, { id: 'tv1', t: 2, s: 'h' }, { id: 'tv2', t: 200, s: '+' }, { id: 'tv3', t: 1.2, s: 'M' }].forEach(ct => {
        ScrollTrigger.create({ trigger: '#tv0', start: 'top 80%', once: true, onEnter: () => {
          const el = document.getElementById(ct.id); if (!el) return;
          let cur = 0; const step = 16, inc = ct.t / (1800 / step);
          const iv = setInterval(() => { cur = Math.min(cur + inc, ct.t); el.textContent = (ct.t % 1 === 0 ? Math.round(cur) : cur.toFixed(1)) + ct.s; if (cur >= ct.t) clearInterval(iv); }, step);
        }});
      });

      /* Premium scroll animation pass */
      const premiumTargets = gsap.utils.toArray('#sec-stats .titem, #sec-bento .bcard, #sec-advantage .acard, #sec-cta .ctacard') as HTMLElement[];
      premiumTargets.forEach((el) => {
        gsap.fromTo(el,
          {
            opacity: 0,
            y: 56,
            scale: 0.98,
          },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: el,
              start: 'top 88%',
              end: 'top 62%',
              scrub: true,
            }
          }
        );
      });

      /* Reveal */
      document.querySelectorAll('.rv').forEach(el => { ScrollTrigger.create({ trigger: el, start: 'top 85%', onEnter: () => el.classList.add('in') }); });
    }
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300&family=DM+Sans:wght@200;300;400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{--neon:#2563eb;--coral:#60a5fa;--mint:#38bdf8;--white:#e2e8f0;--glass:rgba(15,23,42,0.72);--gb:rgba(59,130,246,0.22)}
        body{margin:0;padding:0;background-color:#020617;color:var(--white);font-family:'DM Sans',sans-serif;overflow-x:hidden;background-image:linear-gradient(rgba(148,163,184,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.08) 1px,transparent 1px);background-size:52px 52px;background-attachment:fixed}
        body::before,body::after{content:'';position:fixed;border-radius:50%;pointer-events:none;z-index:-1;filter:blur(42px);opacity:.28}
        body::before{width:460px;height:460px;left:-120px;top:-120px;background:radial-gradient(circle,#1d4ed8 0%,rgba(29,78,216,0) 70%)}
        body::after{width:420px;height:420px;right:-110px;bottom:-140px;background:radial-gradient(circle,#4f46e5 0%,rgba(79,70,229,0) 72%)}
        #stage{position:fixed;inset:0;z-index:0;overflow:hidden;filter:none!important;opacity:1!important}
        #stage canvas{display:block;width:100%;height:100%;background:#000;filter:none!important;opacity:1!important}
        #vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 40%,transparent 30%,rgba(0,0,0,.55) 100%)}
        #bt,#bb{position:fixed;left:0;right:0;height:52px;background:#000;z-index:2}
        #bt{top:0}#bb{bottom:0}
        #spacer{height:600vh}
        #nav{position:fixed;top:0;left:0;right:0;height:52px;z-index:5;display:flex;align-items:center;padding:0 40px}
        .logo{font-family:'Cormorant Garamond',serif;font-size:1.35rem;font-weight:600;letter-spacing:.22em;pointer-events:none}
        .logo b{color:var(--neon)}
        .tagline{font-size:.58rem;letter-spacing:.24em;text-transform:uppercase;color:var(--mint);opacity:.7;pointer-events:none}
        .nav-right{position:fixed;top:8px;right:40px;z-index:6;display:flex;align-items:center}
        .btn-start{padding:8px 20px;background:var(--neon);color:#000;border:none;border-radius:6px;font-family:'DM Sans',sans-serif;font-size:.72rem;font-weight:500;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;text-decoration:none;box-shadow:0 2px 14px rgba(57,255,110,.3);transition:all .25s}
        .btn-start:hover{background:#fff;box-shadow:0 2px 24px rgba(57,255,110,.5)}
        #hint{position:fixed;bottom:66px;left:50%;transform:translateX(-50%);z-index:5;text-align:center;transition:opacity .5s;pointer-events:none}
        #hint p{font-size:.55rem;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:6px}
        .hline{width:1px;height:28px;background:linear-gradient(180deg,rgba(255,255,255,.4),transparent);margin:0 auto;animation:pulse 2s ease-in-out infinite}
        @keyframes pulse{0%,100%{opacity:.3}50%{opacity:.9}}
        .card{position:fixed;z-index:5;opacity:0;pointer-events:none;max-width:400px;background:var(--glass);backdrop-filter:blur(20px) saturate(150%);-webkit-backdrop-filter:blur(20px) saturate(150%);border:1px solid var(--gb);border-radius:14px;padding:26px 30px}
        .ctag{font-size:.56rem;letter-spacing:.28em;text-transform:uppercase;color:var(--neon);margin-bottom:8px;display:flex;align-items:center;gap:7px}
        .ctag::before{content:'';display:block;width:16px;height:1px;background:var(--neon);box-shadow:0 0 5px var(--neon)}
        .card h2{font-family:'Cormorant Garamond',serif;font-size:clamp(1.4rem,2.4vw,2rem);font-weight:300;line-height:1.2;margin-bottom:8px}
        .card h2 b{font-weight:600;color:var(--coral)}.card h2 i{font-style:italic;color:var(--mint)}
        .card p{font-size:.76rem;font-weight:200;line-height:1.8;color:rgba(240,237,232,.5)}
        .stats{display:flex;gap:18px;margin-top:14px}
        .sv{font-family:'Cormorant Garamond',serif;font-size:1.7rem;font-weight:600;color:var(--neon);line-height:1}
        .sl{font-size:.53rem;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-top:2px}
        #c1,#c2,#c4{bottom:70px;left:48px}
        #c3{top:50%;left:48px;transform:translateY(-50%)}
        #loader{position:fixed;inset:0;background:#000;z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;transition:opacity .7s}
        #loader.done{opacity:0;pointer-events:none}
        .ll{font-family:'Cormorant Garamond',serif;font-size:2rem;font-weight:300;letter-spacing:.3em}
        .ll b{color:var(--neon);font-weight:300}
        .ltrack{width:200px;height:1px;background:rgba(255,255,255,.1);border-radius:1px}
        .lbar{height:1px;background:var(--neon);width:0;box-shadow:0 0 6px var(--neon);border-radius:1px;transition:width .12s linear}
        .ltxt{font-size:.56rem;letter-spacing:.26em;text-transform:uppercase;color:rgba(255,255,255,.28)}
        #phone{position:fixed;right:48px;top:50%;transform:translateY(-50%) translateX(140%);opacity:0;z-index:5;pointer-events:none}
        .pshell{width:220px;height:452px;background:#0c0c13;border-radius:34px;border:1.5px solid rgba(255,255,255,.1);position:relative;box-shadow:0 0 0 1px rgba(57,255,110,.1),0 24px 60px rgba(0,0,0,.8)}
        .pshell::after{content:'';position:absolute;right:-3px;top:76px;width:3px;height:40px;background:#16161f;border-radius:0 2px 2px 0}
        .notch{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:64px;height:17px;background:#09090e;border-radius:10px;z-index:2;display:flex;align-items:center;justify-content:center;gap:4px}
        .n-spk{width:24px;height:3px;background:#1a1a25;border-radius:2px}.n-cam{width:6px;height:6px;background:#1a1a25;border-radius:50%}
        .pscreen{position:absolute;inset:0;border-radius:33px;overflow:hidden;background:#0d1410;display:flex;flex-direction:column}
        .sbar{padding:12px 15px 4px;display:flex;justify-content:space-between;font-size:.5rem;color:rgba(255,255,255,.5);flex-shrink:0}
        .ah{padding:4px 14px 8px;border-bottom:1px solid rgba(255,255,255,.05);flex-shrink:0}
        .al{font-family:'Cormorant Garamond',serif;font-size:.88rem;font-weight:600;letter-spacing:.13em}.al b{color:var(--neon)}
        .at{font-size:.47rem;letter-spacing:.14em;text-transform:uppercase;color:var(--mint);opacity:.72;margin-top:1px}
        .scr{display:none;flex-direction:column;flex:1;overflow:hidden}.scr.on{display:flex}
        .qw{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:10px;padding:10px}
        .qt{font-family:'Cormorant Garamond',serif;font-size:.9rem;font-weight:300;text-align:center}
        .qs{font-size:.5rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.32);text-align:center}
        .qbox{width:118px;height:118px;position:relative}
        .qgrid{width:100%;height:100%;background:#fff;border-radius:8px;padding:8px;display:grid;grid-template-columns:repeat(9,1fr);gap:1px}
        .qgrid div{background:#111;border-radius:1px}.qgrid div.w{background:transparent}
        .qline{position:absolute;left:5px;right:5px;top:8px;height:1.5px;background:linear-gradient(90deg,transparent,var(--neon),transparent);box-shadow:0 0 6px var(--neon);animation:qsc 1.8s ease-in-out infinite}
        @keyframes qsc{0%{top:8px;opacity:1}45%{top:110px;opacity:1}50%{top:110px;opacity:0}55%{top:8px;opacity:0}60%{top:8px;opacity:1}}
        .qc{position:absolute;inset:0}.qc::before,.qc::after,.qc .bl,.qc .br{content:'';position:absolute;width:14px;height:14px;border-color:var(--neon);border-style:solid}
        .qc::before{top:0;left:0;border-width:1.5px 0 0 1.5px;border-radius:2px 0 0 0}.qc::after{top:0;right:0;border-width:1.5px 1.5px 0 0;border-radius:0 2px 0 0}
        .qc .bl{bottom:0;left:0;border-width:0 0 1.5px 1.5px;border-radius:0 0 0 2px}.qc .br{bottom:0;right:0;border-width:0 1.5px 1.5px 0;border-radius:0 0 2px 0}
        .qi{display:flex;align-items:center;gap:6px;background:rgba(57,255,110,.07);border:1px solid rgba(57,255,110,.18);border-radius:6px;padding:5px 10px}
        .qdot{width:5px;height:5px;background:var(--neon);border-radius:50%;box-shadow:0 0 4px var(--neon);animation:blink 1.4s ease-in-out infinite}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}.qi span{font-size:.5rem;letter-spacing:.08em;color:var(--neon)}
        .ms{overflow-y:auto;flex:1;padding:6px 12px 12px}.ms::-webkit-scrollbar{display:none}
        .mh{margin:0 -12px 9px;padding:9px 12px;background:linear-gradient(135deg,#0d1a0f,#182618);display:flex;align-items:center;justify-content:space-between}
        .mhn{font-family:'Cormorant Garamond',serif;font-size:.76rem}.mhg{font-size:.44rem;letter-spacing:.12em;text-transform:uppercase;color:var(--neon);margin-top:1px}
        .mhb{font-size:.44rem;color:var(--neon);background:rgba(57,255,110,.1);border:1px solid rgba(57,255,110,.25);padding:3px 6px;border-radius:4px}
        .mc{font-size:.46rem;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.28);margin:4px 0 5px}
        .mi{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;margin-bottom:4px;background:rgba(255,255,255,.022);border:1px solid rgba(255,255,255,.04)}
        .mi.h{background:rgba(57,255,110,.05);border-color:rgba(57,255,110,.14)}
        .me{width:28px;height:28px;border-radius:6px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;font-size:.85rem;flex-shrink:0}
        .mn{font-size:.58rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.md{font-size:.44rem;color:rgba(255,255,255,.28);margin-top:1px}
        .mp{font-family:'Cormorant Garamond',serif;font-size:.66rem;font-weight:600;color:var(--coral);flex-shrink:0;margin-left:auto;padding-left:4px}
        .ma{width:16px;height:16px;background:var(--neon);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.65rem;color:#000;font-weight:700;flex-shrink:0;line-height:1}
        .cw{padding:0 12px 12px;display:flex;flex-direction:column;flex:1}
        .ct{font-family:'Cormorant Garamond',serif;font-size:.9rem;font-weight:300;padding:8px 0 9px;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:8px;flex-shrink:0}
        .ci{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)}
        .cq{width:18px;height:18px;background:rgba(57,255,110,.09);border:1px solid rgba(57,255,110,.2);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:.5rem;color:var(--neon);font-weight:500;flex-shrink:0}
        .cn{flex:1;font-size:.58rem}.cp{font-family:'Cormorant Garamond',serif;font-size:.65rem;color:var(--coral)}
        .cdv{height:1px;background:rgba(255,255,255,.06);margin:8px 0}.ctr{display:flex;justify-content:space-between;margin-bottom:10px}
        .ctl{font-size:.52rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.32)}.ctv{font-family:'Cormorant Garamond',serif;font-size:1rem;font-weight:600}
        .cbtn{width:100%;padding:11px;background:var(--neon);color:#000;border:none;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.6rem;font-weight:500;letter-spacing:.14em;text-transform:uppercase;box-shadow:0 3px 14px rgba(57,255,110,.2)}
        .ofw{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;text-align:center;padding:16px;gap:8px}
        .ofi{width:46px;height:46px;background:rgba(57,255,110,.09);border:1.5px solid var(--neon);border-radius:50%;display:flex;align-items:center;justify-content:center;animation:glow 2s ease-in-out infinite}
        @keyframes glow{0%,100%{box-shadow:0 0 16px rgba(57,255,110,.2)}50%{box-shadow:0 0 26px rgba(57,255,110,.45)}}
        .oft{font-family:'Cormorant Garamond',serif;font-size:1.05rem}.ofm{font-size:.54rem;color:rgba(255,255,255,.36);line-height:1.6}
        .ofe{background:rgba(57,255,110,.06);border:1px solid rgba(57,255,110,.16);border-radius:6px;padding:6px 12px;font-size:.5rem;letter-spacing:.08em;text-transform:uppercase;color:var(--neon)}
        .ofe span{font-family:'Cormorant Garamond',serif;font-size:1.2rem;font-weight:600;display:block;letter-spacing:0;text-transform:none}
        .dw{padding:0 11px 11px;display:flex;flex-direction:column;flex:1}.dh{padding:6px 0 8px;border-bottom:1px solid rgba(57,255,110,.09);margin-bottom:8px}
        .dht{font-size:.5rem;letter-spacing:.16em;text-transform:uppercase;color:var(--neon)}.dhs{font-family:'Cormorant Garamond',serif;font-size:.82rem;font-weight:300}
        .dgrid{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:8px}
        .ds{background:rgba(57,255,110,.04);border:1px solid rgba(57,255,110,.12);border-radius:6px;padding:7px 8px}
        .dv{font-family:'Cormorant Garamond',serif;font-size:1.18rem;font-weight:600;color:var(--neon);line-height:1}.dl{font-size:.42rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.28);margin-top:2px}
        .trs{display:flex;flex-direction:column;gap:3px}
        .tr{display:flex;align-items:center;gap:6px;padding:5px 7px;border-radius:5px;border:1px solid rgba(255,255,255,.04);background:rgba(255,255,255,.015)}
        .tr.a{border-color:rgba(57,255,110,.16);background:rgba(57,255,110,.03)}
        .td{width:5px;height:5px;border-radius:50%;flex-shrink:0}.td.g{background:var(--neon);box-shadow:0 0 4px var(--neon)}.td.c{background:var(--coral)}.td.d{background:rgba(255,255,255,.12)}
        .ti{font-size:.48rem;letter-spacing:.08em;color:rgba(255,255,255,.4);width:24px;flex-shrink:0}.ts{flex:1;font-size:.48rem;color:rgba(255,255,255,.3)}.ta{font-family:'Cormorant Garamond',serif;font-size:.62rem;color:var(--coral)}
        #sec-stats,#sec-bento,#sec-advantage,#sec-cta,#footer{position:relative;z-index:10;background:#08090d}
        .sec-in{max-width:1100px;margin:0 auto;padding:80px 48px}
        #sec-stats{background:linear-gradient(180deg,#000 0%,#08090d 100%);border-top:1px solid rgba(57,255,110,.12)}
        .trow{display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}
        .titem{text-align:center;flex:1;min-width:160px}
        .tval{font-family:'Cormorant Garamond',serif;font-size:clamp(2.8rem,5vw,4.5rem);font-weight:600;color:var(--neon);line-height:1;letter-spacing:-.02em}
        .tlbl{font-size:.65rem;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.38);margin-top:8px}
        .tdiv{width:1px;height:60px;background:rgba(255,255,255,.08);flex-shrink:0}
        .bhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px}
        .btitle{font-size:1.1rem;font-weight:500;color:rgba(255,255,255,.85)}.bbadge{font-size:.65rem;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:5px 14px}
        .bgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .bcard{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:32px 28px;position:relative;overflow:hidden;transition:border-color .3s,transform .3s;cursor:default}
        .bcard:hover{border-color:rgba(57,255,110,.25);transform:translateY(-2px)}
        .bcard::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(57,255,110,.3),transparent);opacity:0;transition:opacity .3s}.bcard:hover::before{opacity:1}
        .bicon{width:40px;height:40px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:20px}
        .bicon svg{width:18px;height:18px;stroke:rgba(255,255,255,.7);fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
        .bname{font-size:clamp(1.1rem,1.8vw,1.5rem);font-weight:600;color:#fff;line-height:1.2;margin-bottom:8px;letter-spacing:-.01em}.bdesc{font-size:.82rem;font-weight:300;line-height:1.7;color:rgba(255,255,255,.45)}
        .acard{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);border-radius:20px;padding:56px 52px;position:relative;overflow:hidden}
        .acard::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 70% 50%,rgba(57,255,110,.05) 0%,transparent 70%);pointer-events:none}
        .atag{font-size:.62rem;letter-spacing:.28em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:16px}
        .atitle{font-size:clamp(1.8rem,3.5vw,3rem);font-weight:700;color:#fff;line-height:1.15;letter-spacing:-.02em;margin-bottom:20px}.atitle em{font-style:italic;color:var(--mint)}
        .adesc{font-size:.9rem;font-weight:300;line-height:1.8;color:rgba(255,255,255,.5);max-width:640px;margin-bottom:32px}
        .afts{display:flex;flex-direction:column;gap:10px}.aft{display:flex;align-items:center;gap:12px}
        .aftd{width:6px;height:6px;background:var(--neon);border-radius:50%;box-shadow:0 0 6px var(--neon);flex-shrink:0}.aft span{font-size:.8rem;color:rgba(255,255,255,.55)}
        .ctacard{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);border-radius:20px;padding:64px 52px;text-align:center;position:relative;overflow:hidden}
        .ctacard::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(57,255,110,.07) 0%,transparent 65%);pointer-events:none}
        .ctatag{font-size:.6rem;letter-spacing:.28em;text-transform:uppercase;color:var(--neon);margin-bottom:16px;display:flex;align-items:center;justify-content:center;gap:8px}
        .ctatag::before,.ctatag::after{content:'';display:block;width:20px;height:1px;background:var(--neon);box-shadow:0 0 5px var(--neon)}
        .ctatitle{font-size:clamp(2rem,4vw,3.2rem);font-weight:700;color:#fff;line-height:1.15;letter-spacing:-.02em;margin-bottom:16px}
        .ctadesc{font-size:.88rem;font-weight:300;line-height:1.8;color:rgba(255,255,255,.45);max-width:520px;margin:0 auto 36px}
        .ctabtns{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-bottom:40px}
        .btnp{padding:15px 36px;background:var(--neon);color:#000;border:none;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.78rem;font-weight:500;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;box-shadow:0 4px 24px rgba(57,255,110,.3);transition:all .25s;text-decoration:none;display:inline-block}
        .btnp:hover{background:#fff;box-shadow:0 4px 32px rgba(57,255,110,.5);transform:translateY(-2px)}
        .btng{padding:15px 36px;background:transparent;color:rgba(255,255,255,.6);border:1px solid rgba(255,255,255,.15);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.78rem;font-weight:300;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;transition:all .25s}
        .btng:hover{border-color:rgba(255,255,255,.4);color:#fff}
        .ctrust{display:flex;align-items:center;justify-content:center;gap:28px;flex-wrap:wrap}.tritem{text-align:center}
        .trval{font-family:'Cormorant Garamond',serif;font-size:1.5rem;font-weight:600;color:var(--white);display:block;line-height:1}
        .trlbl{font-size:.58rem;letter-spacing:.15em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-top:3px;display:block}.trdiv{width:1px;height:36px;background:rgba(255,255,255,.08)}
        #footer{border-top:1px solid rgba(255,255,255,.06);background:#04050a}
        .fin{max-width:1100px;margin:0 auto;padding:28px 48px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
        .flogo{font-family:'Cormorant Garamond',serif;font-size:1.1rem;font-weight:600;letter-spacing:.2em;color:rgba(255,255,255,.5)}.flogo b{color:var(--neon)}
        .fcopy{font-size:.6rem;letter-spacing:.12em;color:rgba(255,255,255,.22)}
        .rv{opacity:0;transform:translateY(28px);transition:opacity .65s ease,transform .65s ease}.rv.in{opacity:1;transform:translateY(0)}
        .rv2{transition-delay:.12s}.rv3{transition-delay:.24s}.rv4{transition-delay:.36s}

        /* Premium matte theme overrides */
        body{background:#000;background-image:none}
        body::before,body::after{display:none}
        #stage canvas,#bt,#bb,#nav,#sec-stats,#sec-bento,#sec-advantage,#sec-cta,#footer{background:#000}
        #vig{background:radial-gradient(ellipse at 50% 42%,transparent 42%,rgba(0,0,0,.36) 100%)}
        #nav{border-bottom:1px solid rgba(255,255,255,.08);backdrop-filter:none}
        .logo{color:#f3f4f6}
        .logo b{color:#93c5fd}
        .tagline{color:#cbd5e1;opacity:.72}
        .btn-start{background:linear-gradient(180deg,#3757c8,#2b43a6);color:#eef2ff;border:1px solid rgba(147,197,253,.22);box-shadow:0 6px 18px rgba(18,31,89,.38)}
        .btn-start:hover{background:linear-gradient(180deg,#3f62da,#304db9);box-shadow:0 8px 22px rgba(18,31,89,.45)}
        #hint p{color:rgba(226,232,240,.66)}
        .hline{background:linear-gradient(180deg,rgba(148,163,184,.8),transparent)}
        .card,.bcard,.acard,.ctacard,.pshell,.pscreen,.mh,.tr.a,.qi,.mi,.mi.h,.ds{background:#000!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
        .card{background:rgba(6,8,12,.5)!important;border:1px solid rgba(148,163,184,.36);backdrop-filter:blur(10px)!important;-webkit-backdrop-filter:blur(10px)!important}
        .card,.bcard,.acard,.ctacard,.pshell,.qi,.mi,.mi.h,.ds{border:1px solid rgba(148,163,184,.22)}
        .card,.bcard,.acard,.ctacard{box-shadow:0 10px 30px rgba(0,0,0,.62)}
        .ctag,.ctatag{color:#cbd5e1}
        .ctag::before,.ctatag::before,.ctatag::after{background:#94a3b8;box-shadow:none}
        .card p,.bdesc,.adesc,.ctadesc,.aft span,.fcopy{color:#9ca3af}
        .sv,.tval,.dv,.trval{color:#dbeafe}
        .sl,.tlbl,.trlbl,.bbadge,.atag,.ctl{color:#6b7280}
        .btitle,.bname,.atitle,.ctatitle,.flogo{color:#f3f4f6}
        .bicon{background:#05070a;border:1px solid rgba(148,163,184,.2)}
        .bicon svg{stroke:#d1d5db}
        .btnp,.cbtn{background:linear-gradient(180deg,#3a58c5,#2d46ac);color:#eef2ff;border:1px solid rgba(147,197,253,.25);box-shadow:0 8px 20px rgba(18,31,89,.36)}
        .btnp:hover{background:linear-gradient(180deg,#4567dc,#3553c0);box-shadow:0 10px 24px rgba(18,31,89,.42)}
        .btng{color:#d1d5db;border-color:rgba(148,163,184,.28);background:#05070a}
        .btng:hover{border-color:rgba(226,232,240,.55);color:#f3f4f6}
        #sec-stats,#footer{border-top:1px solid rgba(255,255,255,.08)}
        .ma,.aftd,.td.g{background:#9ca3af;box-shadow:none}
        @media(max-width:768px){#phone{display:none!important}#bt,#bb{height:44px}#nav{height:44px;padding:0 22px}.nav-right{top:6px;right:22px}.logo{font-size:1.1rem}.tagline{display:none}.card{left:16px!important;right:16px!important;bottom:58px!important;top:auto!important;transform:none!important;max-width:none!important;padding:20px 22px}.bgrid{grid-template-columns:1fr}.sec-in{padding:56px 24px}.acard,.ctacard{padding:36px 28px}.fin{flex-direction:column;text-align:center}}
        @media(max-width:480px){#bt,#bb{height:40px}#nav{height:40px;padding:0 16px}.nav-right{top:4px;right:16px}.logo{font-size:1rem}.card{left:12px!important;right:12px!important;bottom:50px!important;padding:18px 20px}.sec-in{padding:40px 16px}.acard,.ctacard{padding:28px 20px}.atitle{font-size:1.6rem}.ctatitle{font-size:1.7rem}.ctabtns{flex-direction:column;align-items:center}.btnp,.btng{width:100%;max-width:280px}}
      `}</style>

      <div id="loader">
        <div className="ll">NEX<b>RESTO</b></div>
        <div className="ltrack"><div className="lbar" id="lbar"></div></div>
        <div className="ltxt" id="ltxt">Loading frames</div>
      </div>

      <div id="stage">
        <canvas id="cv"></canvas>
        <div id="vig"></div>
      </div>

      <div id="bt"></div>
      <div id="bb"></div>
      <div id="spacer"></div>

      <div id="nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="logo">NEX<b>RESTO</b></div>
          <div className="tagline">Premium QR Ordering</div>
        </div>
        <div className="nav-right">
          <a href="/login" className="btn-start">Get Started</a>
        </div>
      </div>

      <div id="hint"><p>Scroll to experience</p><div className="hline"></div></div>

      <div className="card" id="c1"><div className="ctag">The Problem</div><h2>The Evening <b>Rush</b><br />Is Costing You</h2><p>Staff overwhelmed. Tables waiting. Every minute of friction costs revenue and reputation.</p></div>
      <div className="card" id="c2"><div className="ctag">The Venue</div><h2>Your Floor,<br /><i>Reimagined.</i></h2><p>Every table is a self-service point. Guests scan, browse and order instantly.</p></div>
      <div className="card" id="c3"><div className="ctag">Live Demo</div><h2>Scan.<br />Order.<br /><b>Done.</b></h2><p>QR scan to confirmed order in under 10 seconds.</p></div>
      <div className="card" id="c4"><div className="ctag">Total Control</div><h2>Every Table.<br />One <b>Dashboard.</b></h2><p>Real-time order tracking, table status and revenue at a glance.</p><div className="stats"><div><div className="sv">3×</div><div className="sl">Faster</div></div><div><div className="sv">40%</div><div className="sl">Revenue</div></div><div><div className="sv">98%</div><div className="sl">Satisfaction</div></div></div></div>

      <div id="phone">
        <div className="pshell">
          <div className="notch"><div className="n-spk"></div><div className="n-cam"></div></div>
          <div className="pscreen">
            <div className="sbar"><span style={{ fontWeight: 500 }}>9:41</span><span style={{ opacity: 0.5 }}>▲▲▲ 🔋</span></div>
            <div className="ah"><div className="al">NEX<b>RESTO</b></div><div className="at">Table T-04 · The Grand</div></div>
            <div className="scr on" id="s0"><div className="qw"><div className="qt">Scan to Begin</div><div className="qs">Point camera at table QR</div><div className="qbox"><div className="qgrid" id="qrg"></div><div className="qc"><div className="bl"></div><div className="br"></div></div><div className="qline"></div></div><div className="qi"><div className="qdot"></div><span>T-04 · 2 Guests · Ready</span></div><div className="qs" style={{ color: 'rgba(57,255,110,.4)' }}>Scanning automatically…</div></div></div>
            <div className="scr" id="s1"><div className="ms"><div className="mh"><div><div className="mhn">The Grand Restaurant</div><div className="mhg">Evening Menu · Live</div></div><div className="mhb">T-04</div></div><div className="mc">Starters</div><div className="mi h"><div className="me">🥗</div><div style={{ flex: 1, minWidth: 0 }}><div className="mn">Garden Salad</div><div className="md">Seasonal greens</div></div><div className="mp">$18</div><div className="ma">+</div></div><div className="mi"><div className="me">🍤</div><div style={{ flex: 1, minWidth: 0 }}><div className="mn">Prawn Tempura</div><div className="md">Tiger prawns, yuzu</div></div><div className="mp">$24</div><div className="ma">+</div></div><div className="mc">Mains</div><div className="mi h"><div className="me">🥩</div><div style={{ flex: 1, minWidth: 0 }}><div className="mn">Wagyu Striploin</div><div className="md">Truffle butter</div></div><div className="mp">$68</div><div className="ma">+</div></div><div className="mi"><div className="me">🐟</div><div style={{ flex: 1, minWidth: 0 }}><div className="mn">Sea Bass</div><div className="md">Saffron broth</div></div><div className="mp">$52</div><div className="ma">+</div></div><div className="mc">Beverages</div><div className="mi"><div className="me">🍷</div><div style={{ flex: 1, minWidth: 0 }}><div className="mn">House Red Wine</div><div className="md">Malbec, 2021</div></div><div className="mp">$16</div><div className="ma">+</div></div><div className="mi"><div className="me">🍸</div><div style={{ flex: 1, minWidth: 0 }}><div className="mn">Signature Cocktail</div><div className="md">Elderflower gin</div></div><div className="mp">$22</div><div className="ma">+</div></div></div></div>
            <div className="scr" id="s2"><div className="cw"><div className="ct">Your Order · T-04</div><div className="ci"><div className="cq">1×</div><div className="cn">Garden Salad</div><div className="cp">$18</div></div><div className="ci"><div className="cq">1×</div><div className="cn">Wagyu Striploin</div><div className="cp">$68</div></div><div className="ci"><div className="cq">2×</div><div className="cn">House Red Wine</div><div className="cp">$32</div></div><div className="cdv"></div><div className="ctr"><div className="ctl">Total</div><div className="ctv">$118.00</div></div><button className="cbtn">✦ Place Order</button></div></div>
            <div className="scr" id="s3"><div className="ofw"><div className="ofi"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#39ff6e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></div><div className="oft">Order Confirmed!</div><div className="ofm">Being prepared now.<br />Table T-04 · 3 items · $118</div><div className="ofe">Estimated arrival<span>12 min</span></div></div></div>
            <div className="scr" id="s4"><div className="dw"><div className="dh"><div className="dht">Live Dashboard</div><div className="dhs">The Grand · Tonight</div></div><div className="dgrid"><div className="ds"><div className="dv">24</div><div className="dl">Active Tables</div></div><div className="ds"><div className="dv">$4.2k</div><div className="dl">Revenue</div></div><div className="ds"><div className="dv">87</div><div className="dl">Orders</div></div><div className="ds"><div className="dv">4 min</div><div className="dl">Avg Time</div></div></div><div className="trs"><div className="tr a"><div className="td g"></div><div className="ti">T-01</div><div className="ts">Ordering now</div><div className="ta">$142</div></div><div className="tr a"><div className="td g"></div><div className="ti">T-04</div><div className="ts">Confirmed</div><div className="ta">$118</div></div><div className="tr"><div className="td c"></div><div className="ti">T-07</div><div className="ts">Awaiting service</div><div className="ta">$89</div></div><div className="tr"><div className="td d"></div><div className="ti">T-12</div><div className="ts">Available</div><div className="ta">—</div></div></div></div></div>
          </div>
        </div>
      </div>

      <section id="sec-stats"><div className="sec-in"><div className="trow"><div className="titem rv"><div className="tval" id="tv0">35%</div><div className="tlbl">Avg. Table Turn Lift</div></div><div className="tdiv"></div><div className="titem rv rv2"><div className="tval" id="tv1">2h</div><div className="tlbl">Setup Time</div></div><div className="tdiv"></div><div className="titem rv rv3"><div className="tval" id="tv2">200+</div><div className="tlbl">Live Venues</div></div><div className="tdiv"></div><div className="titem rv rv4"><div className="tval" id="tv3">1.2M</div><div className="tlbl">QR Scans / Month</div></div></div></div></section>

      <section id="sec-bento"><div className="sec-in"><div className="bhead rv"><div className="btitle">Neural Ops Bento Grid</div><div className="bbadge">Pro</div></div><div className="bgrid"><div className="bcard rv rv2"><div className="bicon"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg></div><div className="bname">Live QR Ordering</div><div className="bdesc">Launch table-linked menus instantly and reduce ordering friction.</div></div><div className="bcard rv rv3"><div className="bicon"><svg viewBox="0 0 24 24"><path d="M12 2l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z" /></svg></div><div className="bname">AI Floor Intelligence</div><div className="bdesc">Auto-detect and refine floor layouts with interactive 2D/3D review.</div></div><div className="bcard rv rv2"><div className="bicon"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg></div><div className="bname">Secure Multi-Tenant</div><div className="bdesc">Each hotel keeps isolated data with role-aware access control.</div></div><div className="bcard rv rv3"><div className="bicon"><svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg></div><div className="bname">Fast Operator UX</div><div className="bdesc">Mobile-first workflows designed for owners and staff on the move.</div></div></div></div></section>

      <section id="sec-advantage"><div className="sec-in"><div className="acard rv"><div className="atag">The 3D Advantage</div><div className="atitle">Spatial Intelligence<br />is your <em>edge.</em></div><div className="adesc">AI Auto-Layout bridges your physical restaurant and digital command center. Scan your floor, generate a smart arrangement, then refine in interactive 3D before service starts.</div><div className="afts"><div className="aft"><div className="aftd"></div><span>Auto-scan floor plan from photo</span></div><div className="aft"><div className="aftd"></div><span>AI suggests optimal table layout</span></div><div className="aft"><div className="aftd"></div><span>Interactive 3D refinement before service</span></div><div className="aft"><div className="aftd"></div><span>Live sync with QR ordering system</span></div></div></div></div></section>

      <section id="sec-cta"><div className="sec-in"><div className="ctacard rv"><div className="ctatag">Get Started</div><div className="ctatitle">Ready to transform<br />your restaurant?</div><div className="ctadesc">Join 200+ venues using NEXRESTO to deliver faster service, better data, and higher revenue.</div><div className="ctabtns"><a href="/login" className="btnp">Get Started ↗</a><button className="btng">See Pricing</button></div><div className="ctrust"><div className="tritem"><span className="trval">200+</span><span className="trlbl">Live Venues</span></div><div className="trdiv"></div><div className="tritem"><span className="trval">4.9★</span><span className="trlbl">Avg Rating</span></div><div className="trdiv"></div><div className="tritem"><span className="trval">24/7</span><span className="trlbl">Support</span></div></div></div></div></section>

      <footer id="footer"><div className="fin"><div className="flogo">NEX<b>RESTO</b></div><div className="fcopy">© 2025 NEXRESTO. Premium QR Ordering for Hospitality.</div></div></footer>
    </>
  );
}
