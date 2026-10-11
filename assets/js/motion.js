/* ==========================================================================
   motion.js · 全站动效运行时（零依赖）
   --------------------------------------------------------------------------
   配合 assets/css/motion.css 使用，负责四件事：

     A. 档位决策   —— 探测设备能力 + 实时帧率，把 high / low / off 写到
                     <html data-motion-tier>；CSS 据此压缩时长、关闭装饰动画。
     B. 动画调度   —— 所有「播一次就结束」的动画都走 once/enter/exit：
                     重复触发只重置不叠加，播完自动摘类，元素销毁前先收尾。
     C. 滚动入场   —— 单一共享 IntersectionObserver，命中即注销（不会重复触发），
                     同批元素按 --m-stagger 依次出场。
     D. 反馈原语   —— toast 队列、按钮按压、busy 加载态、平滑滚动。

   对外：window.HZMotion
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ======================================================================
     1 · 偏好与档位
     ====================================================================== */

  var mqReduce = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  var mqCoarse = window.matchMedia
    ? window.matchMedia('(pointer: coarse)')
    : { matches: false };

  var TIER = 'high';
  var listeners = { tier: [], reduced: [] };

  function emit(name, value) {
    var list = listeners[name] || [];
    for (var i = 0; i < list.length; i++) {
      try { list[i](value); } catch (e) { /* 单个订阅者出错不影响其他 */ }
    }
  }

  function reduced() {
    return !!(mqReduce && mqReduce.matches);
  }

  function staticTier() {
    if (reduced()) return 'off';

    var nav = navigator || {};
    var cores = nav.hardwareConcurrency || 4;
    var mem = nav.deviceMemory || (mqCoarse.matches ? 4 : 8);
    var conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    var saveData = conn && conn.saveData;
    var slowNet = conn && /(^|\W)(2g|slow-2g)(\W|$)/i.test(conn.effectiveType || '');

    if (saveData || slowNet) return 'low';
    if (cores <= 4 || mem <= 4) return 'low';
    if (mqCoarse.matches && (cores <= 6 || mem <= 6)) return 'low';
    return 'high';
  }

  function setTier(next) {
    if (next === TIER) return;
    TIER = next;
    root.setAttribute('data-motion-tier', TIER);
    emit('tier', TIER);
  }

  function tier() { return TIER; }

  /* 实时帧率探测：高档位下若持续掉帧，自动降到 low。
     放在 load 之后跑，避开首屏解析与图片解码造成的假性掉帧。 */
  function probeFps() {
    if (TIER !== 'high') return;
    var SAMPLES = 48;
    var frames = 0;
    var slow = 0;
    var start = 0;
    var last = 0;

    function tick(now) {
      if (!start) { start = now; last = now; requestAnimationFrame(tick); return; }
      var dt = now - last;
      last = now;
      frames++;
      if (dt > 34) slow++;   // 低于 30fps 的帧
      if (frames < SAMPLES) { requestAnimationFrame(tick); return; }

      var fps = frames / ((now - start) / 1000);
      if (fps < 45 || slow > SAMPLES * 0.3) setTier('low');
    }
    requestAnimationFrame(tick);
  }

  function watchPreference() {
    if (!mqReduce.addEventListener && !mqReduce.addListener) return;
    var handler = function () {
      setTier(reduced() ? 'off' : staticTier());
      emit('reduced', reduced());
    };
    if (mqReduce.addEventListener) mqReduce.addEventListener('change', handler);
    else mqReduce.addListener(handler);
  }

  /* ======================================================================
     2 · 帧调度
     ====================================================================== */

  function nextFrame(cb) {
    requestAnimationFrame(function () { requestAnimationFrame(cb); });
  }

  /* 合帧器：高频事件（scroll / input）里只让最后一次进帧 */
  function coalesce(fn) {
    var pending = false;
    var lastArgs = null;
    return function () {
      lastArgs = arguments;
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        fn.apply(null, lastArgs);
      });
    };
  }

  /* ======================================================================
     3 · 动画调度：防叠加 + 自动收尾 + 销毁前清理
     ====================================================================== */

  var live = [];   // 正在播动画的元素，供 destroyWithin 收尾

  function state(el) {
    if (!el.__hzMotion) {
      el.__hzMotion = {};
      if (live.indexOf(el) < 0) live.push(el);
    }
    return el.__hzMotion;
  }

  function prune(el) {
    var i = live.indexOf(el);
    if (i >= 0) live.splice(i, 1);
  }

  /* 播一次动画。已在播 → 重置重播（绝不叠加）；播完自动摘类。
     dur 为兜底时长（ms），浏览器支持 animationend 时以事件为准。 */
  function once(el, cls, dur, done) {
    if (!el) { if (done) done(); return; }
    if (reduced() || TIER === 'off') { if (done) done(); return; }

    var st = state(el);
    var key = 'k_' + cls;

    if (st[key]) kill(el, key);

    var rec = { timer: 0, onEnd: null, done: done || null };
    st[key] = rec;

    void el.offsetWidth;              // 强制重排，保证同一帧内可重播
    el.classList.add(cls);

    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(rec.timer);
      if (rec.onEnd) el.removeEventListener('animationend', rec.onEnd);
      if (el.classList) el.classList.remove(cls);
      st[key] = null;
      /* 这个元素上再没有在播的动画 → 从活动表里摘掉，避免 live 无限增长 */
      var busy2 = Object.keys(st).some(function (k) {
        return k.indexOf('k_') === 0 && st[k];
      });
      if (!busy2) prune(el);
      var cb = rec.done;
      rec.done = null;
      if (cb) { try { cb(); } catch (e) { /* ignore */ } }
    }

    rec.onEnd = function (e) {
      if (e.target !== el) return;    // 子元素的动画不算数
      finish();
    };
    el.addEventListener('animationend', rec.onEnd);
    rec.timer = setTimeout(finish, (dur || 500) + 140);
  }

  function kill(el, key) {
    var st = el.__hzMotion;
    var rec = st && st[key];
    if (!rec) return;
    clearTimeout(rec.timer);
    if (rec.onEnd) el.removeEventListener('animationend', rec.onEnd);
    st[key] = null;
  }

  /* 入场：带可选延迟（用于交错） */
  function enter(el, cls, opts, done) {
    if (!el) { if (done) done(); return; }
    var o = opts || {};
    var c = cls || 'm-fade-up';
    if (o.delay) el.style.setProperty('--m-delay', o.delay + 'ms');
    once(el, c, o.duration || 500, function () {
      el.style.removeProperty('--m-delay');
      if (done) done();
    });
  }

  /* 出场收尾：播完再回调，调用方在回调里移除元素 */
  function exit(el, done, cls) {
    if (!el) { if (done) done(); return; }
    once(el, cls || 'm-exiting', 260, done);
  }

  /* 单个元素：清掉所有在播动画与残留类 */
  function destroy(el) {
    if (!el || !el.__hzMotion) return;
    var st = el.__hzMotion;
    Object.keys(st).forEach(function (k) {
      if (k.indexOf('k_') === 0) kill(el, k);
    });
    var junk = ['m-fade-up', 'm-fade-in', 'm-pop-in', 'm-pop-out',
      'm-exiting', 'm-bump', 'm-pulse', 'm-highlight', 'is-pressed', 'is-entering'];
    junk.forEach(function (c) { el.classList.remove(c); });
    el.__hzMotion = null;
    prune(el);
  }

  /* 容器重渲染前调用：先给里面的动画收尾，避免出现「半截动画 + 新 DOM」 */
  function destroyWithin(rootEl) {
    if (!rootEl) return;
    for (var i = live.length - 1; i >= 0; i--) {
      if (rootEl.contains(live[i])) destroy(live[i]);
    }
  }

  /* 批量交错入场 */
  function stagger(list, cls, opts) {
    var o = opts || {};
    var step = typeof o.step === 'number' ? o.step : 34;
    var max = typeof o.max === 'number' ? o.max : 8;
    var base = o.base || 0;
    var scale = TIER === 'low' ? 0 : 1;

    Array.prototype.forEach.call(list, function (el, i) {
      var d = base + Math.min(i, max) * step * scale;
      if (!d) { enter(el, cls, null); return; }
      setTimeout(function () { enter(el, cls, null); }, d);
    });
  }

  /* ======================================================================
     4 · 交互反馈原语
     ====================================================================== */

  function press(el) {
    if (!el || reduced() || TIER === 'off') return;
    clearTimeout(el.__hzPress);
    el.classList.add('is-pressed');
    el.__hzPress = setTimeout(function () {
      el.classList.remove('is-pressed');
    }, 140);
  }

  /* busy：按钮加载态。.btn 走既有 is-loading，其余元素挂 data-busy */
  function busy(el, on) {
    if (!el) return;
    if (on) {
      if (el.classList.contains('btn')) el.classList.add('is-loading');
      else el.setAttribute('data-busy', '1');
      el.setAttribute('aria-busy', 'true');
    } else {
      el.classList.remove('is-loading');
      el.removeAttribute('data-busy');
      el.removeAttribute('aria-busy');
    }
  }

  function scrollToEl(el, opts) {
    if (!el || typeof el.scrollIntoView !== 'function') return;
    var o = opts || {};
    var behavior = (reduced() || TIER === 'off') ? 'auto' : 'smooth';
    try {
      el.scrollIntoView({ behavior: behavior, block: o.block || 'center' });
    } catch (e) {
      try { el.scrollIntoView(); } catch (e2) { /* 环境不支持滚动定位：忽略 */ }
    }
  }

  /* ======================================================================
     5 · 滚动入场（共享观察器）
     ====================================================================== */

  var io = null;

  function ensureIO() {
    if (io || !('IntersectionObserver' in window)) return io;
    io = new IntersectionObserver(function (entries) {
      var batch = [];
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        batch.push(entry.target);
        io.unobserve(entry.target);     // 命中即注销：杜绝重复触发
      });
      if (!batch.length) return;

      batch.sort(function (a, b) {
        return (a.getBoundingClientRect().top) - (b.getBoundingClientRect().top);
      });

      batch.forEach(function (el, i) {
        var base = parseInt(el.getAttribute('data-reveal-delay') || '0', 10) || 0;
        var idx = TIER === 'low' ? 0 : Math.min(i, 8);
        el.style.setProperty('--m-reveal-delay',
          'calc(' + base + 'ms + var(--m-stagger) * ' + idx + ')');
        nextFrame(function () { el.classList.add('is-visible'); });
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    return io;
  }

  function reveal(scope) {
    var targets = (scope || document).querySelectorAll('[data-reveal]');
    if (!targets.length) return;

    if (reduced() || TIER === 'off' || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(targets, function (t) {
        t.style.setProperty('--m-reveal-delay', '0ms');
        t.classList.add('is-visible');
      });
      return;
    }

    var obs = ensureIO();
    if (!obs) {
      Array.prototype.forEach.call(targets, function (t) { t.classList.add('is-visible'); });
      return;
    }
    Array.prototype.forEach.call(targets, function (t) { obs.observe(t); });
  }

  /* ======================================================================
     6 · Toast（统一队列 + 统一出入场）
     ====================================================================== */

  var toastStack = null;

  function ensureStack() {
    if (toastStack && document.body.contains(toastStack)) return toastStack;
    toastStack = document.createElement('div');
    toastStack.className = 'toast-stack';
    toastStack.setAttribute('role', 'status');
    toastStack.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastStack);
    return toastStack;
  }

  function dismissToast(el, immediate) {
    if (!el || el.__hzDismissed) return;
    el.__hzDismissed = true;
    clearTimeout(el.__hzTimer);
    if (immediate || !document.body.contains(el)) {
      if (el.parentNode) el.parentNode.removeChild(el);
      return;
    }
    el.classList.add('is-leaving');
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 260);
  }

  function toast(message, options) {
    var opts = options || {};
    var stack = ensureStack();

    // 同屏最多 3 条，超出的先送走，避免堆叠溢出小屏
    while (stack.children.length >= 3) dismissToast(stack.children[0], true);

    var el = document.createElement('div');
    el.className = 'toast';
    if (opts.variant) el.classList.add('toast--' + opts.variant);

    if (opts.icon) {
      var icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = opts.icon;
      el.appendChild(icon);
    }
    var text = document.createElement('span');
    text.textContent = message;
    el.appendChild(text);

    stack.appendChild(el);

    var dur = opts.duration ||
      Math.min(4200, Math.max(2200, String(message).length * 120 + 1200));
    el.__hzTimer = setTimeout(function () { dismissToast(el); }, dur);
    return el;
  }

  /* ======================================================================
     7 · 启动
     ====================================================================== */

  function boot() {
    setTier(staticTier());
    root.setAttribute('data-motion-tier', TIER);
    watchPreference();
    reveal();

    window.addEventListener('load', function () {
      setTimeout(probeFps, 1500);
    }, { once: true });

    /* 页面隐藏时停掉装饰动画的开销：给根节点挂一个开关，CSS 可据此暂停 */
    document.addEventListener('visibilitychange', function () {
      root.setAttribute('data-motion-hidden', document.hidden ? '1' : '0');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* ======================================================================
     8 · 对外接口
     ====================================================================== */

  window.HZMotion = {
    tier: tier,
    reduced: reduced,
    on: function (name, cb) {
      if (!listeners[name]) listeners[name] = [];
      listeners[name].push(cb);
    },
    once: once,
    enter: enter,
    exit: exit,
    press: press,
    busy: busy,
    stagger: stagger,
    destroy: destroy,
    destroyWithin: destroyWithin,
    reveal: reveal,
    toast: toast,
    dismissToast: dismissToast,
    scrollToEl: scrollToEl,
    nextFrame: nextFrame,
    coalesce: coalesce
  };
})();
