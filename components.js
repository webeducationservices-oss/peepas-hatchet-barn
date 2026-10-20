/**
 * Pee-Pa's Garage Hatchet Barn — shared site components
 *
 * Handles: nav scroll effect, mobile menu toggle, smooth-scroll for anchors,
 * form submission to myaieditor.com/api/form-notify (with reCAPTCHA + honeypot),
 * and the waiver signature pad.
 */
(function () {
  'use strict';

  const FORM_NOTIFY_ENDPOINT = 'https://myaieditor.com/api/form-notify';
  const SITE_SLUG = 'peepas-hatchet-barn';
  // Shared WES reCAPTCHA v3 site key. Server-side verification happens in form-notify.
  const RECAPTCHA_SITE_KEY = window.__RECAPTCHA_SITE_KEY__ || '6Lck8aQsAAAAALMA-T6nwfkSf7bv4K-mOhkszeKh';

  /** Hostnames where reCAPTCHA is enabled. Skips it on staging URLs (Vercel previews)
   *  so we don't get the "Invalid domain for site key" error in the corner.
   *  Add the production hostname back here once DNS cuts over. */
  const RECAPTCHA_ALLOWED_HOSTS = [
    'peepasgaragehatchetbarn.com',
    'www.peepasgaragehatchetbarn.com',
  ];

  /** Inject the reCAPTCHA v3 script tag once, only if there's a form on this page
   *  AND we're on a hostname registered with the reCAPTCHA key. */
  function injectRecaptcha() {
    if (!RECAPTCHA_SITE_KEY) return;
    if (!RECAPTCHA_ALLOWED_HOSTS.includes(window.location.hostname)) return;
    if (document.querySelector('script[data-recaptcha]')) return;
    if (!document.querySelector('form[data-form-type]')) return;
    const s = document.createElement('script');
    s.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    s.async = true;
    s.defer = true;
    s.setAttribute('data-recaptcha', '1');
    document.head.appendChild(s);
  }

  /* -------------------------------------------------------------------------- */
  /* Nav: scroll effect + mobile toggle                                          */
  /* -------------------------------------------------------------------------- */
  function initNav() {
    const navbar = document.getElementById('navbar');
    const navLinks = document.getElementById('navLinks');
    const toggle = document.getElementById('mobileToggle');

    if (navbar) {
      const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 50);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    if (toggle && navLinks) {
      // Scrim lives on <body> so it covers the page but sits under the drawer.
      const backdrop = document.createElement('div');
      backdrop.className = 'nav-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.appendChild(backdrop);

      const setMenu = (open) => {
        navLinks.classList.toggle('open', open);
        backdrop.classList.toggle('show', open);
        document.body.classList.toggle('menu-open', open);
        if (navbar) navbar.classList.toggle('menu-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      };
      const closeMenu = ({ refocus } = {}) => {
        if (!navLinks.classList.contains('open')) return;
        setMenu(false);
        if (refocus) toggle.focus();
      };

      // Correct label before the first interaction, not just after it.
      toggle.setAttribute('aria-label', 'Open menu');
      toggle.setAttribute('aria-controls', 'navLinks');

      toggle.addEventListener('click', () => {
        setMenu(!navLinks.classList.contains('open'));
      });

      // Every way out: the X, the scrim, Escape, picking a link.
      backdrop.addEventListener('click', () => closeMenu({ refocus: true }));
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu({ refocus: true });
      });
      navLinks.querySelectorAll('a').forEach((a) => {
        a.addEventListener('click', () => closeMenu());
      });
      // Resizing past the breakpoint must not strand the body scroll lock.
      window.addEventListener('resize', () => {
        if (window.innerWidth > 1100) closeMenu();
      });
    }

    // Close mobile nav and smooth-scroll for on-page anchors
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const href = a.getAttribute('href');
        if (!href || href === '#') return;
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Forms                                                                       */
  /* -------------------------------------------------------------------------- */
  async function getRecaptchaToken(action) {
    if (!RECAPTCHA_SITE_KEY || typeof grecaptcha === 'undefined') return '';
    return new Promise((resolve) => {
      grecaptcha.ready(() => {
        grecaptcha.execute(RECAPTCHA_SITE_KEY, { action }).then(resolve).catch(() => resolve(''));
      });
    });
  }

  function showStatus(form, type, message) {
    const status = form.querySelector('.form-status');
    if (!status) return;
    status.className = `form-status ${type}`;
    status.textContent = message;
  }

  async function submitForm(form) {
    const formType = form.dataset.formType;
    if (!formType) {
      console.error('Form missing data-form-type attribute');
      return;
    }

    // Honeypot — if filled, silently "succeed" and bail
    const honey = form.querySelector('input[name="_honey"]');
    if (honey && honey.value) {
      showStatus(form, 'success', 'Thanks!');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalLabel = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
    }

    // Build payload from form
    const formData = new FormData(form);
    const payload = {
      site_slug: SITE_SLUG,
      form_type: formType,
      _honey: '',
    };
    formData.forEach((value, key) => {
      if (key === '_honey') return;
      payload[key] = value;
    });

    try {
      payload.recaptcha_token = await getRecaptchaToken(formType.replace(/-/g, '_'));

      const res = await fetch(FORM_NOTIFY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // form-notify answers 200 with {accepted:false} for rejected/blocked
      // submissions (low reCAPTCHA score, spam blocklist, honeypot), so
      // res.ok alone is NOT enough — a real lead would be silently dropped
      // while the visitor is told it went through. Success must be earned.
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.accepted === false) {
        throw new Error(`rejected: ${json.reason || `HTTP ${res.status}`}`);
      }

      // Redirect to thank-you if configured, else show success message in-place
      const redirect = form.dataset.thankYou;
      if (redirect) {
        window.location.href = redirect;
        return;
      }
      showStatus(form, 'success', form.dataset.successMessage || 'Thanks — we got it!');
      form.reset();
      // Clear any signature pad too
      const sig = form.querySelector('.sig-pad');
      if (sig && sig._clearSignature) sig._clearSignature();
    } catch (err) {
      console.error('Form submit failed', err);
      showStatus(form, 'error', form.dataset.errorMessage || 'We could not submit that. Please call us at 727-526-6251 and we will take your details.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    }
  }

  function initForms() {
    document.querySelectorAll('form[data-form-type]').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        submitForm(form);
      });
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Signature pad (waiver)                                                      */
  /* -------------------------------------------------------------------------- */
  function initSignaturePad() {
    document.querySelectorAll('.sig-pad').forEach((canvas) => {
      const ctx = canvas.getContext('2d');
      const wrap = canvas.closest('.sig-pad-wrap');
      const placeholder = wrap ? wrap.querySelector('.sig-placeholder') : null;
      const hiddenInput = canvas.dataset.targetInput
        ? document.querySelector(`input[name="${canvas.dataset.targetInput}"]`)
        : null;

      // High-DPI canvas
      const resize = () => {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#0F0F0F';
      };
      resize();
      window.addEventListener('resize', resize);

      let drawing = false;
      let hasInk = false;
      let last = null;

      const pointFromEvent = (e) => {
        const rect = canvas.getBoundingClientRect();
        const point = e.touches ? e.touches[0] : e;
        return { x: point.clientX - rect.left, y: point.clientY - rect.top };
      };

      const start = (e) => {
        e.preventDefault();
        drawing = true;
        last = pointFromEvent(e);
      };
      const move = (e) => {
        if (!drawing) return;
        e.preventDefault();
        const p = pointFromEvent(e);
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        last = p;
        if (!hasInk) {
          hasInk = true;
          if (placeholder) placeholder.classList.add('hidden');
        }
      };
      const end = () => {
        if (!drawing) return;
        drawing = false;
        if (hiddenInput) hiddenInput.value = canvas.toDataURL('image/png');
      };

      canvas.addEventListener('mousedown', start);
      canvas.addEventListener('mousemove', move);
      canvas.addEventListener('mouseup', end);
      canvas.addEventListener('mouseleave', end);
      canvas.addEventListener('touchstart', start, { passive: false });
      canvas.addEventListener('touchmove', move, { passive: false });
      canvas.addEventListener('touchend', end);

      const clearBtn = wrap ? wrap.querySelector('.sig-clear') : null;
      const clearSignature = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasInk = false;
        if (placeholder) placeholder.classList.remove('hidden');
        if (hiddenInput) hiddenInput.value = '';
      };
      canvas._clearSignature = clearSignature;
      if (clearBtn) clearBtn.addEventListener('click', clearSignature);
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Timed promo: Barnyard Brawl                                                 */
  /* -------------------------------------------------------------------------- */
  /** ONE switch for the whole promo. Everything below keys off this.
   *  ENDS_AT is the moment it all disappears: midnight Eastern starting Nov 16,
   *  the day after the tournament ends. -05:00 because Nov 16 is EST, not EDT.
   *  To pull the promo early, set ENDS_AT to a past date. To kill only the
   *  popup but keep the pages, set SHOW_POPUP to false. */
  const PROMO = {
    id: 'barnyard-brawl',
    endsAt: new Date('2026-11-16T00:00:00-05:00'),
    showPopup: true,
    url: 'https://book.peek.com/s/b0f8c26d-0654-4560-86cd-b89c5f47114c/OvZoR',
    page: '/barnyard-brawl/',
    flyer: '/images/barnyard-brawl-flyer.webp',
  };

  const promoIsLive = () => new Date() < PROMO.endsAt;

  /** Strip every promo block once the date passes, so nothing has to be
   *  hand-removed later. Blocks are in the HTML so they render with no flash
   *  (and stay crawlable) while the promo is live. */
  function initPromoExpiry() {
    if (promoIsLive()) return;
    document.querySelectorAll('[data-promo="' + PROMO.id + '"]').forEach((el) => el.remove());
    document.querySelectorAll('[data-promo-expired="' + PROMO.id + '"]').forEach((el) => {
      el.hidden = false;
    });
  }

  function initPromoPopup() {
    if (!PROMO.showPopup || !promoIsLive()) return;
    // Never on the promo's own page, that is just in the way.
    if (window.location.pathname.replace(/\/+$/, '/') === PROMO.page) return;
    // Once per browser session, so it does not nag on every page view.
    try {
      if (sessionStorage.getItem('promo-seen-' + PROMO.id)) return;
      sessionStorage.setItem('promo-seen-' + PROMO.id, '1');
    } catch (e) { /* private mode: fall through and just show it once */ }

    const overlay = document.createElement('div');
    overlay.className = 'promo-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'The Barnyard Brawl, November 13 to 15');
    overlay.innerHTML =
      '<div class="promo-modal-box">' +
        '<button type="button" class="promo-close" aria-label="Close">&times;</button>' +
        '<a class="promo-flyer-link" href="' + PROMO.page + '">' +
          '<img src="' + PROMO.flyer + '" alt="The Barnyard Brawl, November 13 to 15, a WATL and WKTL local tournament at Pee-Pa\'s Garage Hatchet Barn" width="900" height="1200">' +
        '</a>' +
        '<div class="promo-actions">' +
          '<a class="btn btn-primary" href="' + PROMO.url + '" target="_blank" rel="noopener">Register Now</a>' +
          '<a class="btn btn-outline" href="' + PROMO.page + '">Event Details</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    const close = () => {
      overlay.classList.remove('show');
      document.body.classList.remove('promo-open');
      setTimeout(() => overlay.remove(), 320);
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };

    overlay.querySelector('.promo-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    // Leaving for Peek or the detail page should not leave the scroll locked.
    overlay.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));

    requestAnimationFrame(() => {
      overlay.classList.add('show');
      document.body.classList.add('promo-open');
      overlay.querySelector('.promo-close').focus();
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Init                                                                        */
  /* -------------------------------------------------------------------------- */
  function init() {
    initNav();
    initForms();
    initSignaturePad();
    injectRecaptcha();
    initPromoExpiry();
    initPromoPopup();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
