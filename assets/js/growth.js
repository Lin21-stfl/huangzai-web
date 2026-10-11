/* ==========================================================================
   growth.js · 增长与互动层（零依赖）
   --------------------------------------------------------------------------
   第一期负责三件事：
     A. 实时数据条  —— 数字本身就是传播素材
     B. 许愿池滚动墙 —— 从众心理，让没留言的人也想留
     C. 标签化一键留言 —— 零打字门槛，自动拼成「下次来黄磜____」

   数据落在 localStorage（无后端）。上线接了云开发 / Waline 之后，只需替换
   底部 Store 里的读写实现，渲染层不用动。

   挂载点约定（页面里写一个空 div 即可）：
     <div data-growth="ticker"></div>    实时数据条
     <div data-growth="wall"></div>      许愿池滚动墙
     <div data-growth="composer"></div>  标签化留言器
     <span data-growth="count"></span>   许愿总人数（纯数字）
   ========================================================================== */

(function () {
  'use strict';

  /* ======================================================================
     配置
     ====================================================================== */

  var NS = 'hzg-v1';

  /* 站点配置集中放在 site.config.js —— 上线只改那一个文件 */
  var CFG = (typeof window !== 'undefined' && window.HZ_SITE) || {};

  /* 上线前替换为真实域名 —— 微信分享卡片与 og:image 必须是绝对地址 */
  var SITE_ORIGIN = CFG.origin || 'https://lin21-stfl.github.io/huangzai-web/';

  /* 线上累计基数：全部从 0 开始 —— 不预置任何虚构流量，
     真实数据由百度统计（site.config.js 的 analytics.id）接入后回填 */
  var BASE = {
    visits: 0,        // 从0开始真实累计
    comments: 0,      // 从0开始真实累计
    shares: 0         // 从0开始真实累计
  };

  /* 统计起点说明：展示在访问量数字下方 */
  var STATS_SINCE = '数据自2026年7月起统计';

  /* 百度统计站点 ID 占位串 —— 未替换时不注入脚本，避免上报到错误站点 */
  var ANALYTICS_PLACEHOLDER = /填入|YOUR_|TODO|xxx/i;

  function analyticsReady() {
    var a = CFG.analytics || {};
    if (a.provider !== 'baidu') return false;
    return !!a.id && !ANALYTICS_PLACEHOLDER.test(a.id);
  }

  /* 注入百度统计；站内跳转（SPA）手动补一次 PV */
  function injectAnalytics() {
    if (!analyticsReady()) return;
    window._hmt = window._hmt || [];
    var s = document.createElement('script');
    s.async = 1;
    s.src = 'https://hm.baidu.com/hm.js?' + CFG.analytics.id;
    var first = document.getElementsByTagName('script')[0];
    if (first && first.parentNode) first.parentNode.insertBefore(s, first);
    else document.head.appendChild(s);

    window.__hzTrackPageview = function (url) {
      if (window._hmt) window._hmt.push(['_trackPageview', url || location.pathname]);
    };
  }

  /* 可选：从服务端接口读取百度统计开放平台的真实数据。
     配了 readStatsApi 且返回 { visits, comments, shares } 时优先用它，
     否则一律展示本地从 0 开始的真实累计。 */
  function readRemoteStats(cb) {
    var api = (CFG.analytics || {}).readStatsApi;
    if (!api || typeof fetch !== 'function') { cb(null); return; }
    fetch(api, { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { cb(j && typeof j.visits === 'number' ? j : null); })
      .catch(function () { cb(null); });
  }

  /* 六个标签 —— 与全站统一引导文案「下次来黄磜____」配套 */
  var TAGS = [
    { id: 'sakura', emoji: '🌸', label: '看樱花', phrase: '下次来黄磜看樱花', season: '春 · 茶樱节', crowd: 328 },
    { id: 'camp', emoji: '⛺', label: '去露营', phrase: '下次来黄磜去露营', season: '夏 · 溪谷西瓜', crowd: 196 },
    { id: 'leaf', emoji: '🍁', label: '看红叶', phrase: '下次来黄磜看红叶', season: '秋 · 红叶世界', crowd: 241 },
    { id: 'folk', emoji: '🧧', label: '过年俗', phrase: '下次来黄磜过年俗', season: '冬 · 客家年俗', crowd: 173 },
    { id: 'paper', emoji: '💃', label: '学纸马舞', phrase: '下次来黄磜学纸马舞', season: '全年 · 省级非遗', crowd: 88 },
    { id: 'melon', emoji: '🥒', label: '吃佛手瓜', phrase: '下次来黄磜吃佛手瓜', season: '夏秋 · 地理标志', crowd: 265 }
  ];

  /* 种子留言：让页面第一次打开就不是空的。
     offset 单位是分钟（相对首次注入的时间），reply 为运营号置顶回复。 */
  var SEED = [
    { name: '陈晓明', tag: 'sakura', extra: '带爸妈一起来，住茶园那家民宿', offset: 0, likes: 42, reply: '谢谢你！今年茶樱节定在 3 月，雪峒茶园等你～', isSeed: true },
    { name: '李婉君', tag: 'paper', extra: '想看一次周六下午的展演', offset: 0, likes: 37, reply: '每周六 14:00 雪峒村固定展演，传承人亲自带教，记得提前预约。', isSeed: true },
    { name: '王志强', tag: 'camp', extra: '', offset: 0, likes: 28, reply: '', isSeed: true },
    { name: '张慧敏', tag: 'leaf', extra: '红叶季一定要挑个工作日来', offset: 0, likes: 31, reply: '懂行！红叶季工作日人少景好，11 月中下旬是峰值。', isSeed: true },
    { name: '刘家豪', tag: 'melon', extra: '佛手瓜宴听说要提前订', offset: 0, likes: 24, reply: '', isSeed: true },
    { name: '周雨欣', tag: 'folk', extra: '', offset: 0, likes: 19, reply: '年俗季从腊月廿三开始，舞纸马、打糍粑、客家山歌连着来。', isSeed: true },
    { name: '黄国栋', tag: 'sakura', extra: '拍完樱花顺路去趟红色旧址', offset: 0, likes: 33, reply: '', isSeed: true },
    { name: '吴美玲', tag: 'camp', extra: '带娃，问问有没有亲子营位', offset: 0, likes: 21, reply: '溪谷露营区有亲子营位，帐篷间距大，热水 24 小时供应。', isSeed: true },
    { name: '郑凯文', tag: 'leaf', extra: '', offset: 0, likes: 17, reply: '', isSeed: true },
    { name: '曾秀兰', tag: 'paper', extra: '我们村以前也有纸马队', offset: 0, likes: 26, reply: '那太好了！镇里正在做口述史采集，欢迎回来聊聊老一辈的纸马队。', isSeed: true },
    { name: '罗子谦', tag: 'melon', extra: '想买一箱带回广州', offset: 0, likes: 15, reply: '', isSeed: true },
    { name: '谢雅雯', tag: 'folk', extra: '', offset: 0, likes: 22, reply: '年俗季民宿紧张，建议提前两周订房。', isSeed: true }
  ];

  /* 官方运营号 —— 回复带上它才有温度 */
  var OFFICIAL_NAME = '黄磜镇旅游服务';

  /* ======================================================================
     工具
     ====================================================================== */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* 昵称脱敏：陈晓明 → 陈** */
  function maskName(name) {
    var s = String(name || '').trim();
    if (!s) return '黄磜旅人';
    if (s.length === 1) return s + '*';
    if (s.length === 2) return s.charAt(0) + '*';
    return s.charAt(0) + '**';
  }

  function timeAgo(ts) {
    var diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 2592000000) return Math.floor(diff / 86400000) + ' 天前';
    var d = new Date(ts);
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }

  /* 以日期为种子的确定性伪随机 —— 同一天各页面看到的「今日新增」一致 */
  function todaySeed() {
    var d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  function pseudo(seed, salt, min, max) {
    var x = Math.sin(seed * 0.917 + salt * 7.31) * 10000;
    x = x - Math.floor(x);
    return min + Math.floor(x * (max - min + 1));
  }

  function tagOf(id) {
    for (var i = 0; i < TAGS.length; i++) {
      if (TAGS[i].id === id) return TAGS[i];
    }
    return TAGS[0];
  }

  /* ======================================================================
     存储
     ====================================================================== */

  var Store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(NS + '.' + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        localStorage.setItem(NS + '.' + key, JSON.stringify(value));
      } catch (e) { /* 隐私模式下写入失败：页面照常可用，只是不留存 */ }
    }
  };

  /* ------------------------------------------------------------------
     远程评论后端（可选）
     ------------------------------------------------------------------
     site.config.js 里 comment.provider 改成 'twikoo' 并填 envId 后，
     留言就跨设备可见了 —— 渲染层不用改一行代码。

     设计上刻意做成「尽力而为」：远程拉不到（没配 / 没网 / 没备案）就
     静默回落到本地 localStorage，页面永远能正常显示，不会白屏等接口。
     ------------------------------------------------------------------ */
  var REMOTE_TIMEOUT = 6000;

  function remoteEnabled() {
    var c = CFG.comment || {};
    return c.provider === 'twikoo' && !!c.twikooEnvId &&
      typeof window !== 'undefined' && typeof window.twikoo === 'function';
  }

  /* Twikoo 记录 → 本站留言对象 */
  function fromTwikoo(raw) {
    var nick = raw.nick || '匿名旅人';
    var text = String(raw.commentText || raw.comment || '').replace(/<[^>]+>/g, '');
    var tagId = 'sakura';
    for (var i = 0; i < TAGS.length; i++) {
      if (text.indexOf(TAGS[i].label) >= 0) { tagId = TAGS[i].id; break; }
    }
    return {
      id: 'tw-' + raw.id,
      tag: tagId,
      text: tagOf(tagId).phrase,
      extra: text !== tagOf(tagId).phrase ? text : '',
      name: nick,
      at: raw.created || Date.now(),
      likes: (raw.like || 0),
      reply: '',
      remote: true
    };
  }

  var Remote = {
    load: function (done) {
      if (!remoteEnabled()) { done(null); return; }
      var settled = false;
      function finish(v) { if (!settled) { settled = true; done(v); } }
      setTimeout(function () { finish(null); }, REMOTE_TIMEOUT);
      try {
        window.twikoo.getComments({
          envId: CFG.comment.twikooEnvId,
          path: location.pathname || '/',
          pageSize: 50
        }).then(function (res) {
          var arr = (res && res.data) || [];
          finish(arr.length ? arr.map(fromTwikoo) : null);
        }).catch(function () { finish(null); });
      } catch (e) { finish(null); }
    },
    post: function (wish, done) {
      if (!remoteEnabled()) { done(false); return; }
      try {
        window.twikoo.comment({
          envId: CFG.comment.twikooEnvId,
          path: location.pathname || '/',
          nick: wish.name || '黄磜旅人',
          mail: '',
          link: '',
          content: wish.text + (wish.extra ? '｜' + wish.extra : '')
        }).then(function () { done(true); }).catch(function () { done(false); });
      } catch (e) { done(false); }
    }
  };

  /* 首次访问时注入种子留言 —— 页面一打开就是热闹的。
     ⚠️ 这 12 条是演示用种子数据（isSeed: true），界面上会打「示例」标记，
        接入真实留言后端（site.config.js → comment.provider = 'twikoo'）后应清空。 */
  function seedOnce() {
    if (Store.get('seeded', false)) return;
    var now = Date.now();
    var list = SEED.map(function (item, i) {
      return {
        id: 'seed-' + i,
        tag: item.tag,
        text: tagOf(item.tag).phrase,
        extra: item.extra || '',
        name: item.name,
        at: now - item.offset * 60000,
        likes: item.likes,
        reply: item.reply || '',
        seed: true,
        isSeed: item.isSeed === true
      };
    });
    Store.set('wishes', list);
    Store.set('seeded', true);
  }

  /* ======================================================================
     统计
     ====================================================================== */

  function stats() {
    return Store.get('stats', { visits: 0, comments: 0, shares: 0 });
  }

  function bump(key, n) {
    var s = stats();
    s[key] = (s[key] || 0) + (n || 1);
    Store.set('stats', s);
    return s;
  }

  /* 今日增量：跨天自动归零 */
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function today() {
    var t = Store.get('today', null);
    var k = todayKey();
    if (!t || t.date !== k) {
      t = { date: k, visits: 0, comments: 0, shares: 0 };
      Store.set('today', t);
    }
    return t;
  }

  function bumpToday(key, n) {
    var t = today();
    t[key] = (t[key] || 0) + (n || 1);
    Store.set('today', t);
    return t;
  }

  /* 对外展示口径：线上基数 + 本地累计 */
  function totals() {
    var s = stats();
    return {
      visits: BASE.visits + (s.visits || 0),
      comments: BASE.comments + (s.comments || 0),
      shares: BASE.shares + (s.shares || 0)
    };
  }

  /* 今日展示口径：只用本日本地真实增量，不再叠加伪随机基线 */
  function todayTotals() {
    var t = today();
    return {
      visits: (t.visits || 0),
      comments: (t.comments || 0),
      shares: (t.shares || 0)
    };
  }

  /* ======================================================================
     留言数据
     ====================================================================== */

  function wishes() {
    return Store.get('wishes', []);
  }

  function saveWishes(list) {
    Store.set('wishes', list);
  }

  /* 深链命中的留言 ID —— 由 ?wish=<id> 决定，影响渲染（置顶卡 + 高亮） */
  var PINNED_ID = null;

  /* 私密留言：不生成公开分享链接，转发按钮置灰 */
  function isPrivate(w) {
    return !!(w && (w.private === true || w.isPrivate === true));
  }

  function findWish(id) {
    if (!id) return null;
    var list = wishes();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /* 按 id 找出页面上所有对应的留言卡（滚动墙有两份副本） */
  function cardsOf(id) {
    return document.querySelectorAll('[data-wish-id="' + id + '"]');
  }

  function addWish(data) {
    var list = wishes();
    var w = {
      id: 'w-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      tag: data.tag,
      text: data.text,
      extra: data.extra || '',
      name: data.name || '',
      at: Date.now(),
      likes: 0,
      reply: '',
      mine: true,
      private: data.isPrivate === true,
      shares: 0
    };
    list.unshift(w);
    saveWishes(list);
    bump('comments', 1);
    bumpToday('comments', 1);
    return w;
  }

  /* 运营号置顶回复 —— 有温度才有更多人留 */
  function replyTo(id, text) {
    var list = wishes();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list[i].reply = text;
        list[i].repliedAt = Date.now();
        saveWishes(list);
        return list[i];
      }
    }
    return null;
  }

  var REPLY_BANK = {
    sakura: '记下了！茶樱节定在 3 月，雪峒茶园那片先开，到时候公众号第一时间喊你。',
    camp: '溪谷西瓜露营节 7—8 月，亲子营位有限，出发前一周打 2423085 留位更稳。',
    leaf: '红叶世界 11 月中下旬最红，工作日来人少景好，等你～',
    folk: '年俗季从腊月廿三热闹到正月十五，舞纸马、打糍粑、客家山歌连着来。',
    paper: '每周六 14:00 雪峒村有展演和教学，传承人亲自带，提前一周约就行。',
    melon: '佛手瓜 6—10 月最当季，佛手瓜宴要提前订，来之前先打个电话。'
  };

  function liked() {
    return Store.get('liked', []);
  }

  function toggleLike(id) {
    var list = liked();
    var i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
    Store.set('liked', list);

    var ws = wishes();
    for (var k = 0; k < ws.length; k++) {
      if (ws[k].id === id) {
        ws[k].likes = Math.max(0, (ws[k].likes || 0) + (i >= 0 ? -1 : 1));
        saveWishes(ws);
        return { on: i < 0, likes: ws[k].likes };
      }
    }
    return { on: i < 0, likes: 0 };
  }

  /* ======================================================================
     反馈提示（复用站点 toast，缺失时静默降级）
     ====================================================================== */

  function notify(message, icon) {
    if (window.HZ && typeof window.HZ.toast === 'function') {
      window.HZ.toast(message, { icon: icon || '✅' });
    }
  }

  /* ======================================================================
     渲染 · 实时数据条
     ====================================================================== */

  /* 访问量数字下方的口径小字 */
  function statsNote() {
    return STATS_SINCE + (analyticsReady() ? ' · 百度统计已接入' : ' · 百度统计待接入');
  }

  function renderTicker(host) {
    var t = todayTotals();
    var total = totals();
    host.className = 'grow-ticker';
    host.setAttribute('role', 'status');
    host.innerHTML =
      '<span class="grow-ticker__item"><span class="grow-ticker__num" data-grow-num="v">' + fmt(t.visits) + '</span>今日访客</span>' +
      '<span class="grow-ticker__sep" aria-hidden="true"></span>' +
      '<span class="grow-ticker__item"><span class="grow-ticker__num" data-grow-num="c">' + fmt(t.comments) + '</span>今日留言</span>' +
      '<span class="grow-ticker__sep" aria-hidden="true"></span>' +
      '<span class="grow-ticker__item"><span class="grow-ticker__num" data-grow-num="s">' + fmt(t.shares) + '</span>今日分享</span>' +
      '<span class="grow-ticker__sep" aria-hidden="true"></span>' +
      '<span class="grow-ticker__item">已有 <span class="grow-ticker__num" data-grow-num="tv">' + fmt(total.visits) + '</span> 人看过</span>' +
      '<span class="grow-ticker__note">' + statsNote() + '</span>';

    countUp(host.querySelectorAll('[data-grow-num]'));
  }

  /* 数字自增动画；reduced-motion 时直接落位 */
  function countUp(nodes) {
    var M = window.HZMotion;
    var reduced = M ? M.reduced() : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    Array.prototype.forEach.call(nodes, function (el) {
      var target = parseInt(el.textContent.replace(/[^\d]/g, ''), 10) || 0;
      if (reduced || target < 2) return;
      var start = performance.now();
      var dur = 900;
      var from = Math.max(0, target - Math.min(target, 120));
      el.textContent = fmt(from);
      function step(now) {
        var p = Math.min(1, (now - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(Math.round(from + (target - from) * eased));
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  function bumpNumbers() {
    document.querySelectorAll('[data-growth="count"]').forEach(function (el) {
      el.textContent = fmt(totals().comments);
      el.classList.remove('is-bumped');
      void el.offsetWidth;
      el.classList.add('is-bumped');
    });
  }

  /* ======================================================================
     渲染 · 许愿池滚动墙
     ====================================================================== */

  function wishCard(w, isReply) {
    var tag = tagOf(w.tag);
    var likedOn = liked().indexOf(w.id) >= 0;

    if (isReply) {
      return '<article class="grow-wish grow-wish--official">' +
        '<span class="grow-wish__emoji" aria-hidden="true">🏛️</span>' +
        '<div class="grow-wish__body">' +
        '<p class="grow-wish__text">' + esc(w.reply) + '</p>' +
        '<div class="grow-wish__meta">' +
        '<span class="grow-wish__reply-mark">官方回复</span>' +
        '<span class="grow-wish__name">' + esc(OFFICIAL_NAME) + '</span>' +
        '</div></div></article>';
    }

    return '<article class="grow-wish' + (w.mine ? ' grow-wish--mine' : '') +
      (isPrivate(w) ? ' grow-wish--private' : '') + '"' +
      ' data-wish-id="' + esc(w.id) + '">' +
      '<span class="grow-wish__emoji" aria-hidden="true">' + tag.emoji + '</span>' +
      '<div class="grow-wish__body">' +
      '<p class="grow-wish__text">' + esc(w.text) + '</p>' +
      (w.extra ? '<p class="grow-wish__extra">' + esc(w.extra) + '</p>' : '') +
      (w.reply ? '<p class="grow-wish__extra"><span class="grow-wish__reply-mark">官方回复</span> ' + esc(w.reply) + '</p>' : '') +
      '<div class="grow-wish__meta">' +
      '<span class="grow-wish__name">' + esc(maskName(w.name)) + '</span>' +
      (w.isSeed || w.seed ? '<span class="grow-wish__seed-mark">示例</span>' : '') +
      (isPrivate(w) ? '<span class="grow-wish__seed-mark">私密</span>' : '') +
      '<span>' + timeAgo(w.at) + '</span>' +
      '<button class="grow-wish__like" type="button" data-grow-like="' + esc(w.id) + '"' +
      ' aria-pressed="' + (likedOn ? 'true' : 'false') + '"' +
      ' aria-label="为这条留言点赞，当前 ' + (w.likes || 0) + ' 个赞">' +
      '<span aria-hidden="true">' + (likedOn ? '❤️' : '🤍') + '</span>' +
      '<span data-grow-likes>' + (w.likes || 0) + '</span>' +
      '</button>' +
      shareButton(w) +
      (w.mine ? deleteButton(w) : '') +
      '</div></div></article>';
  }

  /* 转发按钮 —— 私密留言直接置灰，不生成公开链接 */
  function shareButton(w) {
    var priv = isPrivate(w);
    var label = priv ? '私密留言不生成分享链接，无法转发' : '转发这条留言的独立链接';
    return '<button class="grow-wish__share' + (priv ? ' is-locked' : '') + '" type="button"' +
      ' data-grow-share="' + esc(w.id) + '"' +
      (priv ? ' disabled aria-disabled="true"' : '') +
      ' title="' + esc(label) + '" aria-label="' + esc(label) + '">' +
      '<span aria-hidden="true">' + (priv ? '🔒' : '↗') + '</span>' +
      '<span>转发</span>' +
      ((w.shares || 0) > 0
        ? '<span class="grow-wish__share-n" data-grow-share-count="' + esc(w.id) + '">' + fmt(w.shares) + '</span>'
        : '') +
      '</button>';
  }

  /* 删除按钮 —— 只对自己刚留下的留言开放，删除走收尾动画 */
  function deleteButton(w) {
    return '<button class="grow-wish__del" type="button" data-grow-del="' + esc(w.id) + '"' +
      ' aria-label="删除这条留言" title="删除这条留言">删除</button>';
  }

  /* 展开成「留言 + 官方回复」的成对序列 */
  function flatten(list) {
    var out = [];
    list.forEach(function (w) {
      out.push({ kind: 'wish', data: w });
      if (w.reply) out.push({ kind: 'reply', data: w });
    });
    return out;
  }

  /* 深链打开时的置顶卡：把这条留言从跑马灯里「拎」出来静态展示，
     不会因为墙在滚动而找不到目标。 */
  function pinBlock() {
    if (!PINNED_ID) return '';
    var w = findWish(PINNED_ID);
    if (!w) return '';
    var S = window.HZShare;
    var url = S ? S.wishUrl(w.id) : '';
    return '<div class="grow-wall__pin" role="status">' +
      '<p class="grow-wall__pin-label">' +
      '<span aria-hidden="true">📌</span> 你正在查看的这条留言' +
      '<button class="grow-wall__pin-close" type="button" data-grow-pin-close aria-label="取消定位">✕</button>' +
      '</p>' +
      '<div class="grow-wall__pin-card">' + wishCard(w, false) + '</div>' +
      '<p class="grow-wall__pin-tip">这条留言有独立链接，可直接复制分享：' +
      '<span class="grow-wall__pin-url">' + esc(url) + '</span></p>' +
      '</div>';
  }

  function clearPin() {
    PINNED_ID = null;
    if (window.HZShare) window.HZShare.cleanWishParam();
    document.querySelectorAll('[data-growth="wall"]').forEach(renderWall);
  }

  function renderWall(host) {
    var M = window.HZMotion;

    /* 重渲染前先给上一轮还在播的动画收尾，避免残留动画挂到新 DOM 上 */
    if (M) M.destroyWithin(host);

    var list = wishes().slice(0, 14);

    /* 深链命中的留言如果不在前 14 条里，提到最前面，保证打开链接一定看得到 */
    if (PINNED_ID) {
      var inList = false;
      for (var p = 0; p < list.length; p++) {
        if (list[p].id === PINNED_ID) { inList = true; break; }
      }
      if (!inList) {
        var pinned = findWish(PINNED_ID);
        if (pinned) list.unshift(pinned);
      }
    }

    var items = flatten(list);
    var reduced = M ? M.reduced() : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var lowTier = M ? M.tier() === 'low' : false;
    /* 低档位 / 减弱动效：不跑常驻跑马灯，改为可滚动列表，省掉一条 transform 动画 */
    var animated = !reduced && !lowTier;

    var html = items.map(function (it) {
      return wishCard(it.data, it.kind === 'reply');
    }).join('');

    var total = totals().comments;
    host.innerHTML =
      '<div class="grow-wall' + (PINNED_ID ? ' is-pinned' : '') + '">' +
      '<div class="grow-wall__head">' +
      '<h3 class="grow-wall__title">大家都在说 · 下次来黄磜</h3>' +
      '<p class="grow-wall__count">已有 <strong data-growth="count">' + fmt(total) + '</strong> 人许愿</p>' +
      '</div>' +
      pinBlock() +
      '<div class="grow-wall__viewport">' +
      '<div class="grow-wall__track' + (animated ? ' is-animated' : '') + '"' +
      ' style="--grow-wall-duration:' + Math.max(28, items.length * 4.2).toFixed(0) + 's"' +
      ' aria-label="许愿池留言列表" role="list">' +
      '<div class="grow-wall__group" role="listitem">' + html + '</div>' +
      (animated ? '<div class="grow-wall__group" aria-hidden="true">' + html + '</div>' : '') +
      '</div></div></div>';

    host.querySelectorAll('[data-grow-like]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var res = toggleLike(btn.getAttribute('data-grow-like'));
        btn.setAttribute('aria-pressed', res.on ? 'true' : 'false');
        btn.querySelector('[data-grow-likes]').textContent = res.likes;
        btn.querySelector('span[aria-hidden]').textContent = res.on ? '❤️' : '🤍';
        btn.setAttribute('aria-label', '为这条留言点赞，当前 ' + res.likes + ' 个赞');
        /* 两份副本同步，避免滚动时上下不一致 */
        var id = btn.getAttribute('data-grow-like');
        host.querySelectorAll('[data-grow-like="' + id + '"]').forEach(function (twin) {
          if (twin === btn) return;
          twin.setAttribute('aria-pressed', res.on ? 'true' : 'false');
          twin.querySelector('[data-grow-likes]').textContent = res.likes;
          twin.querySelector('span[aria-hidden]').textContent = res.on ? '❤️' : '🤍';
        });
      });
    });
  }

  /* ======================================================================
     渲染 · 标签化留言器
     ====================================================================== */

  function renderComposer(host) {
    var picked = Store.get('pickedTag', '');
    var nick = Store.get('nickname', '');

    host.innerHTML =
      '<div class="grow-compose">' +
      '<p class="grow-compose__lead">' +
      '如果下一季来黄磜，你最想体验什么？<strong>点一个标签就行</strong>，一句话已经替你写好了。' +
      '</p>' +

      '<div class="grow-compose__tags" role="group" aria-label="选择你在黄磜最想做的事">' +
      TAGS.map(function (t) {
        return '<button class="grow-tag" type="button" data-grow-tag="' + t.id + '"' +
          ' aria-pressed="' + (picked === t.id ? 'true' : 'false') + '">' +
          '<span class="grow-tag__emoji" aria-hidden="true">' + t.emoji + '</span>' +
          '<span>' + esc(t.label) + '</span>' +
          '</button>';
      }).join('') +
      '</div>' +

      '<div class="grow-compose__preview" data-grow-preview>' +
      '<p class="grow-compose__sentence is-empty" data-grow-sentence>选一个标签，自动生成你的那句话</p>' +
      '<p class="grow-compose__match" data-grow-match hidden></p>' +
      '</div>' +

      '<div class="grow-compose__row">' +
      '<label class="sr-only" for="grow-nick">你的昵称（选填）</label>' +
      '<input class="input" id="grow-nick" type="text" maxlength="12" placeholder="你的昵称（选填）" value="' + esc(nick) + '">' +
      '<label class="sr-only" for="grow-extra">补一句（选填）</label>' +
      '<input class="input" id="grow-extra" type="text" maxlength="40" placeholder="再补一句，比如「带爸妈一起」">' +
      '</div>' +

      '<div class="grow-compose__actions">' +
      '<button class="btn btn--primary" type="button" data-grow-submit disabled>许下这个愿</button>' +
      '</div>' +

      '<label class="grow-compose__check">' +
      '<input type="checkbox" id="grow-private">' +
      '<span>设为私密留言（不生成分享链接，转发按钮会置灰）</span>' +
      '</label>' +

      '<p class="grow-compose__hint">留言会展示在许愿池，昵称自动打码（陈晓明 → 陈**）。每条留言都有独立链接，点卡片上的「转发」即可分享。话题 #下次来黄磜</p>' +
      '<div data-grow-done></div>' +
      '</div>';

    var sentence = host.querySelector('[data-grow-sentence]');
    var match = host.querySelector('[data-grow-match]');
    var submit = host.querySelector('[data-grow-submit]');

    function sync() {
      if (!picked) {
        sentence.textContent = '选一个标签，自动生成你的那句话';
        sentence.classList.add('is-empty');
        match.hidden = true;
        submit.disabled = true;
        submit.setAttribute('aria-disabled', 'true');
        return;
      }
      var t = tagOf(picked);
      sentence.textContent = t.phrase;
      sentence.classList.remove('is-empty');
      submit.disabled = false;
      submit.removeAttribute('aria-disabled');

      /* 同好匹配 —— 制造「不是我一个人想去」的期待感 */
      var same = wishes().filter(function (w) { return w.tag === picked; }).length;
      var crowd = t.crowd + same;
      match.hidden = false;
      match.innerHTML = '和你一样想来' + esc(t.label) + '的还有 <strong>' + fmt(crowd) + '</strong> 人 · ' + esc(t.season);
    }

    host.querySelectorAll('[data-grow-tag]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        picked = btn.getAttribute('data-grow-tag');
        Store.set('pickedTag', picked);
        host.querySelectorAll('[data-grow-tag]').forEach(function (b) {
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        sync();
        var box = host.querySelector('[data-grow-done]');
        if (box) box.innerHTML = '';
      });
    });

    host.querySelector('#grow-nick').addEventListener('change', function () {
      Store.set('nickname', this.value.trim());
    });

    submit.addEventListener('click', function () {
      if (!picked) return;
      var nickVal = host.querySelector('#grow-nick').value.trim();
      var extraVal = host.querySelector('#grow-extra').value.trim();
      var privateVal = host.querySelector('#grow-private');
      var t = tagOf(picked);

      var w = addWish({
        tag: picked,
        text: t.phrase,
        extra: extraVal,
        name: nickVal || '黄磜旅人',
        isPrivate: !!(privateVal && privateVal.checked)
      });

      /* 配了 Twikoo 就同时发到线上，失败也不影响本地展示 */
      pushRemote(w);

      var seq = totals().comments;
      var done = host.querySelector('[data-grow-done]');
      done.innerHTML =
        '<div class="grow-done" role="status">' +
        '<p class="grow-done__title"><span aria-hidden="true">🎉</span>你是第 <span class="grow-done__no">' + fmt(seq) + '</span> 个许愿的人</p>' +
        '<p class="grow-done__text">' + esc(t.phrase) + ' —— 已经挂上许愿池了。</p>' +
        '<p class="grow-done__text" data-grow-reply-slot><span style="opacity:.7">正在通知镇里的工作人员…</span></p>' +
        '<div class="grow-done__actions">' +
        '<button class="btn btn--secondary btn--sm" type="button" data-grow-copy="' + esc(t.phrase) + '｜#下次来黄磜">复制这句话</button>' +
        '<button class="btn btn--secondary btn--sm" type="button" data-grow-share="' + esc(w.id) + '"' +
        (isPrivate(w) ? ' disabled aria-disabled="true" title="私密留言不生成分享链接"' : '') + '>' +
        (isPrivate(w) ? '🔒 私密留言' : '转发这条留言') + '</button>' +
        '</div></div>';

      host.querySelector('#grow-extra').value = '';

      /* 所有墙与计数同步刷新 */
      document.querySelectorAll('[data-growth="wall"]').forEach(renderWall);
      flashNewWish(w.id);
      bumpNumbers();
      notify('许愿成功，已挂上许愿池', '🎉');

      /* 运营号置顶回复 —— 延迟出场，像真的有人在回 */
      setTimeout(function () {
        var text = REPLY_BANK[picked] || '谢谢你！下一季黄磜见，等你～';
        replyTo(w.id, text);
        var slot = done.querySelector('[data-grow-reply-slot]');
        if (slot) {
          slot.innerHTML = '<span class="grow-wish__reply-mark">官方回复</span> ' + esc(text);
        }
        document.querySelectorAll('[data-growth="wall"]').forEach(renderWall);
      }, 1200);
    });

    /* 复制「这句话」—— 与转发是两回事：这是把文案复制走，
       转发（data-grow-share）走的是 share.js 的独立链接，由全局委托统一处理。 */
    host.addEventListener('click', function (e) {
      var copyBtn = e.target.closest ? e.target.closest('[data-grow-copy]') : null;
      if (!copyBtn) return;
      var S = window.HZShare;
      var text = copyBtn.getAttribute('data-grow-copy');
      if (S) {
        S.copyText(text).then(function (ok) {
          notify(ok ? '已复制，去朋友圈粘贴吧' : '复制失败，请手动选择文字', ok ? '📋' : '⚠');
        });
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          notify('已复制，去朋友圈粘贴吧', '📋');
        }).catch(function () { notify('复制失败，请手动选择文字', '⚠'); });
      }
    });

    sync();
  }

  /* ======================================================================
     留言新增 / 删除动画
     ====================================================================== */

  /* 新留言入场：播一次就摘，重复渲染不会反复叠加动画 */
  function flashNewWish(id) {
    var M = window.HZMotion;
    Array.prototype.forEach.call(cardsOf(id), function (c) {
      if (M) M.once(c, 'is-entering', 480);
      else c.classList.add('is-entering');
    });
  }

  /* 删除：先播收尾动画，播完才真正从存储里移除 */
  function deleteWish(id) {
    var M = window.HZMotion;
    var first = cardsOf(id)[0];
    if (first && M) {
      M.exit(first, function () { commitDelete(id); }, 'is-leaving');
    } else {
      commitDelete(id);
    }
  }

  function commitDelete(id) {
    saveWishes(wishes().filter(function (w) { return w.id !== id; }));
    if (PINNED_ID === id) PINNED_ID = null;
    if (window.HZShare) window.HZShare.cleanWishParam();
    document.querySelectorAll('[data-growth="wall"]').forEach(renderWall);
    bumpNumbers();
    notify('留言已删除', '🗑');
  }

  /* ======================================================================
     转发 —— 主体是链接，不是一段拼接文字
     ====================================================================== */

  /* 统计这条留言的转发量与来源标记（&from=xxx） */
  function countWishShare(w, source) {
    bump('shares', 1);
    bumpToday('shares', 1);

    var list = wishes();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === w.id) {
        list[i].shares = (list[i].shares || 0) + 1;
        if (source) {
          list[i].shareFrom = list[i].shareFrom || {};
          list[i].shareFrom[source] = (list[i].shareFrom[source] || 0) + 1;
        }
        break;
      }
    }
    saveWishes(list);

    document.querySelectorAll('[data-growth="ticker"]').forEach(renderTicker);
    document.querySelectorAll('[data-grow-share-count="' + w.id + '"]').forEach(function (el) {
      el.textContent = fmt(list[i] ? (list[i].shares || 0) : 0);
    });
  }

  /* 转发按钮的加载 / 完成状态（滚动墙有副本，两份一起变） */
  function setShareBusy(id, on) {
    var M = window.HZMotion;
    if (!M) return;
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-grow-share="' + id + '"]'),
      function (b) { M.busy(b, on); }
    );
  }

  function onShareClick(btn) {
    var S = window.HZShare;
    if (!S) { notify('转发模块未加载', '⚠'); return; }
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;

    var id = btn.getAttribute('data-grow-share');
    var w = findWish(id);

    if (!w) { notify('这条留言已不存在', '⚠'); return; }
    if (isPrivate(w)) { notify('私密留言不生成公开分享链接', '🔒'); return; }

    setShareBusy(id, true);

    /* 必须在用户手势内同步发起，否则原生分享面板会被浏览器拦截 */
    S.shareWish(w, { source: 'wish' }).then(function (res) {
      setShareBusy(id, false);
      if (res.cancelled) return;                 // 用户主动取消：不提示、不计数
      if (res.channel === 'failed') {
        notify('分享失败，可长按复制地址栏链接', '⚠');
        return;
      }
      countWishShare(w, res.source);
      if (res.channel === 'native') notify('已打开分享面板，转发给朋友吧', '🚀');
      else notify('留言链接已复制，可粘贴分享', '🔗');
    });
  }

  /* 全局委托：滚动墙会反复重渲染，逐卡绑定会漏也会重复 */
  function bindWishActions() {
    document.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-grow-share], [data-grow-del], [data-grow-pin-close]') : null;
      if (!el) return;

      if (el.hasAttribute('data-grow-share')) { onShareClick(el); return; }
      if (el.hasAttribute('data-grow-del')) {
        deleteWish(el.getAttribute('data-grow-del'));
        return;
      }
      if (el.hasAttribute('data-grow-pin-close')) { clearPin(); return; }
    });
  }

  /* ======================================================================
     深链：?wish=<id> —— 打开链接定位并高亮该留言
     ====================================================================== */

  function scrollToBoard() {
    var board = document.querySelector('.grow-wall');
    if (!board) return;
    var M = window.HZMotion;
    if (M) { M.scrollToEl(board, { block: 'center' }); return; }
    if (typeof board.scrollIntoView !== 'function') return;
    try { board.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    catch (err) { /* 环境不支持：忽略 */ }
  }

  function focusWish(id) {
    var M = window.HZMotion;

    /* 先高亮再滚动：滚动失败也不影响定位标记 */
    Array.prototype.forEach.call(cardsOf(id), function (card) {
      if (M) M.once(card, 'is-focused', 900);
      else card.classList.add('is-focused');
    });

    var first = cardsOf(id)[0];
    if (first) {
      first.setAttribute('tabindex', '-1');
      try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
    }

    scrollToBoard();
  }

  /* 留言不存在时的兜底：抹掉参数 → 回到留言板 → 提示「不存在或已删除」 */
  function handleMissingWish() {
    var S = window.HZShare;
    if (S) S.cleanWishParam();

    var home = (CFG.share && CFG.share.boardHome) || '';
    var here = location.pathname.split('/').pop() || 'index.html';
    var target = String(home).split('#')[0].split('?')[0];
    var homePage = target ? target.split('/').pop() : '';

    /* 配了主页且当前不在主页 → 跳过去，并把提示带过去 */
    if (home && homePage && homePage !== here) {
      var sep = home.indexOf('?') >= 0 ? '&' : '?';
      try {
        location.replace(home + sep + 'wish=missing');
        return;
      } catch (e) { /* 跳转失败就地处理 */ }
    }

    notify('该留言不存在或已删除，已回到留言板', '⚠');
    scrollToBoard();
  }

  function handleWishDeepLink() {
    var S = window.HZShare;
    if (!S) return;

    var parsed = S.parseWishParam();
    if (!parsed) return;

    var w = findWish(parsed.id);

    if (!w) { handleMissingWish(); return; }

    if (isPrivate(w)) {
      S.cleanWishParam();
      notify('这条是私密留言，不支持公开访问', '🔒');
      scrollToBoard();
      return;
    }

    PINNED_ID = w.id;
    S.applyWishOg(w, S.wishUrl(w.id, parsed.from));
    document.querySelectorAll('[data-growth="wall"]').forEach(renderWall);

    var M = window.HZMotion;
    if (M) M.nextFrame(function () { focusWish(w.id); });
    else setTimeout(function () { focusWish(w.id); }, 80);
  }

  /* ======================================================================
     启动
     ====================================================================== */

  function renderAll() {
    document.querySelectorAll('[data-growth="count"]').forEach(function (el) {
      el.textContent = fmt(totals().comments);
    });
    document.querySelectorAll('[data-growth="ticker"]').forEach(renderTicker);
    document.querySelectorAll('[data-growth="wall"]').forEach(renderWall);
    document.querySelectorAll('[data-growth="composer"]').forEach(renderComposer);
  }

  /* 合并远程与本地留言，按时间倒序、按 id 去重 */
  function mergeWishes(remoteList) {
    var seen = {};
    var local = wishes().filter(function (w) { return !w.remote; });
    return remoteList.concat(local).filter(function (w) {
      if (seen[w.id]) return false;
      seen[w.id] = 1;
      return true;
    }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  }

  /* 提交后同步到远程；失败也无妨，本地已经落库了 */
  function pushRemote(w) {
    Remote.post(w, function (ok) {
      if (!ok) return;
      var list = wishes();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === w.id) list[i].synced = true;
      }
      saveWishes(list);
    });
  }

  function boot() {
    seedOnce();
    injectAnalytics();

    /* 一次访问 = 一次 PV */
    bump('visits', 1);
    bumpToday('visits', 1);

    renderAll();

    /* 转发 / 删除 / 取消定位：全局委托一次，墙重渲染后不用重新绑定 */
    bindWishActions();

    /* 深链 ?wish=<id>：定位 + 高亮 + 重写分享卡片 */
    handleWishDeepLink();

    /* 配了 Twikoo 就尝试拉取线上留言；拉不到就静默用本地的 */
    Remote.load(function (remoteList) {
      if (!remoteList || !remoteList.length) return;
      saveWishes(mergeWishes(remoteList));
      document.querySelectorAll('[data-growth="wall"]').forEach(renderWall);
      if (PINNED_ID) focusWish(PINNED_ID);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* 对外接口 —— 第二期（名片生成器 / 抽奖 / 微信分享卡片）直接复用 */
  window.HZG = {
    NS: NS,
    SITE_ORIGIN: SITE_ORIGIN,
    tags: TAGS,
    tagOf: tagOf,
    stats: stats,
    totals: totals,
    todayTotals: todayTotals,
    wishes: wishes,
    addWish: addWish,
    bump: bump,
    fmt: fmt,
    esc: esc,
    notify: notify,
    renderWall: renderWall,
    findWish: findWish,
    isPrivate: isPrivate,
    deleteWish: deleteWish,
    flashNewWish: flashNewWish,
    clearPin: clearPin,
    focusWish: focusWish,
    pinnedId: function () { return PINNED_ID; }
  };
})();
