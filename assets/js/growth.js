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

  /* 线上累计基数：本地增量叠加在它之上，让演示数字不至于从 0 开始 */
  var BASE = {
    visits: 12345,
    comments: 678,
    shares: 2341
  };

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
    { name: '陈晓明', tag: 'sakura', extra: '带爸妈一起来，住茶园那家民宿', offset: 42, likes: 42, reply: '谢谢你！今年茶樱节定在 3 月，雪峒茶园等你～' },
    { name: '李婉君', tag: 'paper', extra: '想看一次周六下午的展演', offset: 96, likes: 37, reply: '每周六 14:00 雪峒村固定展演，传承人亲自带教，记得提前预约。' },
    { name: '王志强', tag: 'camp', extra: '', offset: 168, likes: 28, reply: '' },
    { name: '张慧敏', tag: 'leaf', extra: '红叶季一定要挑个工作日来', offset: 240, likes: 31, reply: '懂行！红叶季工作日人少景好，11 月中下旬是峰值。' },
    { name: '刘家豪', tag: 'melon', extra: '佛手瓜宴听说要提前订', offset: 312, likes: 24, reply: '' },
    { name: '周雨欣', tag: 'folk', extra: '', offset: 420, likes: 19, reply: '年俗季从腊月廿三开始，舞纸马、打糍粑、客家山歌连着来。' },
    { name: '黄国栋', tag: 'sakura', extra: '拍完樱花顺路去趟红色旧址', offset: 560, likes: 33, reply: '' },
    { name: '吴美玲', tag: 'camp', extra: '带娃，问问有没有亲子营位', offset: 700, likes: 21, reply: '溪谷露营区有亲子营位，帐篷间距大，热水 24 小时供应。' },
    { name: '郑凯文', tag: 'leaf', extra: '', offset: 880, likes: 17, reply: '' },
    { name: '曾秀兰', tag: 'paper', extra: '我们村以前也有纸马队', offset: 1120, likes: 26, reply: '那太好了！镇里正在做口述史采集，欢迎回来聊聊老一辈的纸马队。' },
    { name: '罗子谦', tag: 'melon', extra: '想买一箱带回广州', offset: 1450, likes: 15, reply: '' },
    { name: '谢雅雯', tag: 'folk', extra: '', offset: 1900, likes: 22, reply: '年俗季民宿紧张，建议提前两周订房。' }
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

  /* 首次访问时注入种子留言 —— 页面一打开就是热闹的 */
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
        seed: true
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

  /* 今日展示口径：日期种子基线 + 本日本地真实增量 */
  function todayTotals() {
    var t = today();
    var seed = todaySeed();
    return {
      visits: pseudo(seed, 1, 268, 392) + (t.visits || 0),
      comments: pseudo(seed, 2, 38, 72) + (t.comments || 0),
      shares: pseudo(seed, 3, 74, 128) + (t.shares || 0)
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
      mine: true
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
    camp: '溪谷西瓜露营节 7—8 月，亲子营位有限，出发前一周打 0751-2423088 留位更稳。',
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
      '<span class="grow-ticker__item">已有 <span class="grow-ticker__num" data-grow-num="tv">' + fmt(total.visits) + '</span> 人看过</span>';

    countUp(host.querySelectorAll('[data-grow-num]'));
  }

  /* 数字自增动画；reduced-motion 时直接落位 */
  function countUp(nodes) {
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

    return '<article class="grow-wish' + (w.mine ? ' grow-wish--mine' : '') + '">' +
      '<span class="grow-wish__emoji" aria-hidden="true">' + tag.emoji + '</span>' +
      '<div class="grow-wish__body">' +
      '<p class="grow-wish__text">' + esc(w.text) + '</p>' +
      (w.extra ? '<p class="grow-wish__extra">' + esc(w.extra) + '</p>' : '') +
      (w.reply ? '<p class="grow-wish__extra"><span class="grow-wish__reply-mark">官方回复</span> ' + esc(w.reply) + '</p>' : '') +
      '<div class="grow-wish__meta">' +
      '<span class="grow-wish__name">' + esc(maskName(w.name)) + '</span>' +
      '<span>' + timeAgo(w.at) + '</span>' +
      '<button class="grow-wish__like" type="button" data-grow-like="' + esc(w.id) + '"' +
      ' aria-pressed="' + (likedOn ? 'true' : 'false') + '"' +
      ' aria-label="为这条留言点赞，当前 ' + (w.likes || 0) + ' 个赞">' +
      '<span aria-hidden="true">' + (likedOn ? '❤️' : '🤍') + '</span>' +
      '<span data-grow-likes>' + (w.likes || 0) + '</span>' +
      '</button>' +
      '</div></div></article>';
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

  function renderWall(host) {
    var list = wishes().slice(0, 14);
    var items = flatten(list);
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var html = items.map(function (it) {
      return wishCard(it.data, it.kind === 'reply');
    }).join('');

    var total = totals().comments;
    host.innerHTML =
      '<div class="grow-wall">' +
      '<div class="grow-wall__head">' +
      '<h3 class="grow-wall__title">大家都在说 · 下次来黄磜</h3>' +
      '<p class="grow-wall__count">已有 <strong data-growth="count">' + fmt(total) + '</strong> 人许愿</p>' +
      '</div>' +
      '<div class="grow-wall__viewport">' +
      '<div class="grow-wall__track' + (reduced ? '' : ' is-animated') + '"' +
      ' style="--grow-wall-duration:' + Math.max(28, items.length * 4.2).toFixed(0) + 's"' +
      ' aria-label="许愿池留言列表" role="list">' +
      '<div class="grow-wall__group" role="listitem">' + html + '</div>' +
      (reduced ? '' : '<div class="grow-wall__group" aria-hidden="true">' + html + '</div>') +
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

      '<p class="grow-compose__hint">留言会展示在许愿池，昵称自动打码（陈晓明 → 陈**）。话题 #下次来黄磜</p>' +
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
      var t = tagOf(picked);

      var w = addWish({
        tag: picked,
        text: t.phrase,
        extra: extraVal,
        name: nickVal || '黄磜旅人'
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
        '<button class="btn btn--secondary btn--sm" type="button" data-grow-share>分享给朋友</button>' +
        '</div></div>';

      host.querySelector('#grow-extra').value = '';

      /* 所有墙与计数同步刷新 */
      document.querySelectorAll('[data-growth="wall"]').forEach(renderWall);
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

    /* 复制 / 分享（分享的完整实现在第二期，这里先把计数埋进去） */
    host.addEventListener('click', function (e) {
      var copyBtn = e.target.closest('[data-grow-copy]');
      if (copyBtn && navigator.clipboard) {
        navigator.clipboard.writeText(copyBtn.getAttribute('data-grow-copy')).then(function () {
          notify('已复制，去朋友圈粘贴吧', '📋');
        }).catch(function () { notify('复制失败，请手动选择文字', '⚠'); });
        return;
      }
      var shareBtn = e.target.closest('[data-grow-share]');
      if (shareBtn) {
        bump('shares', 1);
        bumpToday('shares', 1);
        document.querySelectorAll('[data-growth="ticker"]').forEach(renderTicker);
        notify('感谢转发！已记入分享榜', '🚀');
      }
    });

    sync();
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

    /* 一次访问 = 一次 PV */
    bump('visits', 1);
    bumpToday('visits', 1);

    renderAll();

    /* 配了 Twikoo 就尝试拉取线上留言；拉不到就静默用本地的 */
    Remote.load(function (remoteList) {
      if (!remoteList || !remoteList.length) return;
      saveWishes(mergeWishes(remoteList));
      document.querySelectorAll('[data-growth="wall"]').forEach(renderWall);
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
    renderWall: renderWall
  };
})();
