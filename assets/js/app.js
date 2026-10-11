/* ==========================================================================
   黄磜镇农文旅综合服务平台 · shared runtime
   Vanilla ES modules-free IIFE. No dependencies, no build step.
   Every behaviour degrades gracefully if JS fails.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Theme — persisted, honours system preference on first visit.
     Applied before paint by the inline script in <head> to avoid flash.
     ------------------------------------------------------------------ */
  const THEME_KEY = 'hz-theme';

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* private mode */ }
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-label',
        theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
    });
  }

  function initTheme() {
    const stored = (function () {
      try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
    })();
    if (stored) {
      applyTheme(stored);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(prefersDark ? 'dark' : 'light');
    }
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-theme-toggle]');
      if (btn) applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });
  }

  /* ------------------------------------------------------------------
     Scroll subscription — 统一走 motion.js 的合帧器，避免每个模块各写一份
     ------------------------------------------------------------------ */
  function onScroll(fn) {
    if (window.HZMotion && window.HZMotion.coalesce) {
      window.addEventListener('scroll', window.HZMotion.coalesce(fn), { passive: true });
      return;
    }
    let ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () { ticking = false; fn(); });
    }, { passive: true });
  }

  /* ------------------------------------------------------------------
     Navbar — solid after scrolling past a threshold
     ------------------------------------------------------------------ */
  function initNavbar() {
    const nav = document.querySelector('.navbar');
    if (!nav) return;
    const solid = nav.classList.contains('navbar--solid');
    if (solid) return;

    function update() {
      nav.classList.toggle('is-scrolled', window.scrollY > 40);
    }
    onScroll(update);
    update();
  }

  /* ------------------------------------------------------------------
     Mobile drawer — focus trap + Esc + scroll lock
     ------------------------------------------------------------------ */
  function initDrawer(drawer) {
    if (!drawer) return null;
    // Idempotent — one drawer is reachable both by the generic [.drawer] sweep
    // and by a page-specific initialiser (#detailDrawer). Re-entering would
    // double-bind the focus trap and the close handlers.
    if (drawer.__hzDrawer) return drawer.__hzDrawer;
    const openers = document.querySelectorAll('[data-drawer-open="' + drawer.id + '"]');
    let lastFocused = null;

    function focusables() {
      return Array.prototype.filter.call(
        drawer.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
        ),
        function (el) { return el.offsetParent !== null; }
      );
    }

    /* 抽屉属于高优先级交互动画：任何档位都要完整播完再摘 DOM 状态。
       关闭分两步 —— 先加 is-closing 播收尾，播完才移除 is-open，
       避免面板「啪」地消失、也避免收尾动画被打断留下残留。 */
    let closing = false;

    function open() {
      if (closing) return;
      lastFocused = document.activeElement;
      if (window.HZMotion) window.HZMotion.destroyWithin(drawer);
      drawer.classList.remove('is-closing');
      drawer.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      const f = focusables();
      if (f.length) f[0].focus();
    }

    function finishClose() {
      drawer.classList.remove('is-open');
      drawer.classList.remove('is-closing');
      document.body.style.overflow = '';
      closing = false;
      if (lastFocused) lastFocused.focus();
    }

    function close() {
      if (!drawer.classList.contains('is-open') || closing) return;
      const M = window.HZMotion;
      if (!M || M.reduced() || M.tier() === 'off') { finishClose(); return; }

      closing = true;
      drawer.classList.add('is-closing');

      const panel = drawer.querySelector('.drawer__panel');
      let done = false;
      const finish = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (panel) panel.removeEventListener('transitionend', onEnd);
        finishClose();
      };
      const onEnd = function (e) {
        if (panel && e.target !== panel) return;
        finish();
      };
      const timer = setTimeout(finish, 460);
      if (panel) panel.addEventListener('transitionend', onEnd);
    }

    openers.forEach(function (o) { o.addEventListener('click', open); });
    drawer.querySelectorAll('[data-drawer-close]').forEach(function (c) {
      c.addEventListener('click', close);
    });

    document.addEventListener('keydown', function (e) {
      if (!drawer.classList.contains('is-open') || closing) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });

    const api = { open: open, close: close };
    drawer.__hzDrawer = api;
    return api;
  }

  function initDrawers() {
    document.querySelectorAll('.drawer').forEach(initDrawer);
  }

  /* ------------------------------------------------------------------
     Scroll reveal — 观察者与交错逻辑统一放在 motion.js
     ------------------------------------------------------------------ */
  function initReveal() {
    if (window.HZMotion && typeof window.HZMotion.reveal === 'function') {
      window.HZMotion.reveal();
      return;
    }
    document.querySelectorAll('[data-reveal]').forEach(function (t) {
      t.classList.add('is-visible');
    });
  }

  /* ------------------------------------------------------------------
     Toast — 实现统一收在 motion.js（HZMotion.toast）：
     出入场曲线、同屏队列上限、销毁清理全站共用一套规范。
     ------------------------------------------------------------------ */
  function toast(message, options) {
    if (window.HZMotion && typeof window.HZMotion.toast === 'function') {
      return window.HZMotion.toast(message, options);
    }
    // motion.js 缺失时的极简兜底，保证功能不静默失效
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2400);
    return el;
  }

  /* ------------------------------------------------------------------
     Back to top
     ------------------------------------------------------------------ */
  function initToTop() {
    const btn = document.querySelector('.to-top');
    if (!btn) return;
    function update() {
      btn.classList.toggle('is-visible', window.scrollY > 700);
    }
    onScroll(update);
    btn.addEventListener('click', function () {
      const M = window.HZMotion;
      const reduced = M && (M.reduced() || M.tier() === 'off');
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
    update();
  }

  /* ------------------------------------------------------------------
     Hero carousel — autoplay, pause on hover/focus, keyboard, swipe
     ------------------------------------------------------------------ */
  function initHero() {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    const slides = Array.prototype.slice.call(hero.querySelectorAll('.hero__slide'));
    const dots = Array.prototype.slice.call(hero.querySelectorAll('.hero__dot'));
    if (slides.length < 2) return;

    const INTERVAL = 7000;
    let index = 0;
    let timer = null;

    function show(next) {
      index = (next + slides.length) % slides.length;
      slides.forEach(function (s, i) {
        s.classList.toggle('is-active', i === index);
        s.setAttribute('aria-hidden', i === index ? 'false' : 'true');
      });
      dots.forEach(function (d, i) {
        d.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });
      // Restart the progress animation on the active dot
      const active = dots[index];
      if (active) {
        const before = active.style.animation;
        active.style.animation = 'none';
        void active.offsetWidth;
        active.style.animation = before || '';
      }
    }

    function play() {
      stop();
      timer = setInterval(function () { show(index + 1); }, INTERVAL);
      hero.classList.remove('is-paused');
    }

    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      hero.classList.add('is-paused');
    }

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () { show(i); play(); });
    });

    hero.addEventListener('mouseenter', stop);
    hero.addEventListener('mouseleave', play);
    hero.addEventListener('focusin', stop);
    hero.addEventListener('focusout', function (e) {
      if (!hero.contains(e.relatedTarget)) play();
    });

    // Touch swipe
    let startX = 0;
    hero.addEventListener('touchstart', function (e) {
      startX = e.changedTouches[0].clientX;
    }, { passive: true });
    hero.addEventListener('touchend', function (e) {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) < 48) return;
      show(index + (dx < 0 ? 1 : -1));
      play();
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else play();
    });

    hero.setAttribute('tabindex', '0');
    hero.setAttribute('aria-roledescription', '轮播');
    hero.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { show(index - 1); play(); }
      if (e.key === 'ArrowRight') { show(index + 1); play(); }
    });

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    show(0);
    if (!reduced) play();
  }

  /* ------------------------------------------------------------------
     Generic filter engine
     Any element with [data-filter-group] holds chips carrying
     [data-filter-value]; items carry [data-tags] (comma-separated).
     Optional [data-filter-count] output and [data-filter-empty] panel.
     ------------------------------------------------------------------ */
  function initFilters() {
    const groups = document.querySelectorAll('[data-filter-group]');
    if (!groups.length) return;

    const active = {}; // groupId -> Set of values ('all' is implicit)

    groups.forEach(function (group) {
      const id = group.getAttribute('data-filter-group');
      active[id] = new Set();

      group.addEventListener('click', function (e) {
        const chip = e.target.closest('[data-filter-value]');
        if (!chip) return;
        const value = chip.getAttribute('data-filter-value');

        if (value === 'all') {
          active[id].clear();
        } else if (active[id].has(value)) {
          active[id].delete(value);
        } else {
          active[id].add(value);
        }
        syncGroup(group, id);
        applyAll();
      });
      syncGroup(group, id);
    });

    function syncGroup(group, id) {
      const set = active[id];
      group.querySelectorAll('[data-filter-value]').forEach(function (chip) {
        const value = chip.getAttribute('data-filter-value');
        if (value === 'all') {
          chip.setAttribute('aria-pressed', set.size === 0 ? 'true' : 'false');
        } else {
          chip.setAttribute('aria-pressed', set.has(value) ? 'true' : 'false');
        }
      });
    }

    function applyAll() {
      const items = document.querySelectorAll('[data-filter-item]');
      let entering = 0;
      // 交错步长：低性能档位直接取消排队，一次到位
      const M0 = window.HZMotion;
      const step = (M0 && M0.tier() === 'low') ? 0 : 28;

      items.forEach(function (item) {
        const tags = (item.getAttribute('data-tags') || '')
          .split(',').map(function (t) { return t.trim(); }).filter(Boolean);

        // Query text match
        const query = (window.__hzQuery || '').trim().toLowerCase();
        const title = (item.getAttribute('data-search') || item.textContent || '').toLowerCase();
        const matchesQuery = !query || title.indexOf(query) !== -1;

        // Price ceiling from the range slider (null = no ceiling)
        const priceCap = window.__hzPriceMax;
        const price = parseFloat(item.getAttribute('data-price'));
        const matchesPrice = !priceCap || isNaN(price) || price <= priceCap;

        // Every active group must be satisfied (AND across groups, OR within)
        const matchesGroups = Object.keys(active).every(function (id) {
          const set = active[id];
          if (set.size === 0) return true;
          return Array.from(set).some(function (v) { return tags.indexOf(v) !== -1; });
        });

        const visible = matchesQuery && matchesPrice && matchesGroups;
        const wasVisible = !item.hidden;

        item.hidden = !visible;
        item.style.display = visible ? '' : 'none';

        // 只在「由隐转显」时播放入场动画，并让同批出现的卡片依次错开。
        // 走 HZMotion：重复触发只重置不叠加，播完自动摘类，低档位自动取消交错。
        if (visible && !wasVisible) {
          const M = window.HZMotion;
          if (M) {
            M.enter(item, 'is-filter-in', { delay: entering * step, duration: 340 });
          } else {
            item.classList.add('is-filter-in');
          }
          entering++;
        }
      });

      updateCount();
      updateEmptyState();
      renderSummary();
    }

    function updateCount() {
      const total = document.querySelectorAll('[data-filter-item]').length;
      const shown = Array.prototype.filter.call(
        document.querySelectorAll('[data-filter-item]'),
        function (i) { return !i.hidden; }
      ).length;
      document.querySelectorAll('[data-filter-count]').forEach(function (el) {
        el.textContent = shown;
      });
      document.querySelectorAll('[data-filter-total]').forEach(function (el) {
        el.textContent = total;
      });
    }

    function updateEmptyState() {
      const panel = document.querySelector('[data-filter-empty]');
      if (!panel) return;
      const shown = Array.prototype.filter.call(
        document.querySelectorAll('[data-filter-item]'),
        function (i) { return !i.hidden; }
      ).length;
      panel.hidden = shown !== 0;
      const grid = document.querySelector('[data-filter-results]');
      if (grid) grid.style.display = shown === 0 ? 'none' : '';
    }

    /* Active-filter summary chips — preserves the user's selection visibly */
    function renderSummary() {
      const host = document.querySelector('[data-filter-summary]');
      if (!host) return;
      host.innerHTML = '';
      let any = false;
      Object.keys(active).forEach(function (id) {
        active[id].forEach(function (value) {
          any = true;
          const tag = document.createElement('span');
          tag.className = 'filter-summary__tag';
          const label = document.createElement('span');
          label.textContent = value;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.setAttribute('aria-label', '移除筛选：' + value);
          btn.textContent = '✕';
          btn.addEventListener('click', function () {
            active[id].delete(value);
            const group = document.querySelector('[data-filter-group="' + id + '"]');
            if (group) syncGroup(group, id);
            applyAll();
          });
          tag.appendChild(label);
          tag.appendChild(btn);
          host.appendChild(tag);
        });
      });
      const clear = document.querySelector('[data-filter-clear]');
      if (clear) clear.hidden = !any;
      host.hidden = !any;
    }

    const clearBtn = document.querySelector('[data-filter-clear]');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        Object.keys(active).forEach(function (id) {
          active[id].clear();
          const group = document.querySelector('[data-filter-group="' + id + '"]');
          if (group) syncGroup(group, id);
        });
        window.__hzQuery = '';
        window.__hzPriceMax = null;
        const search = document.querySelector('[data-search-input]');
        if (search) search.value = '';
        const slider = document.querySelector('[data-price-input]');
        if (slider) slider.value = slider.max;
        const rangeOut = document.querySelector('[data-price-output]');
        if (rangeOut && slider) {
          rangeOut.textContent = '¥' + slider.min + ' – ¥' + slider.max;
          slider.style.setProperty('--range-fill', '100%');
        }
        applyAll();
      });
    }

    // Live search
    const search = document.querySelector('[data-search-input]');
    if (search) {
      let t = null;
      search.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          window.__hzQuery = search.value;
          applyAll();
        }, 160);
      });
    }

    // Expose so other modules (sort, map, sidebar) can drive this engine
    window.__hzApplyFilters = applyAll;
    window.__hzSetGroup = function (id, values) {
      if (!active[id]) return;
      active[id].clear();
      (values || []).forEach(function (v) { active[id].add(v); });
      const group = document.querySelector('[data-filter-group="' + id + '"]');
      if (group) syncGroup(group, id);
      applyAll();
    };
    applyAll();
  }

  /* ------------------------------------------------------------------
     Select-based filter group (attractions: season dropdown)
     Mirrors the <select> choice onto its hidden chip bus, then asks the
     chip engine to re-read that bus and re-filter.
     ------------------------------------------------------------------ */
  function initFilterSelects() {
    const selects = document.querySelectorAll('[data-filter-select]');
    if (!selects.length) return;

    selects.forEach(function (select) {
      select.addEventListener('change', function () {
        const id = select.getAttribute('data-filter-select');
        const bus = document.querySelector('[data-filter-select-group="' + id + '"]');
        if (!bus) return;
        const value = select.value;

        // Reset the bus, then press the chip matching the new selection
        bus.querySelectorAll('[data-filter-value]').forEach(function (chip) {
          const chipValue = chip.getAttribute('data-filter-value');
          const on = value === 'all' ? chipValue === 'all' : chipValue === value;
          chip.setAttribute('aria-pressed', on ? 'true' : 'false');
        });

        // Dispatch a real click on the chosen chip so the engine's own
        // state bookkeeping stays the single source of truth.
        const target = bus.querySelector(
          '[data-filter-value="' + (value === 'all' ? 'all' : value) + '"]');
        if (target) target.click();
      });
    });
  }

  /* ------------------------------------------------------------------
     Price range — one slider is friendlier than two min/max inputs.
     Emits a synthetic tag ('price:<=N') consumed by the filter engine.
     ------------------------------------------------------------------ */
  function initPriceRange() {
    const slider = document.querySelector('[data-price-input]');
    if (!slider) return;
    const output = document.querySelector('[data-price-output]');
    const wrap = slider.closest('[data-price-range]') || slider.parentElement;
    let lastShown = null;

    // Read from the attribute when the DOM property is unavailable or stale
    function attrNum(name, fallback) {
      const raw = slider[name] !== undefined && slider[name] !== ''
        ? slider[name]
        : slider.getAttribute(name);
      const n = parseFloat(raw);
      return isNaN(n) ? fallback : n;
    }

    const min = attrNum('min', 0);
    const max = attrNum('max', 1000);

    function paint() {
      const v = attrNum('value', max);
      if (output) {
        const next = '¥' + min + ' – ¥' + v;
        if (output.textContent !== next) {
          output.textContent = next;
          // 数字必须即时跟上手指，所以不做滚动动画，只做一次脉冲
          output.classList.remove('is-pulse');
          void output.offsetWidth;
          output.classList.add('is-pulse');
        }
        lastShown = v;
      }
      const span = max - min;
      const pct = span > 0 ? ((v - min) / span) * 100 : 100;
      if (slider.style && slider.style.setProperty) {
        slider.style.setProperty('--range-fill', pct + '%');
      }
      window.__hzPriceMax = v >= max ? null : v;
      if (window.__hzApplyFilters) window.__hzApplyFilters();
    }

    // input 事件在拖动中高频触发，用 rAF 合帧，避免每个像素位移都重排一次列表
    let raf = null;
    function schedulePaint() {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        paint();
      });
    }

    slider.addEventListener('input', schedulePaint);
    slider.addEventListener('change', paint);

    /* 按住 / 松手：给拇指和轨道一个明确的「正在操作」状态 */
    function press() { wrap.classList.add('is-dragging'); }
    function release() { wrap.classList.remove('is-dragging'); }
    slider.addEventListener('pointerdown', press);
    slider.addEventListener('pointerup', release);
    slider.addEventListener('pointercancel', release);
    slider.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' || e.key === 'ArrowDown') press();
    });
    slider.addEventListener('keyup', release);
    slider.addEventListener('blur', release);

    paint();
  }

  /* ------------------------------------------------------------------
     Sidebar category buttons (attractions)
     A one-click category jump that replaces the type group's selection.
     ------------------------------------------------------------------ */
  function initSidebarFilter() {
    const buttons = document.querySelectorAll('[data-sidebar-filter]');
    if (!buttons.length || !window.__hzSetGroup) return;

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const value = btn.getAttribute('data-sidebar-filter');
        buttons.forEach(function (b) { b.removeAttribute('aria-current'); });
        btn.setAttribute('aria-current', 'true');
        window.__hzSetGroup('type', value === 'all' ? [] : [value]);
      });
    });
  }

  /* ------------------------------------------------------------------
     Sort control
     ------------------------------------------------------------------ */
  function initSort() {
    const select = document.querySelector('[data-sort]');
    if (!select) return;
    const list = document.querySelector('[data-sort-target]');
    if (!list) return;

    select.addEventListener('change', function () {
      const mode = select.value;
      const items = Array.prototype.slice.call(list.children);
      items.sort(function (a, b) {
        const read = function (el, attr, fallback) {
          const v = parseFloat(el.getAttribute(attr));
          return isNaN(v) ? fallback : v;
        };
        if (mode === 'price-asc') return read(a, 'data-price', 1e9) - read(b, 'data-price', 1e9);
        if (mode === 'price-desc') return read(b, 'data-price', -1) - read(a, 'data-price', -1);
        if (mode === 'rating') return read(b, 'data-rating', 0) - read(a, 'data-rating', 0);
        return read(a, 'data-order', 0) - read(b, 'data-order', 0);
      });
      items.forEach(function (i) { list.appendChild(i); });
      toast('已按' + (select.options[select.selectedIndex].text) + '排序', { icon: '↕' });
    });
  }

  /* ------------------------------------------------------------------
     List / map view toggle (stays page)
     Markup:
       <div class="segmented" data-view-mode>
         <button data-view="list|map">
       <div class="stays-layout" data-view-layout>
       <div data-view-panel="list|map">
     The chosen mode is remembered so a returning guest is not reset.
     ------------------------------------------------------------------ */
  function initViewMode() {
    const toggle = document.querySelector('[data-view-mode]');
    if (!toggle) return;
    const layout = document.querySelector('[data-view-layout]');
    const panels = document.querySelectorAll('[data-view-panel]');
    if (!layout || !panels.length) return;

    function setMode(mode, persist) {
      layout.classList.toggle('is-map-mode', mode === 'map');
      panels.forEach(function (p) {
        p.hidden = p.getAttribute('data-view-panel') !== mode;
      });
      toggle.querySelectorAll('[data-view]').forEach(function (b) {
        const on = b.getAttribute('data-view') === mode;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (persist) {
        try { localStorage.setItem('hz-view-mode', mode); } catch (e) { /* ignore */ }
      }
    }

    let saved = null;
    try { saved = localStorage.getItem('hz-view-mode'); } catch (e) { /* ignore */ }
    setMode(saved === 'map' ? 'map' : 'list', false);

    toggle.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-view]');
      if (!btn) return;
      setMode(btn.getAttribute('data-view'), true);
    });
  }

  /* ------------------------------------------------------------------
     Map pin -> reveal + highlight the matching list row
     ------------------------------------------------------------------ */
  function initMapPins() {
    const pins = document.querySelectorAll('.map-pin');
    if (!pins.length) return;
    pins.forEach(function (pin) {
      pin.addEventListener('click', function () {
        const id = pin.getAttribute('data-map-target');
        pins.forEach(function (p) {
          p.setAttribute('aria-pressed', p === pin ? 'true' : 'false');
        });
        const row = id ? document.getElementById(id) : null;
        if (row) {
          const M = window.HZMotion;
          if (M) {
            M.scrollToEl(row, { block: 'center' });
            M.once(row, 'is-targeted', 1800);   // 播完自动摘类，不留内联样式
          } else {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else {
          toast('该住宿暂无列表条目，请切换到列表模式查看', { icon: '📍' });
        }
      });
    });
  }

  /* ------------------------------------------------------------------
     Detail drawer (experiences) — content injected from data attributes
     ------------------------------------------------------------------ */
  function initDetailDrawer() {
    const drawer = document.getElementById('detailDrawer');
    if (!drawer) return;
    const ctrl = initDrawer(drawer);
    const mount = drawer.querySelector('[data-detail-mount]');
    if (!mount) return;

    document.addEventListener('click', function (e) {
      const trigger = e.target.closest('[data-detail]');
      if (!trigger) return;
      e.preventDefault();
      const d = trigger.dataset;

      // 换内容前先给旧内容里的动画收尾，避免残留动画挂在新 DOM 上
      if (window.HZMotion) window.HZMotion.destroyWithin(mount);

      mount.innerHTML =
        '<div class="detail-drawer__hero">' +
          '<img src="' + (d.image || '') + '" alt="' + (d.title || '') + '">' +
          '<button class="detail-drawer__close" type="button" data-drawer-close aria-label="关闭">✕</button>' +
          '<span class="detail-drawer__play" aria-hidden="true">▶</span>' +
        '</div>' +
        '<div class="detail-drawer__body">' +
          '<div>' +
            '<h2 class="modal__title" id="detailTitle">' + (d.title || '') + '</h2>' +
            '<p class="card__text" style="margin-top:8px;-webkit-line-clamp:unset">' + (d.desc || '') + '</p>' +
          '</div>' +
          '<dl class="detail-drawer__facts">' +
            '<div class="detail-drawer__fact"><dt>体验时长</dt><dd>' + (d.duration || '—') + '</dd></div>' +
            '<div class="detail-drawer__fact"><dt>适合人数</dt><dd>' + (d.people || '—') + '</dd></div>' +
            '<div class="detail-drawer__fact"><dt>用户评分</dt><dd>' + (d.rating || '—') + '</dd></div>' +
          '</dl>' +
          '<div><p class="detail-drawer__section-title">包含项目</p><ul class="checklist">' +
            (d.includes || '').split('|').filter(Boolean).map(function (x) {
              return '<li class="checklist__item"><span class="checklist__mark checklist__mark--yes" aria-hidden="true">✓</span>' + x.trim() + '</li>';
            }).join('') +
          '</ul></div>' +
          '<div><p class="detail-drawer__section-title">不包含</p><ul class="checklist">' +
            (d.excludes || '').split('|').filter(Boolean).map(function (x) {
              return '<li class="checklist__item"><span class="checklist__mark checklist__mark--no" aria-hidden="true">✕</span>' + x.trim() + '</li>';
            }).join('') +
          '</ul></div>' +
          '<div class="callout"><span class="callout__icon" aria-hidden="true">ℹ</span><div>' +
            '<p class="callout__title">预约须知</p>' +
            '<p class="callout__text">' + (d.notice || '建议提前 1 天电话预约，节假日请提前 3 天。') + '</p>' +
          '</div></div>' +
        '</div>' +
        '<div class="detail-drawer__foot">' +
          '<div class="detail-drawer__price">' +
            '<div class="price price--lg"><span class="price__value">预约制</span></div>' +
            '<p class="detail-drawer__suggest">建议价 ¥' + (d.price || '—') + '（由经营者实际定价）</p>' +
          '</div>' +
          '<button class="btn btn--primary" type="button" data-book="' + (d.title || '') + '">了解详情</button>' +
        '</div>';

      // Newly injected close buttons need wiring
      mount.querySelectorAll('[data-drawer-close]').forEach(function (c) {
        c.addEventListener('click', function () { ctrl.close(); });
      });
      mount.querySelectorAll('[data-book]').forEach(function (b) {
        b.addEventListener('click', function () {
          ctrl.close();
          toast('已记录你的关注：' + b.getAttribute('data-book') + '，可拨 2423085 了解开放情况', { icon: '✓' });
        });
      });

      ctrl.open();
      const body = mount.querySelector('.detail-drawer__body');
      if (body && window.HZMotion) {
        window.HZMotion.once(body, 'm-fade-up', 420);
      }
      const title = mount.querySelector('#detailTitle');
      if (title) title.focus();
    });
  }

  /* ------------------------------------------------------------------
     Guide detail · TOC scroll-spy + engagement buttons
     ------------------------------------------------------------------ */
  function initArticle() {
    const tocLinks = document.querySelectorAll('.toc__link');
    if (tocLinks.length && 'IntersectionObserver' in window) {
      const map = {};
      tocLinks.forEach(function (link) {
        const id = link.getAttribute('href').replace('#', '');
        const section = document.getElementById(id);
        if (section) map[id] = link;
      });
      const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          const link = map[entry.target.id];
          if (!link) return;
          if (entry.isIntersecting) {
            tocLinks.forEach(function (l) { l.classList.remove('is-active'); });
            link.classList.add('is-active');
          }
        });
      }, { rootMargin: '-20% 0px -70% 0px' });
      Object.keys(map).forEach(function (id) {
        observer.observe(document.getElementById(id));
      });
    }

    // Like / save toggles
    document.querySelectorAll('[data-toggle-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const pressed = btn.getAttribute('aria-pressed') === 'true';
        btn.setAttribute('aria-pressed', pressed ? 'false' : 'true');
        const counter = btn.querySelector('.action-pill__count');
        if (counter) {
          const n = parseInt(counter.textContent, 10) || 0;
          counter.textContent = pressed ? Math.max(0, n - 1) : n + 1;
        }
        toast(pressed ? '已取消' : '已' + btn.getAttribute('data-toggle-action'),
          { icon: pressed ? '↩' : '✓' });
      });
    });

    // Share —— 统一走 share.js：原生面板优先，不支持则复制链接
    document.querySelectorAll('[data-share]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const S = window.HZShare;
        const M = window.HZMotion;
        if (!S) { toast('转发模块未加载', { icon: '⚠' }); return; }

        if (M) M.busy(btn, true);
        const settle = function () { if (M) M.busy(btn, false); };

        const prefix = (window.HZ_SITE && window.HZ_SITE.share && window.HZ_SITE.share.textPrefix) || '';
        S.share({
          title: document.title,
          text: prefix + '一篇黄磜镇的攻略',
          url: window.location.href
        }).then(function (res) {
          settle();
          if (res.cancelled) return;
          if (res.channel === 'native') toast('已打开分享面板', { icon: '🚀' });
          else if (res.channel === 'clipboard') toast('链接已复制，可粘贴分享', { icon: '🔗' });
          else toast('分享失败，请手动复制地址栏链接', { icon: '⚠', variant: 'error' });
        });
      });
    });

    // Comment form
    const form = document.querySelector('[data-comment-form]');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const input = form.querySelector('textarea, input');
        const value = input ? input.value.trim() : '';
        if (!value) { toast('请先写下你的评论', { icon: '⚠' }); return; }
        const list = document.querySelector('[data-comment-list]');
        if (list) {
          const el = document.createElement('article');
          el.className = 'comment';
          el.innerHTML =
            '<div class="avatar avatar--sm" aria-hidden="true">我</div>' +
            '<div class="comment__body">' +
              '<div class="comment__head"><span class="comment__author">我</span>' +
              '<span>刚刚</span></div>' +
              '<p class="comment__text"></p>' +
            '</div>';
          el.querySelector('.comment__text').textContent = value;
          list.insertBefore(el, list.firstChild);
          const M = window.HZMotion;
          if (M) M.enter(el, 'm-fade-up', { duration: 360 });   // 新评论入场
        }
        input.value = '';
        toast('评论已发布', { icon: '💬' });
      });
    }
  }

  /* ------------------------------------------------------------------
     Copy promotion-code / download buttons
     ------------------------------------------------------------------ */
  function initCopy() {
    document.querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const text = btn.getAttribute('data-copy');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(function () {
            toast('已复制：' + text, { icon: '📋' });
          }).catch(function () { toast('复制失败', { icon: '⚠' }); });
        }
      });
    });
  }

  /* ------------------------------------------------------------------
     Current year in footers
     ------------------------------------------------------------------ */
  function initYear() {
    document.querySelectorAll('[data-year]').forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  function boot() {
    initTheme();
    initNavbar();
    initDrawers();
    initReveal();
    initToTop();
    initHero();
    initFilters();
    initFilterSelects();
    initPriceRange();
    initSidebarFilter();
    initSort();
    initViewMode();
    initMapPins();
    initDetailDrawer();
    initArticle();
    initCopy();
    initYear();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.HZ = { toast: toast, applyTheme: applyTheme };
})();
