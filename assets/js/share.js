/* ==========================================================================
   share.js · 转发模块（零依赖）
   --------------------------------------------------------------------------
   设计原则：**分享的主体是链接，不是一段拼接文字。**

     · 每条留言有一个恒定唯一的链接：<当前页>?wish=<留言ID>
       —— 同一条留言无论转发多少次，链接永远是同一个（不生成新链接）。
     · 优先唤起系统原生分享面板（Web Share API：微信 / QQ / 系统分享 / 复制…）。
     · 不支持原生面板时降级：自动复制这条留言的独立链接 + 提示「可粘贴分享」。
     · 原生分享可以附带一句简短描述，但那只是点缀，载体仍是 URL。
     · 链接可带来源标记 &from=xxx，用于统计每条留言的转发来源与转发量。
     · 打开链接后由 growth.js 定位到该留言并高亮；留言不存在则回留言板并提示。

   对外：window.HZShare
   ========================================================================== */
(function () {
  'use strict';

  var CFG = (typeof window !== 'undefined' && window.HZ_SITE) || {};
  var SHARE_CFG = CFG.share || {};

  /* 移除 URL 上会造成重复叠加的参数 */
  var OWN_PARAMS = ['wish', 'from'];

  function stripParams(href, names) {
    var qIndex = href.indexOf('?');
    if (qIndex < 0) return href;
    var base = href.slice(0, qIndex);
    var hash = '';
    var hIndex = href.indexOf('#');
    if (hIndex > qIndex) {
      hash = href.slice(hIndex);
    }
    var query = href.slice(qIndex + 1, hIndex > qIndex ? hIndex : undefined);
    var kept = query.split('&').filter(function (pair) {
      if (!pair) return false;
      var key = pair.split('=')[0];
      return names.indexOf(key) < 0;
    });
    return base + (kept.length ? '?' + kept.join('&') : '') + hash;
  }

  function pageBase() {
    return stripParams(location.href.split('#')[0], OWN_PARAMS);
  }

  /* ------------------------------------------------------------------
     链接生成
     ------------------------------------------------------------------ */

  /* 同一条留言 → 恒定同一个链接。不掺时间戳、不掺随机数。 */
  function wishUrl(id, source) {
    if (!id) return pageBase();
    var base = pageBase();
    var sep = base.indexOf('?') >= 0 ? '&' : '?';
    var url = base + sep + 'wish=' + encodeURIComponent(id);
    var src = source || SHARE_CFG.defaultSource;
    if (src) url += '&from=' + encodeURIComponent(src);
    return url;
  }

  function absolute(url) {
    try {
      return new URL(url, location.href).href;
    } catch (e) {
      return url;
    }
  }

  /* ------------------------------------------------------------------
     深链解析
     ------------------------------------------------------------------ */

  function parseWishParam(search) {
    var raw = search || location.search || '';
    if (!raw || raw.charAt(0) === '?') raw = raw.slice(1);
    var out = { id: '', from: '' };
    raw.split('&').forEach(function (pair) {
      if (!pair) return;
      var parts = pair.split('=');
      var key = decodeURIComponent(parts[0] || '');
      var val = decodeURIComponent((parts.slice(1).join('=')) || '');
      if (key === 'wish') out.id = val;
      if (key === 'from') out.from = val;
    });
    return out.id ? out : null;
  }

  /* 留言不存在 / 私密：把参数从地址栏抹掉，避免刷新时反复弹提示 */
  function cleanWishParam() {
    var cleaned = stripParams(location.href, OWN_PARAMS);
    if (cleaned === location.href) return;
    try {
      history.replaceState(history.state, document.title, cleaned);
    } catch (e) { /* file:// 下不支持 replaceState：忽略即可 */ }
  }

  /* ------------------------------------------------------------------
     剪贴板（带 execCommand 兜底，兼容 http 与旧内核）
     ------------------------------------------------------------------ */

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function copyText(text) {
    return new Promise(function (resolve) {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () {
          resolve(true);
        }).catch(function () {
          resolve(legacyCopy(text));
        });
        return;
      }
      resolve(legacyCopy(text));
    });
  }

  /* ------------------------------------------------------------------
     原生分享
     ------------------------------------------------------------------ */

  function canNative(payload) {
    if (!navigator.share) return false;
    if (typeof navigator.canShare === 'function') {
      try {
        return navigator.canShare(payload || { url: location.href });
      } catch (e) {
        return false;
      }
    }
    return true;
  }

  function fallback(url) {
    return copyText(url).then(function (ok) {
      return { channel: ok ? 'clipboard' : 'failed', ok: ok, url: url };
    });
  }

  /* payload: { title, text, url }
     返回 { channel: 'native'|'clipboard'|'failed', ok, cancelled, url } */
  function share(payload) {
    var p = payload || {};
    var url = p.url || location.href;
    var data = { title: p.title || document.title, url: url };
    if (p.text) data.text = p.text;

    // 原生分享必须在用户手势内同步发起，这里不做任何 await
    if (canNative(data)) {
      return new Promise(function (resolve) {
        navigator.share(data).then(function () {
          resolve({ channel: 'native', ok: true, url: url });
        }).catch(function (err) {
          if (err && err.name === 'AbortError') {
            resolve({ channel: 'native', ok: false, cancelled: true, url: url });
            return;
          }
          // 其它失败（无权限 / 被拦截）→ 降级复制链接
          fallback(url).then(resolve);
        });
      });
    }
    return fallback(url);
  }

  /* ------------------------------------------------------------------
     留言转发：组装分享卡片内容
     ------------------------------------------------------------------ */

  function excerpt(wish, max) {
    var text = String((wish && wish.text) || '').trim();
    var extra = String((wish && wish.extra) || '').trim();
    var full = text + (extra ? '｜' + extra : '');
    var limit = max || 46;
    if (full.length <= limit) return full;
    return full.slice(0, limit) + '…';
  }

  /* wish: { id, text, extra, name, private }
     返回 Promise<result>；result.channel 决定提示文案 */
  function shareWish(wish, opts) {
    var o = opts || {};
    var id = wish && wish.id;
    if (!id) {
      return Promise.resolve({ channel: 'failed', ok: false, url: location.href });
    }

    var source = o.source || SHARE_CFG.defaultSource || '';
    var url = wishUrl(id, source);
    var prefix = o.textPrefix || SHARE_CFG.textPrefix || '来自黄磜留言板的留言：';
    var siteName = SHARE_CFG.siteName || '云上黄磜 · 留言板';

    return share({
      title: (wish && wish.text) ? wish.text + ' · ' + siteName : siteName,
      text: prefix + excerpt(wish),
      url: url
    }).then(function (res) {
      res.wishId = id;
      res.source = source;      // 来源标记，供留言转发量统计
      return res;
    });
  }

  /* ------------------------------------------------------------------
     分享卡片（OG / Twitter Card）动态注入
     静态站没法为每条留言各生成一份 HTML，所以用 JS 在打开深链时改写 og:*，
     社交软件抓取时读到的是这条留言的标题与摘要。
     ------------------------------------------------------------------ */

  function upsertMeta(attr, key, content) {
    var el = document.head.querySelector('meta[' + attr + '="' + key + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
    return el;
  }

  function applyOg(info) {
    if (!info) return;
    var image = info.image || SHARE_CFG.ogImage || '';
    var url = info.url || location.href;

    if (info.title) {
      upsertMeta('property', 'og:title', info.title);
      upsertMeta('name', 'twitter:title', info.title);
      upsertMeta('itemprop', 'name', info.title);
    }
    if (info.description) {
      upsertMeta('property', 'og:description', info.description);
      upsertMeta('name', 'twitter:description', info.description);
      upsertMeta('itemprop', 'description', info.description);
    }
    if (image) {
      upsertMeta('property', 'og:image', image);
      upsertMeta('name', 'twitter:image', image);
      upsertMeta('itemprop', 'image', image);
    }
    upsertMeta('property', 'og:url', url);

    var canonical = document.head.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', url);

    upsertMeta('property', 'og:type', 'article');
    return true;
  }

  /* 用留言内容重写分享卡片 */
  function applyWishOg(wish, url) {
    if (!wish) return;
    var siteName = SHARE_CFG.siteName || '云上黄磜 · 留言板';
    applyOg({
      title: (wish.text || '一条留言') + ' · ' + siteName,
      description: excerpt(wish, 80),
      image: SHARE_CFG.ogImage || '',
      url: url || wishUrl(wish.id)
    });
  }

  /* ------------------------------------------------------------------
     对外接口
     ------------------------------------------------------------------ */

  window.HZShare = {
    wishUrl: wishUrl,
    absolute: absolute,
    parseWishParam: parseWishParam,
    cleanWishParam: cleanWishParam,
    canNative: canNative,
    copyText: copyText,
    share: share,
    shareWish: shareWish,
    applyOg: applyOg,
    applyWishOg: applyWishOg,
    excerpt: excerpt
  };
})();
