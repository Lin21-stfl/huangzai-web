# 云上黄磜 · 黄磜镇农文旅综合服务平台

> 广东省韶关市新丰县黄磜镇 —— 农文旅融合宣传轻量站

**在线访问：** https://lin21-stfl.github.io/huangzai-web/

---

## 站点概况

一个**零框架、零构建**的静态站点。双击 `index.html` 即可打开，也可直接托管到任意静态服务器 / GitHub Pages。

- **6 个页面**：首页、景点、体验、攻略列表、攻略详情、住宿
- **纯原生**：HTML5 + CSS + 原生 JavaScript，无 npm、无打包步骤
- **13 MB**：主要为本地化图片资源，无任何外部图床依赖

## 核心特性

### 视觉体系

采用 **OKLCH 色彩空间**与两层 Token 架构：

| 层级 | 文件 | 作用 |
| --- | --- | --- |
| 第一层（原始值） | `assets/css/tokens.css` | 定义 `--tea-600` 等原始色值 |
| 第二层（语义值） | `assets/css/tokens.css` | 映射为 `--action-primary` 等语义变量 |

**深色模式只重定义第二层**，组件代码里没有任何 `[data-theme]` 分支判断 —— 新增组件自动支持深浅色，这是本项目的关键设计约束。

政府宣传身份层集中在 `assets/css/identity.css`：严肃感由**更深的绿**而非更亮的色提供（`--action-primary: oklch(33.5% 0.062 145)`），并配套政务热线、等高线分割标识符、数据来源信息条等组件。

### 筛选引擎

基于 data 属性声明式驱动，组间 AND、组内 OR：

```html
<div data-filter-item
     data-tags="sakura camp"
     data-search="樱花 露营"
     data-price="180"
     data-rating="4.8">
```

配合 `data-filter-count` 实时计数、`requestAnimationFrame` 合并高频滑块事件（拖动过程中不再逐帧重排列表）。

### 增长互动层

`assets/js/growth.js` 是一个零依赖 IIFE，通过挂在空 div 上的 `data-growth` 挂载点自动注水：

```html
<div data-growth="ticker"></div>   <!-- 实时数据滚动条 -->
<div data-growth="wall"></div>     <!-- 心愿留言墙 -->
<div data-growth="composer"></div> <!-- 一键标签留言器 -->
<div data-growth="count"></div>    <!-- 数字计数器 -->
```

统一的传播文案为 **「下次来黄磜____」**，6 个标签对应不同人群。留言支持本地存储与可选远程后端（见下）。

## 配置

上线只需改 **一个文件**：`site.config.js`

```js
window.HZ_SITE = {
  origin:    'https://lin21-stfl.github.io/huangzai-web/', // 决定 og:url / 分享卡片
  analytics: { provider: '', id: '' },                     // baidu | 51la | umami
  comment:   { provider: 'local', twikooEnvId: '' },       // local | twikoo
  wechat:    { signatureApi: '' }
};
```

### 留言后端切换

默认 `provider: 'local'` 存 localStorage（单机演示，换设备看不到他人留言）。切换为跨设备真实评论：

1. 开通腾讯云开发 CloudBase，建环境
2. 部署 Twikoo（云函数版），拿到 `envId`
3. 填入 `twikooEnvId`，并在页面引入 Twikoo SDK
4. 控制台开启「评论审核」过滤广告

填入后 `growth.js` 自动切换数据源，渲染层无需改动。请求失败会静默降级回 localStorage。

## 本地预览

直接双击 `index.html`，或起一个本地服务：

```bash
python -m http.server 8000
```

局域网内用其他设备（手机）访问：双击 **`start-lan.bat`**，会自动探测本机 IPv4 并打印可访问地址。

> 注：微信内置浏览器可能无法直接打开纯 IP 的局域网地址，正式测试请用已部署的 Pages 链接。

## 部署更新

站点托管在 GitHub Pages，推送后自动生效：

```bash
./push-github.sh
```

该脚本的存在是因为本机环境有两个坑会让普通 `git push` 静默挂起：存在透明代理导致 `github.com` 被解析到 `127.0.0.1`，且凭据助手链路会拉起文本编辑器等待保存。脚本会自动绕过这两点。首次使用需先完成浏览器授权：

```bash
git credential-manager github login --browser
```

## 无障碍

- WCAG 2.1 AA 级对比度
- 交互元素最小触控区域 44 × 44 px
- 完整 `:focus-visible` 焦点环
- 尊重 `prefers-reduced-motion`（关闭动画改为静态可滚动列表）
- `aria-pressed` / `aria-live` 语义化状态播报

## 免责声明

本站为**界面设计方案演示**，非黄磜镇官方发布渠道。页面中出现的统计数据、价格、联系方式均为演示占位内容，如有出入请以官方发布为准。

---

*Made for 三下乡社会实践 · 大学生创新创业训练计划*
