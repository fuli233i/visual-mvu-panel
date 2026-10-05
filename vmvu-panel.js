/* ============================================================
 *  可视化 MVU 面板 · 核心逻辑（不含样式，样式见 vmvu-style.css）
 *  © 2026 fuli233i · 保留所有权利（未经许可请勿转载 / 商用）
 *  两种运行方式：
 *    1) 嵌入酒馆主页面（扩展注入）：VMVU.init(root, {messageId}) —— 直接用全局 TavernHelper 读写变量
 *    2) 独立打开预览：自动挂到 #vmvu-root，用内置示例数据
 * ============================================================ */
(function (global) {
  'use strict';

  var LAYOUT_KEY = '可视化面板_布局';
  var WB_COMMENT = '[面板]当前交互区清单';
  /* 面板的显示开关：AI 回复正文里出现这个标记，那一楼才会显示面板。
     要和 index.js 里的 TRIGGER_PATTERNS 保持一致。 */
  var PANEL_TRIGGER = '{visual-mvu}';
  /* 每次改了注入文案/关键逻辑就把这个号 +1：刷新后看 Console 有没有打印这一版，
     能立刻知道「浏览器里跑的到底是不是新代码」。 */
  var BUILD = '2026-10-05.25';
  var GRID = 8;
  var MIN_W = 96, MIN_H = 56;

  /* 面板可选字体 */
  var FONTS = [
    { id: 'inherit',  label: '默认（系统黑体）', css: '' },
    { id: 'yahei',    label: '微软雅黑',        css: '"Microsoft YaHei UI", "Microsoft YaHei", sans-serif' },
    { id: 'pingfang', label: '苹方 / 思源黑',    css: '"PingFang SC", "Source Han Sans SC", "Noto Sans SC", sans-serif' },
    { id: 'source',   label: '思源宋体',        css: '"Source Han Serif SC", "Noto Serif SC", "Songti SC", "SimSun", serif' },
    { id: 'kai',      label: '楷体',            css: '"Kaiti SC", "KaiTi", "STKaiti", serif' },
    { id: 'fangsong', label: '仿宋',            css: '"FangSong", "STFangsong", serif' },
    { id: 'rounded',  label: '圆体',            css: '"Yuanti SC", "Microsoft YaHei UI", "Segoe UI", sans-serif' },
    { id: 'mono',     label: '等宽',            css: 'Consolas, "Cascadia Mono", "JetBrains Mono", monospace' }
  ];

  /* 卡片可选字体（默认跟随面板） */
  var CARD_FONTS = [{ id: 'inherit', label: '跟随面板', css: '' }].concat(
    FONTS.filter(function (f) { return f.id !== 'inherit'; })
  );

  /* 面板三个底色的预设。
     淡色感知明度 L≈85~92，浓色 L≈36~45 —— 不淡到发白、不深到发黑；
     色相覆盖红橙黄绿青蓝紫粉 + 中性阶，每个色块一眼能分辨。 */
  var LIGHT_PRESETS = [
    { label: '红',   css: '#ffd6d2' },
    { label: '橙',   css: '#ffdfc2' },
    { label: '黄',   css: '#f7e9a8' },
    { label: '绿',   css: '#c9ecc4' },
    { label: '青',   css: '#bfe9e6' },
    { label: '蓝',   css: '#c9dcf7' },
    { label: '紫',   css: '#dcd0f5' },
    { label: '粉',   css: '#f7cfe2' }
  ];
  var DARK_PRESETS = [
    { label: '红',   css: '#8c3b3b' },
    { label: '橙',   css: '#8a5a2b' },
    { label: '黄',   css: '#7a6a24' },
    { label: '绿',   css: '#3d6b45' },
    { label: '青',   css: '#2f6360' },
    { label: '蓝',   css: '#365b8a' },
    { label: '紫',   css: '#5b4a8c' },
    { label: '粉',   css: '#8a3d63' }
  ];
  var NEUTRAL_PRESETS = [
    { label: '纯白', css: '#ffffff' },
    { label: '米',   css: '#f2f0ea' },
    { label: '浅灰', css: '#d9d9d9' },
    { label: '中灰', css: '#a8a8a8' },
    { label: '深灰', css: '#6b6b6b' },
    { label: '石墨', css: '#3a3a3a' },
    { label: '炭黑', css: '#1c1c1c' },
    { label: '纯黑', css: '#000000' }
  ];
  function bgPresets() {
    return [{ label: '跟随主题', css: '' }]
      .concat(LIGHT_PRESETS, DARK_PRESETS, NEUTRAL_PRESETS);
  }

  /* 边框预设色：含高饱和选项，作为强调色用 */
  var BORDER_COLORS = [
    { id: '',       label: '跟随主题', css: '' },
    { id: 'ink',    label: '墨黑',   css: '#1a1a1a' },
    { id: 'red',    label: '正红',   css: '#e0322a' },
    { id: 'pink',   label: '桃粉',   css: '#ff6fa8' },
    { id: 'gold',   label: '明黄',   css: '#f5c518' },
    { id: 'green',  label: '草绿',   css: '#3fa85c' },
    { id: 'cyan',   label: '青',     css: '#25b8c4' },
    { id: 'blue',   label: '宝蓝',   css: '#2f6fe0' },
    { id: 'violet', label: '紫',     css: '#8b46e0' },
    { id: 'wood',   label: '暖棕',   css: '#8a6a4a' },
    { id: 'bone',   label: '米白',   css: '#e8ddc8' }
  ];

  /* ---------------- 图标素材 ---------------- */
  /* 齿轮图标：内联 SVG，不依赖图标字体 */
  var GEAR_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z"/>' +
      '<path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.62l-1.92-3.32a.5.5 0 0 0-.59-.22l-2.39.96a7.1 7.1 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2.3h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.24-1.12.55-1.62.94l-2.39-.96a.5.5 0 0 0-.59.22L2.73 8.86a.5.5 0 0 0 .12.62l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.62l1.92 3.32c.12.22.38.3.59.22l2.39-.96c.5.39 1.04.7 1.62.94l.36 2.54c.04.24.25.42.49.42h3.8c.24 0 .45-.18.49-.42l.36-2.54c.58-.24 1.12-.55 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.5.5 0 0 0-.12-.62l-2.03-1.58z"/>' +
    '</svg>';

/* 垃圾桶图标：还没设置的占位卡片右下角用它删除 */
var TRASH_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M9 3h6a1 1 0 0 1 1 1v1h3.5a1 1 0 1 1 0 2H4.5a1 1 0 1 1 0-2H8V4a1 1 0 0 1 1-1zm-2.6 6h11.2l-.8 10.1A2 2 0 0 1 14.8 21H9.2a2 2 0 0 1-2-1.9L6.4 9zm3.1 3v6a.9.9 0 1 0 1.8 0v-6a.9.9 0 1 0-1.8 0zm3.2 0v6a.9.9 0 1 0 1.8 0v-6a.9.9 0 1 0-1.8 0z"/>' +
  '</svg>';

  var BUILTIN_ICONS = [
    '🌸', '💠', '❤️', '🔥', '💧', '🌙', '⭐', '🍀', '🎀', '👑',
    '🗝️', '📜', '⚗️', '🕯️', '🪞', '🩸', '🌡️', '⏳', '🎭', '🫧',
    '🍒', '🥀', '🕸️', '🪷', '💍', '🧿', '🔮', '🫀', '🎴', '🏮'
  ];

  var TONES = [
    { id: 'pink', label: '粉', css: 'linear-gradient(90deg,#ff9a9e,#fecfef)' },
    { id: 'gold', label: '金', css: 'linear-gradient(90deg,#f6d365,#fda085)' },
    { id: 'violet', label: '紫', css: 'linear-gradient(90deg,#b48cf0,#e0c8ff)' },
    { id: 'danger', label: '红', css: 'linear-gradient(90deg,#ff6a6a,#e23b3b)' },
    { id: 'cyan', label: '青', css: 'linear-gradient(90deg,#4fc3d9,#a8ecf7)' },
    { id: 'rose', label: '玫', css: 'linear-gradient(90deg,#ff9ec4,#a0306e)' }
  ];

  /* ---------------- 主题体系 ----------------
   * 两派：淡 / 浓。淡派给浅色界面用，浓派给深色界面用。
   * 主题色（强调色）与面板底色、卡片底色、交互区底色互相独立，都能单独改。 */
  var THEME_MODES = [
    { id: 'light', label: '淡' },
    { id: 'dark',  label: '浓' }
  ];

  var THEMES = [
    /* ---- 淡派（浅色界面） ---- */
    { id: 'peach',    label: '暖桃', mode: 'light', accent: '#d97757',
      panel: '#faf9f5', canvas: '#f2f0e9', card: '#ffffff', bar: '#e8e4da',
      ink: '#3d3d3a', inkStrong: '#141413', line: 'rgba(20,20,19,0.10)' },
    { id: 'mint',     label: '薄荷', mode: 'light', accent: '#3f9e86',
      panel: '#f7faf8', canvas: '#eaf2ee', card: '#ffffff', bar: '#dce8e2',
      ink: '#3a403d', inkStrong: '#121614', line: 'rgba(18,22,20,0.10)' },
    { id: 'sky',      label: '晴空', mode: 'light', accent: '#4a82c8',
      panel: '#f7f9fc', canvas: '#e9eff7', card: '#ffffff', bar: '#dbe4f0',
      ink: '#3a3f47', inkStrong: '#12151a', line: 'rgba(18,21,26,0.10)' },
    { id: 'lavender', label: '丁香', mode: 'light', accent: '#8a70d0',
      panel: '#f9f8fc', canvas: '#eeeaf7', card: '#ffffff', bar: '#e2dcf0',
      ink: '#403c4a', inkStrong: '#16131c', line: 'rgba(22,19,28,0.10)' },
    { id: 'rose',     label: '蔷薇', mode: 'light', accent: '#d05a80',
      panel: '#fcf7f9', canvas: '#f7e9ee', card: '#ffffff', bar: '#f0dbe2',
      ink: '#483a3f', inkStrong: '#1c1216', line: 'rgba(28,18,22,0.10)' },
    { id: 'amber',    label: '琥珀', mode: 'light', accent: '#c08a3e',
      panel: '#fcfaf5', canvas: '#f6efe2', card: '#ffffff', bar: '#efe4d0',
      ink: '#453e33', inkStrong: '#1a1610', line: 'rgba(26,22,16,0.10)' },

    /* ---- 浓派（深色界面） ---- */
    { id: 'peach_dark',    label: '暖桃', mode: 'dark', accent: '#e08a68',
      panel: '#1a1917', canvas: '#100f0e', card: '#26241f', bar: '#2b2823',
      ink: '#d8d3c8', inkStrong: '#f5f2ea', line: 'rgba(255,255,255,0.12)' },
    { id: 'mint_dark',     label: '薄荷', mode: 'dark', accent: '#4fb59a',
      panel: '#161a18', canvas: '#0d100f', card: '#20261f', bar: '#252c28',
      ink: '#ccd6d1', inkStrong: '#eef5f1', line: 'rgba(255,255,255,0.12)' },
    { id: 'sky_dark',      label: '晴空', mode: 'dark', accent: '#5a92d8',
      panel: '#161a1f', canvas: '#0d1013', card: '#1f252c', bar: '#242b33',
      ink: '#ccd4de', inkStrong: '#eef3f9', line: 'rgba(255,255,255,0.12)' },
    { id: 'lavender_dark', label: '丁香', mode: 'dark', accent: '#9a80e0',
      panel: '#191720', canvas: '#100e14', card: '#241f2e', bar: '#2a2535',
      ink: '#d3cde0', inkStrong: '#f2effa', line: 'rgba(255,255,255,0.12)' },
    { id: 'rose_dark',     label: '蔷薇', mode: 'dark', accent: '#e0709a',
      panel: '#1c1618', canvas: '#120d0f', card: '#2a1f24', bar: '#31252b',
      ink: '#e0ccd3', inkStrong: '#faedf2', line: 'rgba(255,255,255,0.12)' },
    { id: 'amber_dark',    label: '琥珀', mode: 'dark', accent: '#d8a052',
      panel: '#1c1915', canvas: '#120f0c', card: '#2a251d', bar: '#322c22',
      ink: '#ded5c4', inkStrong: '#faf5ea', line: 'rgba(255,255,255,0.12)' }
  ];

  /* 默认色派：浓（深色界面）。新装/清空布局后就是这个。 */
  var DEFAULT_THEME = 'peach_dark';

  /* 单色强调色（与主题无关，可单独选） */
  var ACCENTS = [
    { id: 'theme', label: '跟随主题', css: '' },
    { id: 'clay',  label: '陶土', css: '#d97757' },
    { id: 'rose',  label: '玫瑰', css: '#e0709a' },
    { id: 'violet',label: '紫罗', css: '#8a70d0' },
    { id: 'sky',   label: '天蓝', css: '#4a82c8' },
    { id: 'mint',  label: '薄荷', css: '#3f9e86' },
    { id: 'gold',  label: '琥珀', css: '#c08a3e' },
    { id: 'ink',   label: '墨黑', css: '#4a4a48' }
  ];

  /* ---------------- 基础工具 ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  /* 不再吸附网格：位置取整到像素即可，允许自由摆放 */
  function snap(v) { return Math.round(v); }
  function uid() { return 'z' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function num(v, d) { var n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : (d === undefined ? 0 : d); }
  function fmt(v) { return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1); }

  function isBoolish(v) {
    if (typeof v === 'boolean') return true;
    if (typeof v === 'string') return ['true', 'false', '是', '否', 'yes', 'no'].indexOf(v.trim().toLowerCase()) >= 0;
    return false;
  }
  function toBool(v) {
    if (typeof v === 'boolean') return v;
    return ['true', '是', 'yes', '1', '真', 'on'].indexOf(String(v).trim().toLowerCase()) >= 0;
  }
  function getPath(obj, path) {
    if (!path || !obj) return undefined;
    var parts = String(path).split('.').filter(Boolean), cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[parts[i]];
    }
    if (Array.isArray(cur) && cur.length && (typeof cur[0] === 'number' || typeof cur[0] === 'string' || typeof cur[0] === 'boolean')) return cur[0];
    return cur;
  }
  function setPath(obj, path, val) {
    var parts = String(path).split('.').filter(Boolean), cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    var last = parts[parts.length - 1], old = cur[last];
    cur[last] = (Array.isArray(old) && old.length > 1) ? [val, old[1]] : val;
  }
  function delPath(obj, path) {
    var parts = String(path).split('.').filter(Boolean);
    if (!parts.length || !obj || typeof obj !== 'object') return false;
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!cur || typeof cur !== 'object') return false;
      cur = cur[parts[i]];
    }
    if (!cur || typeof cur !== 'object') return false;
    var last = parts[parts.length - 1];
    if (!(last in cur)) return false;
    delete cur[last];
    return true;
  }

  /* ---------------- 状态 ---------------- */
  var S = {
    root: null,
    layout: null,
    statData: {},
    messageId: -1,
    api: null,          // TavernHelper 或兼容对象
    demo: false,
    canvas: null,
    layer: null,
    scrollY: 0
  };

  /* ---------------- 布局 ---------------- */
  function defaultLayout() {
    return {
      版本: 1,
      交互区高度: 320,
      界面字体: '',
      始终注入: false,       /* 默认关：只有存在设置好的变量区时才注入说明 */
      主题: {
        预设: DEFAULT_THEME,
        模式: '',            /* '' = 跟随预设；'light' / 'dark' 可强制切换 */
        强调色: '',          /* 单色强调色；空 = 跟随主题 */
        面板底色: '',        /* 独立覆盖，空 = 跟随主题 */
        卡片底色: '',
        交互区底色: '',
        网格: true,
        暗角: 0,
        亮度: 1,          /* 1 = 不变；整体 filter: brightness() */
        对比度: 1         /* 1 = 不变；整体 filter: contrast() */
      },
      卡片: {}
    };
  }

  /* keepPending=true 时保留「还没设置的占位卡」。
     正常加载/导入时要把它们丢掉：占位卡只是拖动过程的临时状态，
     存下来会导致每次打开都满地是没设好的框。 */
  function normalizeLayout(raw, keepPending) {
    var out = defaultLayout();
    if (!raw || typeof raw !== 'object') return out;
    out.交互区高度 = clamp(num(raw.交互区高度, 320), 140, 900);
    out.界面字体 = FONTS.some(function (f) { return f.id === raw.界面字体; }) ? raw.界面字体 : '';
    out.始终注入 = raw.始终注入 === true;       /* 默认关（只有导入的老布局显式开了才开） */
    var th = raw.主题 || {};
    var presetOk = THEMES.some(function (t) { return t.id === th.预设; });
    /* 旧版主题 id（无 _dark 后缀）自动归到浓派，老布局不炸 */
    if (!presetOk && th.预设) {
      var migrated = th.预设 + '_dark';
      if (THEMES.some(function (t) { return t.id === migrated; })) th = Object.assign({}, th, { 预设: migrated });
    }
    out.主题 = {
      预设: THEMES.some(function (t) { return t.id === th.预设; }) ? th.预设 : DEFAULT_THEME,
      模式: (th.模式 === 'light' || th.模式 === 'dark') ? th.模式 : '',
      强调色: ACCENTS.some(function (a) { return a.id === th.强调色; }) ? th.强调色 : '',
      面板底色: /^#[0-9a-f]{6}$/i.test(String(th.面板底色 || '')) ? th.面板底色 : '',
      卡片底色: /^#[0-9a-f]{6}$/i.test(String(th.卡片底色 || '')) ? th.卡片底色 : '',
      交互区底色: /^#[0-9a-f]{6}$/i.test(String(th.交互区底色 || '')) ? th.交互区底色 : '',
      网格: th.网格 !== false,
      暗角: clamp(num(th.暗角, 0), 0, 1),
      亮度: clamp(num(th.亮度, 1), 0.4, 1.8),
      对比度: clamp(num(th.对比度, 1), 0.4, 1.8)
    };
    var cards = (raw.卡片 && typeof raw.卡片 === 'object') ? raw.卡片 : {};
    Object.keys(cards).forEach(function (id) {
      var c = cards[id] || {};
      if (c.待设置 && !keepPending) return;      /* 旧版本存下来的占位卡，直接丢弃 */
      out.卡片[id] = {
        变量: String(c.变量 || ''),
        显示名: String(c.显示名 || c.变量 || '未命名'),
        填值说明: String(c.填值说明 || ''),
        样式: ['进度条', '文本', '是或否', '数值', '自定义文字', '图片'].indexOf(c.样式) >= 0 ? c.样式 : '文本',
        min: num(c.min, 0),
        max: num(c.max, 100),
        单位: String(c.单位 || ''),
        /* 旧版色调 id 'fem' 归到 'rose'，老布局不会炸 */
        色调: (function (id) {
          if (id === 'fem') id = 'rose';
          return TONES.some(function (t) { return t.id === id; }) ? id : 'pink';
        })(c.色调),
        图标: {
          类型: ['内置', 'emoji', '图片'].indexOf(c.图标 && c.图标.类型) >= 0 ? c.图标.类型 : '内置',
          值: String((c.图标 && c.图标.值) || '')
        },
        位置: { x: num(c.位置 && c.位置.x, 16), y: num(c.位置 && c.位置.y, 16) },
        尺寸: { w: Math.max(MIN_W, num(c.尺寸 && c.尺寸.w, 220)), h: Math.max(MIN_H, num(c.尺寸 && c.尺寸.h, 96)) },
        层级: num(c.层级, 1),
        边框色: String(c.边框色 || ''),
        边框线型: (c.边框线型 === '实线') ? '实线' : '虚线',
        圆角: c.圆角 === false ? false : true,
        待设置: !!c.待设置,
        背景色: /^#[0-9a-f]{6}$/i.test(String(c.背景色 || '')) ? c.背景色 : '',
        文字色: /^#[0-9a-f]{6}$/i.test(String(c.文字色 || '')) ? c.文字色 : '',
        /* 「自定义文字 / 图片」这两种自由卡片用的字段 */
        自定义文字: String(c.自定义文字 || ''),
        图片: String(c.图片 || ''),
        图片旋转: clamp(num(c.图片旋转, 0), -180, 180),
        字体: FONTS.some(function (f) { return f.id === c.字体; }) ? c.字体 : 'inherit',
        字号: num(c.字号, 0),                       /* 0 = 随区域大小自适应 */
        进度条粗细: clamp(num(c.进度条粗细, 8), 3, 26),
        只读: !!c.只读
      };
    });
    return out;
  }

  function saveLayout() {
    /* 还没设置的占位卡不落盘：它们只是「正在拖」的临时状态，
       存下来会让每次重新加载都冒出一堆没设好的框。 */
    var toSave = S.layout;
    try {
      var hasPending = false;
      Object.keys((S.layout && S.layout.卡片) || {}).forEach(function (id) {
        if (S.layout.卡片[id].待设置) hasPending = true;
      });
      if (hasPending) {
        toSave = JSON.parse(JSON.stringify(S.layout));
        Object.keys(toSave.卡片).forEach(function (id) {
          if (toSave.卡片[id].待设置) delete toSave.卡片[id];
        });
      }
    } catch (e) { toSave = S.layout; }
    /* 主存：酒馆助手的**聊天变量** —— 每个聊天记录各存一份，互不影响。
       这里必须「整表替换」，不能用 insertOrAssignVariables：那个是 lodash 深合并，
       删掉的卡片会被旧数据合并回来，表现就是凭空多出一张一模一样的卡。 */
    try {
      if (S.api && S.api.replaceVariables && S.api.getVariables) {
        var all = S.api.getVariables({ type: 'chat' }) || {};
        all[LAYOUT_KEY] = toSave;
        S.api.replaceVariables(all, { type: 'chat' });
      } else if (S.api && S.api.insertOrAssignVariables) {
        var patch = {}; patch[LAYOUT_KEY] = toSave;
        S.api.insertOrAssignVariables(patch, { type: 'chat' });
      }
    } catch (e) { console.warn('[可视化面板] 布局写入酒馆失败', e); }
    /* 备份：localStorage（也按聊天分开存） */
    try { global.localStorage.setItem(layoutKey(), JSON.stringify(toSave)); } catch (e) {}
    if (S.onLayoutChange) { try { S.onLayoutChange(S.layout); } catch (e) {} }
  }

  /* 当前聊天的标识：用来给 localStorage 兜底也分聊天存 */
  function chatKey() {
    try {
      var ctx = (global.SillyTavern && global.SillyTavern.getContext)
        ? global.SillyTavern.getContext() : null;
      var id = ctx && (ctx.chatId || (ctx.getCurrentChatId && ctx.getCurrentChatId()));
      if (id) return String(id);
    } catch (e) {}
    return '';
  }
  function layoutKey() {
    var cid = chatKey();
    return cid ? (LAYOUT_KEY + '@' + cid) : LAYOUT_KEY;
  }

  function readLayout() {
    try {
      if (S.api && S.api.getVariables) {
        var g = S.api.getVariables({ type: 'chat' });
        var v = g && g[LAYOUT_KEY];
        if (v && typeof v === 'object') return v;
      }
    } catch (e) { console.warn('[可视化面板] 读取布局失败', e); }
    try {
      var raw = global.localStorage.getItem(layoutKey());
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  /* ---------------- 变量读写 ---------------- */
  function loc() {
    return (typeof S.messageId === 'number' && S.messageId >= 0)
      ? { type: 'message', message_id: S.messageId }
      : { type: 'message' };
  }

  function readStat() {
    /* 读变量要深拷贝整张变量表，同一楼反复读很亏 —— 同一楼只读一次，
       真正需要刷新时（refresh / 切换楼层）用 readStat(true) 强制重读。 */
    if (!arguments[0] && S.__statMid === S.messageId && S.__statCache) return S.__statCache;
    try {
      if (S.api && S.api.getVariables) {
        var v = S.api.getVariables(loc());
        S.__statMid = S.messageId;
        S.__statCache = (v && v.stat_data) || {};
        return S.__statCache;
      }
    } catch (e) { console.warn('[可视化面板] 读取变量失败', e); }
    return S.statData || {};
  }

  function writeVar(path, value, reason) {
    if (!S.api || !S.api.replaceVariables) throw new Error('没有连接到酒馆，无法写入');
    var vars = JSON.parse(JSON.stringify(S.api.getVariables(loc()) || {}));
    var sd = vars.stat_data || (vars.stat_data = {});
    setPath(sd, path, value);
    var lg = sd.系统日志;
    if (!Array.isArray(lg)) lg = [];
    lg.push({ 内容: reason || ('玩家修改了 ' + path) });
    sd.系统日志 = lg.slice(-20);
    S.api.replaceVariables(vars, loc());
    S.statData = sd;
  }

  /* ---------------- 变量不存在就顺手建出来 ----------------
   * 填了一个这一楼还没有的变量路径时，按展示样式补个默认值，
   * 免得卡片一直显示「（无此变量）」。
   *   进度条 / 数值 → 0      文本 → 「请输入文本」      是或否 → 否
   */
  function defaultOfStyle(style) {
    if (style === '文本') return '请输入文本';
    if (style === '是或否') return false;
    return 0;                       /* 进度条 / 数值 */
  }

  function ensureVariable(c) {
    if (!c || !c.变量) return false;
    var path = String(c.变量);
    if (getPath(S.statData || {}, path) !== undefined) return false;
    var dft = defaultOfStyle(c.样式);
    if (!S.statData) S.statData = {};
    setPath(S.statData, path, dft);          /* 脱机预览（没连酒馆）时也看得见 */
    if (S.api && S.api.replaceVariables) {
      try { writeVar(path, dft, '面板新建变量「' + path + '」'); }
      catch (e) { console.warn('[可视化面板] 新建变量失败', e); }
    }
    return true;
  }

  /* 布局里声明了、但这一楼数据里没有的变量，一次性补齐（默认值随样式）。
     用户要求过：新建卡片时没这个变量就自动建。
     只在「可交互的最新楼层」补 —— 历史楼层是只读快照，不去动它的数据。 */
  function healMissingVariables(why) {
    if (S.demo || !S.api || !S.layout) return 0;
    if (S.root && S.root.getAttribute('data-vmvu-live') === '0') return 0;
    if (!S.api.replaceVariables) return 0;
    var miss = [];
    Object.keys(S.layout.卡片 || {}).forEach(function (id) {
      var c = S.layout.卡片[id];
      if (!c || c.待设置 || !c.变量) return;
      if (getPath(S.statData || {}, c.变量) !== undefined) return;
      miss.push(c);
    });
    if (!miss.length) return 0;
    try {
      var vars = JSON.parse(JSON.stringify(S.api.getVariables(loc()) || {}));
      var sd = vars.stat_data || (vars.stat_data = {});
      var lg = Array.isArray(sd.系统日志) ? sd.系统日志 : [];
      miss.forEach(function (c) {
        setPath(sd, c.变量, defaultOfStyle(c.样式));
        var note = '面板新建变量「' + c.变量 + '」' + (why ? '（' + why + '）' : '');
        /* 同一件事别每轮往系统日志里塞一遍（AI 反复把变量洗掉时日志会爆炸） */
        var last = lg.length ? String(lg[lg.length - 1].内容 || '') : '';
        if (last !== note) lg.push({ 内容: note });
      });
      sd.系统日志 = lg.slice(-20);
      S.api.replaceVariables(vars, loc());
      S.statData = sd;
      console.info('[可视化面板] 补齐了 ' + miss.length + ' 个变量：' +
        miss.map(function (c) { return c.变量; }).join('、'));
      return miss.length;
    } catch (e) { console.warn('[可视化面板] 补齐变量失败', e); return 0; }
  }

  /* ---------------- 「标记更新」：面板变量不指望卡的规则放行 ----------------
   * 有的卡把变量规则写死了（结构约束 + 「只允许写已定义字段」），AI 于是拒绝把面板变量
   * 写进 <UpdateVariable> —— 它会在分析里说「我要更新 /那个面板变量」，最后却把那条删掉。
   * 所以面板变量改走另一条路：AI 只要在末尾那行里带上改动就行
   *     {visual-mvu: 体力-5, 好感度=95}
   * 面板自己解析、自己写进变量树（直接写，不走卡的校验），也不受卡规则限制。
   * 两条保险：
   *   1) 只处理「本面板变量区绑的路径」，别的一律不碰；
   *   2) 同一路径这一轮已经出现在 <JSONPatch> 里 → 跳过（避免 AI 两边都写、加两次）。
   * 幂等：按「楼层 → 处理过的标记原文」记在 localStorage（按聊天分开），刷新后不会重复加减。
   */
  function markerStoreKey() {
    var cid = chatKey();
    return '可视化面板_标记已处理' + (cid ? ('@' + cid) : '');
  }
  function readMarkerStore() {
    try { return JSON.parse(global.localStorage.getItem(markerStoreKey()) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function saveMarkerStore(o) {
    try { global.localStorage.setItem(markerStoreKey(), JSON.stringify(o)); } catch (e) {}
  }
  function coerceMarkerValue(v) {
    var s = String(v).trim().replace(/^["'“”]|["'“”]$/g, '');
    if (s === '是' || /^true$/i.test(s)) return true;
    if (s === '否' || /^false$/i.test(s)) return false;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return s;
  }
  /* 路径写法归一化。AI 经常照抄 JSONPatch 的写法带上前导斜杠
     （{visual-mvu: /子宫.内射次数+1, /雌堕度+2}），也有人写 stat_data. 前缀，
     还有写成 /stat_data/xxx 的。这里统一剥掉，免得「路径对不上 → 判定成别人的变量 → 整条丢掉」。
     注意：只剥前后缀，不改中间的层级写法（点号分层的规则由 getPath/setPath 决定）。 */
  function normPath(p) {
    return String(p == null ? '' : p).trim()
      .replace(/^\/+/, '')
      .replace(/^stat_data\s*[.\/]?\s*/i, '')
      .replace(/^\/+/, '')
      .trim();
  }
  /* 拆开「多项改动」。不能用简单 split(/[,，;；]/)：
     文本值本身可能带逗号（服装="上衣，裙子"），那样会被从引号中间切开。
     这里做成「引号外才切」的小扫描器。 */
  function splitMarkerItems(s) {
    var out = [], cur = '', quote = null, str = String(s || '');
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      if (quote) {
        cur += ch;
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '“' || ch === '”') {
        quote = (ch === '“') ? '”' : ch;
        cur += ch;
        continue;
      }
      if (ch === ',' || ch === '，' || ch === ';' || ch === '；' || ch === '、' || ch === '\n') {
        out.push(cur); cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out;
  }
  function parseMarkerOps(payload) {
    var out = [];
    splitMarkerItems(payload).forEach(function (raw) {
      var s = String(raw).trim();
      if (!s) return;
      var m = /^([^+\-＋－=＝：:]+?)\s*([+\-＋－=＝])\s*(.+)$/.exec(s);
      if (!m) return;
      var path = normPath(m[1]);
      var op = m[2].replace('＝', '=');
      var v = m[3].trim();
      if (!path || !v) return;
      if (op === '＋') op = '+';
      else if (op === '－') op = '-';
      if (op === '+' || op === '-') {
        var n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
        if (isFinite(n)) out.push({ path: path, delta: (op === '-' ? -n : n) });
      } else {
        out.push({ path: path, value: coerceMarkerValue(v) });
      }
    });
    return out;
  }
  function jsonPatchPaths(rawText) {
    var out = {};
    var re = /<JSONPatch>([\s\S]*?)<\/JSONPatch>/gi, x;
    while ((x = re.exec(String(rawText || '')))) {
      try {
        JSON.parse(x[1].trim()).forEach(function (o) {
          if (o && o.path) out[normPath(o.path)] = 1;
        });
      } catch (e) {}
    }
    return out;
  }
  /* 返回真正写回去的条数 */
  function applyMarker(rawText, messageId) {
    if (S.demo || !S.api || !S.layout) return 0;
    if (typeof messageId === 'number' && S.messageId !== messageId) return 0;
    if (S.root && S.root.getAttribute('data-vmvu-live') === '0') return 0;
    /* 兼容两种写法：{visual-mvu: 变量+1} 和「visual-mvu 被谁吃掉后」剩下的 {: 变量+1} */
    var m = /\{\s*(?:visual[-\s]?mvu\s*)?[:：]\s*([^}]*)\}/i.exec(String(rawText || ''));
    if (!m) return 0;
    var payload = String(m[1]).trim();
    if (!payload) return 0;
    var store = readMarkerStore();
    if (store[messageId] === payload) return 0;              /* 这一楼这条标记已经处理过 */
    var ops = parseMarkerOps(payload);
    var mine = {};
    Object.keys(S.layout.卡片 || {}).forEach(function (id) {
      var c = S.layout.卡片[id];
      if (c && !c.待设置 && c.变量) {
        mine[normPath(c.变量)] = 1;
        mine[String(c.变量).trim()] = 1;      /* 变量区里写的是原样，也认 */
      }
    });
    var inPatch = jsonPatchPaths(rawText);
    var use = ops.filter(function (o) { return mine[o.path] && !inPatch[o.path]; });
    store[messageId] = payload;
    saveMarkerStore(store);
    if (!use.length) return 0;
    try {
      var vars = JSON.parse(JSON.stringify(S.api.getVariables(loc()) || {}));
      var sd = vars.stat_data || (vars.stat_data = {});
      var lg = Array.isArray(sd.系统日志) ? sd.系统日志 : [];
      var done = 0;
      use.forEach(function (o) {
        var cur = getPath(sd, o.path);
        var nv;
        if (o.value !== undefined) nv = o.value;
        else { if (cur === undefined) return; nv = num(cur, 0) + o.delta; }
        setPath(sd, o.path, nv);
        lg.push({ 内容: '面板按 AI 标记更新「' + o.path + '」→ ' + JSON.stringify(nv) });
        done++;
      });
      if (!done) return 0;
      sd.系统日志 = lg.slice(-20);
      S.api.replaceVariables(vars, loc());
      S.statData = sd;
      render();
      console.info('[可视化面板] 按 AI 标记更新了 ' + done + ' 项');
      return done;
    } catch (e) { console.warn('[可视化面板] 标记更新失败', e); return 0; }
  }

  /* ---------------- 变量清单 / 删除 ----------------
   * 危险操作页要列出「这一楼现在有哪些变量」，勾选后删除。
   * 被变量区用着的变量会一起把那个变量区删掉，否则删完卡片会显示「（无此变量）」。
   */
  function varText(v) {
    if (v === undefined) return '（无此变量）';
    var s = (v && typeof v === 'object') ? JSON.stringify(v) : String(v);
    return s.length > 28 ? (s.slice(0, 27) + '…') : s;
  }

  function listVariables() {
    var used = {};
    Object.keys(S.layout.卡片 || {}).forEach(function (id) {
      var c = S.layout.卡片[id];
      if (c.待设置 || !c.变量) return;
      (used[c.变量] = used[c.变量] || []).push(id);
    });
    var out = [], seen = {};
    (function walk(obj, prefix, depth) {
      if (!obj || typeof obj !== 'object' || depth > 3) return;
      Object.keys(obj).forEach(function (k) {
        if (k === '系统日志') return;                 /* 面板自己的日志，不列出来 */
        var v = obj[k];
        var p = prefix ? (prefix + '.' + k) : k;
        if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) {
          walk(v, p, depth + 1);
        } else if (!seen[p]) {
          seen[p] = 1;
          out.push({ path: p, text: varText(v), cards: used[p] || [] });
        }
      });
    })(S.statData || {}, '', 0);
    /* 变量区绑了、但这一楼数据里还没有的，也列出来 */
    Object.keys(used).forEach(function (p) {
      if (seen[p]) return;
      out.push({ path: p, text: '（无此变量）', cards: used[p] });
    });
    out.sort(function (a, b) { return a.path < b.path ? -1 : (a.path > b.path ? 1 : 0); });
    return out;
  }

  function deleteVariable(path) {
    /* 1) 用着它的变量区一起删掉 */
    Object.keys(S.layout.卡片 || {}).forEach(function (id) {
      if (S.layout.卡片[id].变量 === path) delete S.layout.卡片[id];
    });
    /* 2) 从这一楼的数据里删掉 */
    if (S.api && S.api.replaceVariables) {
      try {
        var vars = JSON.parse(JSON.stringify(S.api.getVariables(loc()) || {}));
        var sd = vars.stat_data || (vars.stat_data = {});
        delPath(sd, path);
        var lg = sd.系统日志;
        if (!Array.isArray(lg)) lg = [];
        lg.push({ 内容: '面板删除了变量「' + path + '」' });
        sd.系统日志 = lg.slice(-20);
        S.api.replaceVariables(vars, loc());
        S.statData = sd;
      } catch (e) { console.warn('[可视化面板] 删除变量失败', e); }
    }
    if (S.statData) delPath(S.statData, path);       /* 脱机预览 / 兜底 */
  }

  /* ---------------- 提示注入（不碰世界书） ----------------
   * 用酒馆自带的「扩展注入」把说明直接送进上下文，一本世界书都不用建：
   *   setExtensionPrompt(key, value, position, depth, scan, role)
   *   position = 1（IN_CHAT，按深度插进聊天记录）、role = 0（system）
   * 注入只活在本次会话里，所以要在「加载 / 换聊天 / 布局改动」时重新设置一次。
   * 好处：不污染世界书列表，也不会留下任何条目。 */
  var PROMPT_KEY = '可视化MVU面板_说明';
  /* 深度：0 = 紧贴最后一条消息（最强势），数字越大越靠前越容易被忽略。
     原来用的 4，AI 经常当没看见；改成 1，仍旧排在用户最后一条消息之前。 */
  var PROMPT_DEPTH = 1;

  /* 这一楼现在这个变量是多少 —— 让 AI 有个基准值，别只给它一个空路径名 */
  function currentValueOf(path) {
    try {
      var sd = S.statData;
      if (!sd) sd = readStat();
      if (!sd) return '';
      var v = getPath(sd, path);
      if (v === undefined || v === null) return '（尚未创建）';
      if (typeof v === 'string') return JSON.stringify(v.replace(/\s+/g, ' ').slice(0, 60));
      if (typeof v === 'object') {
        var j = JSON.stringify(v);
        return j.length > 80 ? (j.slice(0, 80) + '…') : j;
      }
      return String(v);
    } catch (e) { return ''; }
  }

  /* 每个变量区按「大佬那套变量更新手册」的写法展开：
     path / type / current / logic（带可直接照抄的 JSONPatch 例子）/ require */
  function zoneBlock(c) {
    /* 注意：MVU 的 JSONPatch 路径是「相对变量树根」的，直接 /好感度，
       不能带 stat_data 前缀（写成 /stat_data/好感度 会被 MVU 丢掉，面板数字就不动）。 */
    var path = '/' + c.变量;
    var type = c.样式 === '进度条'
      ? ('number（进度条 ' + c.min + '~' + c.max + (c.单位 ? c.单位 : '') + '）')
      : (c.样式 === '数值'
        ? ('number' + (c.单位 ? '（单位 ' + c.单位 + '）' : ''))
        : (c.样式 === '是或否' ? 'boolean（true=是 / false=否）' : 'string（文本）'));
    var logic;
    if (c.样式 === '进度条' || c.样式 === '数值') {
      logic = '增减用 delta，例 { "op":"delta","path":"' + path + '","value":-5 }；' +
              '整值重设用 replace，例 { "op":"replace","path":"' + path + '","value":0 }';
    } else if (c.样式 === '是或否') {
      logic = '用 replace，例 { "op":"replace","path":"' + path + '","value":true }';
    } else {
      logic = '用 replace，例 { "op":"replace","path":"' + path + '","value":"新的内容" }';
    }
    var s = '- path: ' + path + '\n' +
            '  type: ' + type + '\n';
    var cur = currentValueOf(c.变量);
    if (cur !== '') s += '  current: ' + cur + '\n';
    s += '  logic: ' + logic + '\n';
    if (c.填值说明) s += '  require: ' + String(c.填值说明).replace(/\n/g, ' ');
    return s.replace(/\s+$/, '');
  }

  function promptTextFor() {
    var lines = [];
    Object.keys(S.layout.卡片 || {}).forEach(function (id) {
      var c = S.layout.卡片[id];
      if (c.待设置 || !c.变量) return;          /* 还没配好的变量区不算 */
      lines.push(zoneBlock(c));
    });
    var alwaysOn = (S.layout.始终注入 !== false);
    /* 关掉「始终注入」、而且这个聊天里还没有变量区 → 什么都不注入 */
    if (!lines.length && !alwaysOn) return '';
    var s = '【可视化 MVU 面板 · 变量更新手册】\n' +
            '本手册与卡内「变量更新规则」「变量输出格式」同等生效，必须执行。\n';
    if (lines.length) {
      s += '\n一、本轮要维护的变量（都是 stat_data 的正式字段，不是未定义字段）\n' +
           lines.join('\n') + '\n' +
           '\n二、执行要求\n' +
           '1. 每轮回复的 <UpdateVariable> → <JSONPatch> 里，把上面「本轮发生了变化」的变量按各自的 logic 写进去；没变化的不写。\n' +
           '2. path 必须与上面一字不差，且**直接以 / 开头**（相对变量树根，例如 /好感度）；不要加 stat_data 前缀、不要加引号，也不要改动已有字段的层级。\n' +
           '   （历史回复里若出现过 /stat_data/xxx 这种写法，那是错的，不要照抄。）\n' +
           '3. 数值只在 JSONPatch 里更新，正文里不要复述数字，也不要等用户提醒。\n';
    }
    s += '\n' + (lines.length ? '三' : '一') + '、面板标记（必须是整条回复的最后一行）\n' +
         '单独一行输出，面板靠这一行显示，也靠这一行接收变量改动：\n' +
         '· 本轮上面那些变量没有变化 → 只写：' + PANEL_TRIGGER + '\n' +
         '· 有变化 → 把改动写进同一个花括号，多项用英文逗号分隔：{visual-mvu: 体力-5, 好感度=95}\n' +
         '  （路径写变量名就行，带不带前导 / 都认；不要写 stat_data 前缀）\n' +
         '  数字增减用 +N / -N；整值用 =值；文本用 ="内容"；是或否用 =是 / =否\n' +
         '  没变化就不要写这一项，也不要写「=当前值」这种空操作（本来就没动）\n' +
         '  上面这些面板变量优先写在这一行里；已经写进 <UpdateVariable> 的就不要再写一遍\n' +
         '· 这一行不会显示给用户，也不要放进代码块、不要加别的符号、不要重复输出。\n';
    return s;
  }

  /* 把说明注入上下文（没有变量区就注入空串 = 清掉） */
  function applyPrompt() {
    if (S.demo) return false;
    var ctx = null;
    try {
      ctx = (global.SillyTavern && global.SillyTavern.getContext)
        ? global.SillyTavern.getContext() : null;
    } catch (e) {}
    var setPrompt = (ctx && ctx.setExtensionPrompt) ||
                    (S.api && S.api.setExtensionPrompt) || null;
    if (typeof setPrompt !== 'function') {
      console.warn('[可视化面板] 这份酒馆没有 setExtensionPrompt，说明注入不了（本扩展不会去写世界书）');
      return false;
    }
    var text = promptTextFor();
    try {
      setPrompt(PROMPT_KEY, text, 1, PROMPT_DEPTH, false, 0);
      console.info('[可视化面板] 说明已注入上下文' + (text ? '' : '（按开关关掉了）') +
        (text ? ('｜' + BUILD + '｜' + text.replace(/\s+/g, ' ').slice(0, 90) + '…') : ''));
      return true;
    } catch (e) { console.warn('[可视化面板] 说明注入失败', e); return false; }
  }

  /* 对外沿用旧名字：所有调用点都还叫 syncWorldBook */
  function syncWorldBook() { return applyPrompt(); }

  /* ---------------- 清理面板以前写进世界书的内容 ----------------
   * 现在不写世界书了；这个函数负责把以前写过的条目删掉，
   * 并把面板自动建的那本空书一起删掉。只在发现「确实是我们写的条目」时才动世界书。 */
  function isOurEntry(e) {
    var nm = wbEntryName(e);
    if (nm.indexOf('[面板]') === 0) return true;
    if (nm) return false;
    var ct = String((e && e.content) || '');
    return ct === '（当前没有交互区）' ||
           ct.indexOf('【面板显示开关】') >= 0 ||
           ct.indexOf('当前交互区（你需要在本轮') >= 0;
  }

  async function cleanupWorldbook(alsoDeleteBooks) {
    var out = { removed: 0, deleted: [] };
    if (!(S.api && S.api.getWorldbookNames && S.api.getWorldbook && S.api.updateWorldbookWith)) return out;
    var names = [];
    try { names = S.api.getWorldbookNames() || []; } catch (e) { return out; }
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      try {
        var list = (await S.api.getWorldbook(n)) || [];
        var ours = list.filter(isOurEntry).length;
        var autoBook = (n === WB_NAME || /^Chat_Book_/i.test(n));
        if (ours) {
          await S.api.updateWorldbookWith(n, function (arr) {
            return (arr || []).filter(function (e) { return !isOurEntry(e); });
          });
          out.removed += ours;
          console.info('[可视化面板] 已从「' + n + '」清掉 ' + ours + ' 条面板写过的条目');
        }
        /* 清完就空了、而且这本本来就是面板自动建的 → 连书一起删 */
        if (alsoDeleteBooks && autoBook && (list.length - ours) === 0 && S.api.deleteWorldbook) {
          await S.api.deleteWorldbook(n);
          out.deleted.push(n);
          console.info('[可视化面板] 已删除面板自动建的世界书「' + n + '」');
        }
      } catch (e) { console.warn('[可视化面板] 清理「' + n + '」失败', e); }
    }
    return out;
  }

  /* ---------------- 世界书同步 ----------------
   * 每个「设置好的变量区」一条独立条目（标题带 [面板] 前缀），
   * 再加一条共享的「显示开关」条目 —— 新建一个变量就多一条，
   * 不会一上来把一堆东西塞进同一段里。
   * 改过名 / 删掉的变量区，它的旧条目会在下次同步时被清掉。 */
  var WB_NAME = '可视化mvu';                 /* 自动创建的世界书叫这个 */
  var WB_PREFIX = '[面板]';
  var WB_MARK_TITLE = WB_PREFIX + '显示开关';

  function zoneTitleOf(c) {
    var n = String((c && (c.显示名 || c.变量)) || '').trim() || '未命名';
    return WB_PREFIX + n;
  }
  function zoneContentOf(c) {
    var t = c.样式 === '进度条'
      ? ('进度条 ' + c.min + '~' + c.max + (c.单位 ? c.单位 : ''))
      : (c.样式 + (c.单位 ? '（单位 ' + c.单位 + '）' : ''));
    var s = '/' + c.变量 + '　【' + t + '】\n';
    s += '已并入本卡的「变量更新规则」，是 stat_data 的正式字段，不是未定义字段。\n';
    s += '每轮回复都要按本轮剧情核对；变化了就写回，没变的不写。\n';
    s += '写法：整条回复最末尾的 <UpdateVariable> → <JSONPatch>，path 直接写 /' + c.变量 + '（相对变量树根，不要加 stat_data 前缀）。\n';
    if (c.填值说明) s += '填写要求：' + String(c.填值说明).replace(/\n/g, ' ');
    return s;
  }
  function markerContent() {
    return '<UpdateVariable> 写完之后，在整条回复的最末尾、单独一行、原样输出 ' + PANEL_TRIGGER + '\n' +
           '· 不要放进代码块，不要加引号、括号或其它符号，不要改动字符，不要重复输出。';
  }
  /* 这次同步要保证存在哪些条目：{ 标题: 内容 } */
  function worldbookPlan() {
    var plan = {};
    Object.keys(S.layout.卡片 || {}).forEach(function (id) {
      var c = S.layout.卡片[id];
      if (c.待设置 || !c.变量) return;          /* 还没配好的变量区不写 */
      plan[zoneTitleOf(c)] = zoneContentOf(c);
    });
    if (Object.keys(plan).length) plan[WB_MARK_TITLE] = markerContent();
    return plan;
  }

  /* 只找、不建：角色绑定 → 聊天绑定 */
  async function findWorldbookName() {
    function pick(x) {
      if (!x) return '';
      if (typeof x === 'string') return x;
      return x.primary || (x.additional && x.additional[0]) || '';
    }
    try {
      if (S.api.getCharWorldbookNames) {
        var n1 = pick(S.api.getCharWorldbookNames('current'));
        if (n1) return n1;
      }
    } catch (e) {}
    try {
      if (S.api.getCharLorebooks) {
        var n2 = pick(await S.api.getCharLorebooks());
        if (n2) return n2;
      }
    } catch (e) {}
    try {
      if (S.api.getChatWorldbookName) {
        var n3 = S.api.getChatWorldbookName('current');
        if (n3) return n3;
      }
    } catch (e) {}
    return '';
  }

  /* 找一本能写的世界书；一本都没有就建「可视化mvu」并绑到当前聊天。
     以前只认「角色绑定」，不少卡的世界书是全局选中的，
     于是这里直接 return，一个字都没写进去。 */
  async function resolveWorldbookName() {
    var name = await findWorldbookName();
    /* 之前兜底建的那本叫 Chat_Book_<聊天名>，顺手切到「可视化mvu」 */
    if (name && /^Chat_Book_/i.test(name) &&
        S.api.getOrCreateChatWorldbook && S.api.rebindChatWorldbook) {
      try {
        var better = await S.api.getOrCreateChatWorldbook('current', WB_NAME);
        if (better) {
          if (better !== name) {
            await S.api.rebindChatWorldbook('current', better);
            console.info('[可视化面板] 世界书切到「' + better + '」（旧的 ' + name + ' 没删，可在危险操作里删）');
          }
          return better;
        }
      } catch (e) {}
    }
    if (name) return name;
    try {
      if (S.api.getOrCreateChatWorldbook) {
        return await S.api.getOrCreateChatWorldbook('current', WB_NAME);
      }
    } catch (e) { console.warn('[可视化面板] 建聊天世界书失败', e); }
    return '';
  }

  /* 酒馆助手 4.x 的世界书条目结构和 ST 原始格式不一样：
       它：name / enabled / strategy{...} / position{type,role,depth,order}
       ST：comment / disable / constant / position(数字) / depth / order
     早先只按 ST 的字段写，结果标题被写成空、下次同步又认不出来（会重复加条目）。
     这里两种都读、两种都写。 */
  function wbEntryName(e) {
    if (!e) return '';
    if (typeof e.name === 'string' && e.name) return e.name;
    return String(e.comment || '');
  }
  function wbIsNormalized(entries) {
    if (entries && entries.length) {
      var p = entries[0] && entries[0].position;
      return !!(p && typeof p === 'object');
    }
    /* 空书：看环境 —— 只有 4.x 才有这些接口，那就按它的结构写 */
    return !!(S.api && (S.api.getChatWorldbookName || S.api.getCharWorldbookNames ||
                        S.api.getOrCreateChatWorldbook));
  }
  function wbApplyEntry(e, content, normalized) {
    e.content = content;
    if (normalized) {
      e.enabled = true;
      e.strategy = Object.assign(
        { keys: [], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
        e.strategy, { type: 'constant' });
      e.position = Object.assign({ role: 'system', depth: 4, order: 100 },
        e.position, { type: 'at_depth' });
    } else {
      e.constant = true; e.disable = false;
      e.position = 4; e.depth = 4; e.order = 100;   /* 放进深度提示，AI 更认 */
    }
  }
  function wbMakeEntry(title, content, normalized) {
    if (normalized) {
      return {
        name: title,
        enabled: true,
        strategy: { type: 'constant', keys: [], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
        position: { type: 'at_depth', role: 'system', depth: 4, order: 100 },
        content: content,
        probability: 100,
        recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
        effect: { sticky: null, cooldown: null, delay: null }
      };
    }
    return {
      comment: title, content: content, constant: true, disable: false,
      position: 4, order: 100, key: [], keysecondary: [], depth: 4,
      selective: false, selectiveLogic: 0, probability: 100, useProbability: true,
      addMemo: true, excludeRecursion: false, preventRecursion: false, vectorized: false
    };
  }

  /* 旧的世界书写入逻辑：保留备查，但已经没有人调用它（改用上面的扩展注入了） */
  async function syncWorldBookLegacy() {
    if (!S.api) return '';
    var plan = worldbookPlan();
    try {
      if (S.api.getWorldbook && S.api.updateWorldbookWith) {
        var name = await resolveWorldbookName();
        if (!name) { console.warn('[可视化面板] 没找到可写的世界书，变量说明写不进去'); return ''; }
        await S.api.updateWorldbookWith(name, function (entries) {
          entries = entries || [];
          var normalized = wbIsNormalized(entries);
          var seen = {};
          var out = [];
          entries.forEach(function (e) {
            var nm = wbEntryName(e);
            if (nm.indexOf(WB_PREFIX) === 0) {
              /* 我们写的条目：不在本轮计划里（变量区改名/删掉了）或重复的，丢掉 */
              if (!plan[nm] || seen[nm]) return;
              seen[nm] = 1;
              wbApplyEntry(e, plan[nm], normalized);
              out.push(e);
              return;
            }
            /* 早先写歪的、没标题的残留也清掉 */
            var ct = String((e && e.content) || '');
            if (!nm && (ct === '（当前没有交互区）' ||
                        ct.indexOf('【面板显示开关】') >= 0 ||
                        ct.indexOf('当前交互区（你需要在本轮') >= 0)) return;
            out.push(e);
          });
          Object.keys(plan).forEach(function (t) {
            if (seen[t]) return;
            out.push(wbMakeEntry(t, plan[t], normalized));
          });
          return out;
        });
        console.info('[可视化面板] 世界书已同步 →「' + name + '」（' + Object.keys(plan).length + ' 条）');
        return name;
      }
    } catch (e) { console.warn('[可视化面板] 世界书同步失败', e); }
    return '';
  }

  /* ---------------- 主题 ---------------- */
  /* ---------------- 主题计算 ----------------
   * 旧版主题 id（peach / amber…）会自动归到「浓」派，保证老布局不炸。 */
  function themeOf(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    /* 兼容旧 id：当它是浓派 */
    for (var j = 0; j < THEMES.length; j++) if (THEMES[j].id === id + '_dark') return THEMES[j];
    return THEMES[0];
  }

  function isDarkTheme() { return themeOf(S.layout.主题.预设).mode === 'dark'; }

  /* 把 #rrggbb 调暗或调亮，用于推导次色 */
  function shiftColor(hex, amt) {
    var m = /^#?([\da-f]{6})$/i.exec(String(hex || ''));
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    var r = clamp(((n >> 16) & 255) + amt, 0, 255);
    var g = clamp(((n >> 8) & 255) + amt, 0, 255);
    var b = clamp((n & 255) + amt, 0, 255);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  /* ---- 颜色对比工具：按钮不能和背景一个颜色 ---- */
  function hexToRgb(h) {
    var m = /^#?([\da-f]{6})$/i.exec(String(h || ''));
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function relLum(c) {
    function ch(v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }

  /* WCAG 对比度，返回 1~21 */
  function contrastRatio(c1, c2) {
    var a = relLum(c1), b = relLum(c2);
    var hi = Math.max(a, b), lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }

  /* 取元素实际渲染出来的背景色（沿祖先往上找到第一个不透明的，兜底用面板底色） */
  function effectiveBg(el2) {
    var node = el2;
    while (node && node.nodeType === 1) {
      var bg = getComputedStyle(node).backgroundColor;
      var m = /rgba?\(([^)]+)\)/.exec(bg || '');
      if (m) {
        var p = m[1].split(',').map(function (x) { return parseFloat(x); });
        var a = (p.length > 3) ? p[3] : 1;
        if (a > 0.55) return { r: p[0], g: p[1], b: p[2] };
      }
      node = node.parentElement;
    }
    return { r: 250, g: 249, b: 245 };
  }

  /* 把强调色调到与背景至少拉开 minRatio 的对比度（保持色相，必要时往黑白方向走） */
  function ensureContrast(accentHex, bg, minRatio) {
    minRatio = minRatio || 2.4;
    var base = hexToRgb(accentHex);
    if (!base) return accentHex;
    if (contrastRatio(base, bg) >= minRatio) return accentHex;
    /* 判断背景亮暗，决定往白还是往黑调 */
    var toWhite = relLum(bg) < 0.45;
    for (var i = 1; i <= 20; i++) {
      var amt = Math.round(i * 12);
      var tryHex = toWhite ? shiftColor(accentHex, amt) : shiftColor(accentHex, -amt);
      var c = hexToRgb(tryHex);
      if (c && contrastRatio(c, bg) >= minRatio) return tryHex;
    }
    return toWhite ? '#ffffff' : '#000000';
  }

  /* 按钮/主色：既保证和背景有区分，又保证文字在它上面看得清。
   * 直接用主题的底色算，不读 DOM —— applyTheme 可能在面板插入文档之前就被调用。 */
  function applyAccentContrast(accentHex, panelHex) {
    if (!S.root) return;
    var bg = hexToRgb(panelHex) || effectiveBg(S.root);
    var btnBg = ensureContrast(accentHex, bg, 2.4);
    var c = hexToRgb(btnBg) || { r: 217, g: 119, b: 87 };
    /* 按钮文字取黑/白里对比更高的那个 */
    var white = { r: 255, g: 255, b: 255 }, black = { r: 20, g: 20, b: 19 };
    var onBtn = contrastRatio(c, white) >= contrastRatio(c, black) ? '#ffffff' : '#141413';
    var set = function (k, v) { S.root.style.setProperty(k, v); };
    set('--vm-btn-bg', btnBg);
    set('--vm-btn-fg', onBtn);
    set('--vm-accent-soft', 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0.14)');
    /* 危险按钮（红）也要和背景分得开 */
    var danger = ensureContrast('#c0503f', bg, 2.6);
    set('--vm-danger-fg', danger);
    var dc = hexToRgb(danger) || { r: 192, g: 80, b: 63 };
    set('--vm-danger-border', 'rgba(' + dc.r + ',' + dc.g + ',' + dc.b + ',0.5)');
  }

  var darkThemeCache = {};
  function effectiveDarkTheme() {
    if (!darkThemeCache.dark) {
      darkThemeCache.dark = {
        id: 'custom_dark', label: '自定义', mode: 'dark', accent: '#d97757',
        panel: '#1a1917', canvas: '#100f0e', card: '#26241f', bar: '#2b2823',
        ink: '#d8d3c8', inkStrong: '#f5f2ea', line: 'rgba(255,255,255,0.12)'
      };
    }
    return darkThemeCache.dark;
  }

  /* 根据「当前主题」+ 独立覆盖项，算出最终生效的一套颜色 */
  function resolveTheme() {
    var th = S.layout.主题;
    var t = themeOf(th.预设);
    var dark = t.mode === 'dark';

    /* 1) 切到浓派时，若主题本身是淡派：反推出一个同色相的深色版 */
    if (th.模式 === 'dark' && t.mode === 'light') {
      t = {
        id: t.id + '_auto', label: t.label, mode: 'dark', accent: t.accent,
        panel: shiftColor(t.panel, -225),
        canvas: shiftColor(t.canvas, -232),
        card: shiftColor(t.card, -220),
        bar: shiftColor(t.bar, -218),
        ink: shiftColor(t.ink, 150),
        inkStrong: shiftColor(t.inkStrong, 230),
        line: 'rgba(255,255,255,0.12)'
      };
      dark = true;
    }
    /* 2) 切到淡派时，若主题本身是浓派：反推一个浅色版 */
    if (th.模式 === 'light' && t.mode === 'dark') {
      t = {
        id: t.id + '_auto', label: t.label, mode: 'light', accent: t.accent,
        panel: shiftColor(t.panel, 225),
        canvas: shiftColor(t.canvas, 228),
        card: '#ffffff',
        bar: shiftColor(t.bar, 210),
        ink: '#3d3d3a',
        inkStrong: '#141413',
        line: 'rgba(20,20,19,0.10)'
      };
      dark = false;
    }

    var out = {
      mode: dark ? 'dark' : 'light',
      accent: t.accent,
      panel: th.面板底色 || t.panel,
      canvas: th.交互区底色 || t.canvas,
      card: th.卡片底色 || t.card,
      bar: t.bar,
      ink: dark ? '#d8d3c8' : '#3d3d3a',
      inkStrong: dark ? '#f5f2ea' : '#141413',
      line: dark ? 'rgba(255,255,255,0.12)' : 'rgba(20,20,19,0.10)'
    };
    /* 3) 单色强调色覆盖 */
    if (th.强调色) {
      for (var i = 0; i < ACCENTS.length; i++) {
        if (ACCENTS[i].id === th.强调色 && ACCENTS[i].css) out.accent = ACCENTS[i].css;
      }
    }
    return out;
  }
  /* 带一点动画地应用主题：切换色派 / 主题色时用，平时直接调 applyTheme */
  var themeAnimTimer = null;
  function applyThemeAnimated() {
    if (S.root) {
      S.root.classList.add('vm-theme-switching');
      if (themeAnimTimer) clearTimeout(themeAnimTimer);
      themeAnimTimer = setTimeout(function () {
        if (S.root) S.root.classList.remove('vm-theme-switching');
      }, 460);
    }
    applyTheme();
  }
  function applyTheme() {
    if (!S.root || !S.layout) return;
    var c = resolveTheme();
    var set = function (k, v) { S.root.style.setProperty(k, v); };
    set('--vm-accent', c.accent);
    set('--vm-accent-deep', shiftColor(c.accent, c.mode === 'dark' ? 22 : -22));
    set('--vm-panel-bg', c.panel);
    set('--vm-panel-bar', c.bar);
    set('--vm-canvas-bg', c.canvas);
    /* 暗角：把强度算成 rgba 直接给 CSS，省掉 color-mix 的解析与合成开销 */
    var vigA = clamp(num(S.layout.主题.暗角, 0), 0, 1) * 0.55;
    set('--vm-vignette-rgba', c.mode === 'dark'
      ? 'rgba(0,0,0,' + vigA.toFixed(3) + ')'
      : 'rgba(107,90,78,' + vigA.toFixed(3) + ')');
    /* 卡片 */
    set('--vm-card-bg', c.card);
    set('--vm-card-dash', c.accent);
    set('--vm-card-ink', c.ink);
    set('--vm-card-ink-strong', c.inkStrong);
    set('--vm-card-line', c.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(217,119,87,0.24)');
    /* 界面文字：浓派用浅字，淡派用深字 */
    if (c.mode === 'dark') {
      set('--vm-text', '#e8e4dc');
      set('--vm-text-dim', '#a8a29a');
      set('--vm-text-faint', '#7a746c');
      set('--vm-glass-bg', 'rgba(26,25,23,0.62)');
      set('--vm-glass-border', 'rgba(255,255,255,0.16)');
      set('--vm-input-bg', 'rgba(255,255,255,0.06)');
      set('--vm-input-border', 'rgba(255,255,255,0.14)');
    } else {
      set('--vm-text', '#2f2f2c');
      set('--vm-text-dim', '#767470');
      set('--vm-text-faint', '#a3a09a');
      set('--vm-glass-bg', 'rgba(255,255,255,0.72)');
      set('--vm-glass-border', 'rgba(20,20,19,0.10)');
      set('--vm-input-bg', 'rgba(20,20,19,0.04)');
      set('--vm-input-border', 'rgba(20,20,19,0.12)');
    }
    /* 界面字体（面板设置里可切换） */
    var uf = null;
    for (var fi2 = 0; fi2 < FONTS.length; fi2++) {
      if (FONTS[fi2].id === S.layout.界面字体) uf = FONTS[fi2];
    }
    if (uf && uf.css) set('--vm-font', uf.css + ', ui-sans-serif, system-ui, sans-serif');
    else set('--vm-font', 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif');
    S.theme = c;
    /* 按钮 / 主色不能和背景撞色：按主题底色算对比度后自动调整 */
    applyAccentContrast(c.accent, c.panel);
    /* 整体亮度 / 对比度：浅色主题嫌刺眼就压亮度，灰蒙蒙就把对比度拉高。
       挂在 root 上的 filter 只影响面板自己（设置弹窗在 body 上，不受影响）。 */
    var br = clamp(num(S.layout.主题.亮度, 1), 0.4, 1.8);
    var ct = clamp(num(S.layout.主题.对比度, 1), 0.4, 1.8);
    var filt = (Math.abs(br - 1) > 0.001 || Math.abs(ct - 1) > 0.001)
      ? ('brightness(' + br.toFixed(3) + ') contrast(' + ct.toFixed(3) + ')')
      : '';
    S.root.style.filter = filt;
    /* 别的楼层也挂着面板（历史楼层），它们的亮度/对比度一起跟上 */
    try {
      var others = document.querySelectorAll('.vmvu-mount');
      for (var oi = 0; oi < others.length; oi++) {
        if (others[oi] !== S.root) others[oi].style.filter = filt;
      }
    } catch (e) {}
    syncOverlayTheme();          /* 弹窗挂在 body 上，主题变量要同步过去 */
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    if (!S.root || !S.layout) return;
    try {
      renderInner();
    } catch (err) {
      /* 渲染中途抛错会留下一个空面板，这里兜住并打印真实堆栈，方便定位 */
      console.error('[可视化面板] 渲染失败', err);
      try {
        if (S.root && !S.root.childElementCount) {
          S.root.appendChild(el('div', 'vm-render-error',
            '面板渲染出错：' + esc(err && err.message ? err.message : String(err)) +
            '<br><span style="opacity:.7">按 F12 看 Console 里的完整堆栈</span>'));
        }
      } catch (e2) {}
    }
  }

  function renderInner() {
    /* 只清掉面板本身，保留设置弹窗（弹窗也挂在 root 下，一起清会把它关掉） */
    var _old = S.root.querySelector('.vm-panel');
    if (_old && _old.parentNode) _old.parentNode.removeChild(_old);

    /* 只有「最新一条 AI 回复」那块是可交互的；旧楼层只读（历史快照） */
    var isLive = S.root.getAttribute('data-vmvu-live') !== '0';

    var panel = el('div', 'vm-panel');

    /* 顶栏 */
    var top = el('div', 'vm-topbar');
    top.appendChild(el('span', 'vm-title', '可视化面板'));
    top.appendChild(el('span', 'vm-title-hint', isLive ? '拖拽空白处新建' : '历史楼层 · 只读'));
    top.appendChild(el('span', 'vm-topbar-spacer'));
    var gear = el('div', 'vm-red-btn vm-gear', GEAR_SVG);
    gear.title = '面板设置';
    gear.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    gear.addEventListener('click', function (e) { e.stopPropagation(); openPanelSettings(); });
    if (!isLive) gear.style.display = 'none';       /* 旧楼层不给开设置（设置是全局的，点到别的楼层会让人迷惑） */
    top.appendChild(gear);
    panel.appendChild(top);

    /* 交互区（外层负责裁剪，内层放卡片 + 自绘滚动条） */
    var canvas = el('div', 'vm-canvas' + (S.layout.主题.网格 ? '' : ' vm-nogrid'));
    canvas.style.height = S.layout.交互区高度 + 'px';
    var layer = el('div', 'vm-layer');
    layer.style.transform = 'translateY(' + S.scrollY + 'px)';
    canvas.appendChild(layer);

    /* 旧楼层不画「还没设置的占位框」：那种框只有在当前楼层编辑时才有意义 */
    var ids = Object.keys(S.layout.卡片).filter(function (id) {
      return isLive || !S.layout.卡片[id].待设置;
    });
    if (!ids.length) {
      canvas.appendChild(el('div', 'vm-empty',
        '<div><b>在空白处按住鼠标左键拖动</b></div><div>松手即可新建一个变量区</div>'));
    }
    ids.forEach(function (id) { layer.appendChild(buildCard(id, S.layout.卡片[id])); });

    /* 自绘滚动条：贴在交互区最右侧 */
    var track = el('div', 'vm-scroll-track');
    var thumb = el('div', 'vm-scroll-thumb');
    track.appendChild(thumb);
    canvas.appendChild(track);
    S.scrollTrack = track;
    S.scrollThumb = thumb;

    panel.appendChild(canvas);
    S.root.insertBefore(panel, S.root.firstChild);
    S.canvas = canvas;
    S.layer = layer;

    refreshFlushBorders(layer);
    bindCanvas(canvas, layer);
    bindScrollbar(canvas, layer, track, thumb);
    bindFitObserver();
    applyTheme();
    /* 首次渲染时画布可能还没完成布局（clientHeight = 0），
       那时算出来的「不需要滚动条」是错的，所以插入 DOM 后再补算几次 */
    updateScrollbar();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () { updateScrollbar(); });
    }
    setTimeout(updateScrollbar, 60);
    setTimeout(updateScrollbar, 300);
  }

  /* ---------------- 自绘滚动条 ----------------
   * 滚轮功能保留，右侧多一条可拖的滚动条。 */
  function contentHeight() {
    var h = 0;
    if (!S.layer) return 0;
    $$('.vm-card', S.layer).forEach(function (c) {
      h = Math.max(h, num(c.style.top.replace('px', ''), 0) + num(c.style.height.replace('px', ''), 0));
    });
    return h;
  }

  function maxScroll() {
    if (!S.canvas) return 0;
    return Math.min(0, S.canvas.clientHeight - contentHeight() - 16);
  }

  function setScroll(v) {
    var lo = maxScroll();
    var next = clamp(v, lo, 0);
    S.scrollY = next;
    if (S.layer) S.layer.style.transform = 'translateY(' + next + 'px)';
    updateScrollbar();
  }

  function updateScrollbar() {
    if (!S.canvas || !S.scrollTrack || !S.scrollThumb) return;
    var lo = maxScroll();
    if (lo >= 0) {                       /* 内容没超高：藏起滚动条 */
      S.scrollTrack.style.setProperty('display', 'none', 'important');
      return;
    }
    S.scrollTrack.style.setProperty('display', 'block', 'important');
    var viewH = S.canvas.clientHeight;
    var contH = contentHeight();
    var trackH = viewH - 12;
    var thumbH = Math.max(28, trackH * (viewH / contH));
    var range = trackH - thumbH;
    var ratio = lo === 0 ? 0 : (S.scrollY / lo);   /* 0..1 */
    S.scrollThumb.style.height = thumbH + 'px';
    S.scrollThumb.style.transform = 'translateY(' + (range * ratio).toFixed(1) + 'px)';
  }

  function bindScrollbar(canvas, layer, track, thumb) {
    var dragging = false, startY = 0, startScroll = 0;

    thumb.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      startY = e.clientY;
      startScroll = S.scrollY;
      thumb.classList.add('dragging');
    });

    /* 点轨道空白：翻页 */
    track.addEventListener('mousedown', function (e) {
      if (e.target === thumb) return;
      e.preventDefault();
      e.stopPropagation();
      var r = track.getBoundingClientRect();
      var viewH = canvas.clientHeight;
      setScroll(S.scrollY + (e.clientY < r.top + r.height / 2 ? viewH * 0.85 : -viewH * 0.85));
    });

    function onMove(e) {
      if (!dragging) return;
      var viewH = canvas.clientHeight;
      var contH = contentHeight();
      var lo = maxScroll();
      if (lo >= 0) return;
      var trackH = viewH - 12;
      var thumbH = Math.max(28, trackH * (viewH / contH));
      var range = trackH - thumbH;
      if (range <= 0) return;
      var delta = (e.clientY - startY) / range;      /* 0..1 的比例变化 */
      setScroll(startScroll + delta * lo);
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      thumb.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    thumb.addEventListener('mousedown', function () {
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  /* 待设置的占位卡片：拖完不弹窗，先让用户点它 */
  function buildPendingCard(id, cfg) {
    var card = el('div', 'vm-card vm-pending');
    card.setAttribute('data-id', id);
    card.style.left = cfg.位置.x + 'px';
    card.style.top = cfg.位置.y + 'px';
    card.style.width = cfg.尺寸.w + 'px';
    card.style.height = cfg.尺寸.h + 'px';
    card.style.zIndex = String(cfg.层级 || 1);
    card.title = '点击设置这个变量区';

    var hint = el('div', 'vm-pending-hint',
      '<span class="vm-pending-plus">＋</span><span>点击此处设置</span>');
    card.appendChild(hint);

    /* 右下角齿轮同样能开设置 */
    var g = el('div', 'vm-card-gear', GEAR_SVG);
    g.title = '设置这个变量区';
    g.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    g.addEventListener('click', function (e) {
      e.stopPropagation();
      openCardSettings(null, true, { 位置: cfg.位置, 尺寸: cfg.尺寸, 占位id: id });
    });
    card.appendChild(g);

    /* 还没设置的卡片：右下角多一个垃圾桶，点了直接删，不弹确认 */
    var del = el('div', 'vm-card-del', TRASH_SVG);
    del.title = '删掉这个变量区';
    del.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      delete S.layout.卡片[id];
      saveLayout(); render(); syncWorldBook();
    });
    card.appendChild(del);

    ['e', 's', 'se'].forEach(function (dir) {
      var h = el('div', 'vm-handle ' + dir);
      h.addEventListener('mousedown', function (e) {
        e.stopPropagation(); e.preventDefault();
        bringToFront(id, cfg);
        startResize(e, id, cfg, dir);
      });
      card.appendChild(h);
    });

    card.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      bringToFront(id, cfg);
      if (e.target.closest && e.target.closest('.vm-card-gear, .vm-handle')) return;
      e.stopPropagation();
      e.preventDefault();
      startMove(e, id, cfg);
    });

    /* 点一下（没拖动）才打开设置；拖着挪位置/改大小时松手不弹（拖动会顺带触发 click） */
    card.addEventListener('click', function (e) {
      if (suppressNextClick) { suppressNextClick = false; return; }
      if (e.target.closest && e.target.closest('.vm-card-gear')) return;
      e.stopPropagation();
      openCardSettings(null, true, {
        位置: cfg.位置,
        尺寸: cfg.尺寸,
        占位id: id
      });
    });

    return card;
  }

  function buildCard(id, cfg) {
    /* 刚拖出来的待设置卡片：只显示「点击此处设置」，点了才开设置 */
    if (cfg.待设置) return buildPendingCard(id, cfg);

    var card = el('div', 'vm-card');
    card.setAttribute('data-id', id);
    card.style.left = cfg.位置.x + 'px';
    card.style.top = cfg.位置.y + 'px';
    card.style.width = cfg.尺寸.w + 'px';
    card.style.height = cfg.尺寸.h + 'px';
    card.style.zIndex = String(cfg.层级 || 1);
    if (cfg.边框色) card.style.setProperty('--vm-card-dash', cfg.边框色);
    /* 边框线型：实线 / 虚线 */
    card.style.setProperty('--vm-card-border-style', cfg.边框线型 === '实线' ? 'solid' : 'dashed');
    /* 圆角开关 */
    card.style.setProperty('--vm-card-radius', cfg.圆角 === false ? '0' : '14px');
    if (cfg.背景色) card.style.setProperty('--vm-card-bg', cfg.背景色);
    /* 每个变量区可以单独指定文字颜色（浅底 / 深底都能调清楚） */
    if (cfg.文字色) {
      card.style.setProperty('--vm-card-ink', cfg.文字色);
      card.style.setProperty('--vm-card-ink-strong', cfg.文字色);
    }
    /* 卡片底色会自动跟随：边框色没单独设时，用卡片底色的对比色当虚线颜色，
       免得「白框白底」看不见 */
    if (!cfg.边框色 && cfg.背景色) {
      var cardBgRgb = hexToRgb(cfg.背景色);
      if (cardBgRgb) {
        var autoDash = ensureContrast(resolveTheme().accent, cardBgRgb, 2.2);
        card.style.setProperty('--vm-card-dash', autoDash);
      }
    }
    /* 字体与字号：0 表示随区域大小自适应（挂 ResizeObserver 实时算） */
    card.__vmRot = num(cfg.图片旋转, 0);      /* 图片卡片用：fitCard 里按这个角度算尺寸 */
    var fontDef = null;
    for (var fi = 0; fi < FONTS.length; fi++) if (FONTS[fi].id === cfg.字体) fontDef = FONTS[fi];
    if (fontDef && fontDef.css) card.style.fontFamily = fontDef.css;
    if (cfg.字号 > 0) card.style.fontSize = cfg.字号 + 'px';
    if (S.editingId === id) card.classList.add('vm-editing');

    /* 自由卡片（自定义文字 / 图片）不显示标题行 —— 整块就是内容 */
    var isFree = (cfg.样式 === '自定义文字' || cfg.样式 === '图片');
    if (cfg.样式 === '图片') card.classList.add('vm-bare');     /* 无边框、无底色、无阴影 */
    if (!isFree) {
      var head = el('div', 'vm-card-head');
      head.appendChild(buildIcon(cfg.图标));
      head.appendChild(el('span', 'vm-name', esc(cfg.显示名)));
      card.appendChild(head);
    }

    var body = el('div', 'vm-card-body');
    if (isFree) body.classList.add('vm-card-body-free');
    /* buildValue 返回的是 DocumentFragment（没有 classList），
       所以先套一层真正的 div，白框与点击事件都挂在这层上 */
    var valWrap = el('div', 'vm-val-wrap');
    if (isFree) valWrap.classList.add('vm-val-wrap-free');
    valWrap.appendChild(buildValue(cfg));
    if (S.editingId === id && !isFree) {      /* 自由卡片没有「就地改值」 */
      valWrap.classList.add('vm-edit-target');
      valWrap.setAttribute('title', '点击修改这个变量的值');
      valWrap.addEventListener('click', function (e) {
        e.stopPropagation();
        openInlineEditor(id, cfg, valWrap);
      });
    }
    body.appendChild(valWrap);
    card.appendChild(body);
    /* 图片卡片：透明背景的地方不吃鼠标（碰撞箱 = 有颜色的那部分）。
       注意要等 body/valWrap 都挂上去了再找 .vm-free-img。 */
    if (cfg.样式 === '图片') {
      var freeIm = card.querySelector('.vm-free-img');
      if (freeIm) setupPixelHit(card, freeIm);
    }

    /* 字号自适应：挂在卡片上，缩放时实时重算 */
    card.__vmBarSet = num(cfg.进度条粗细, 8);     /* 用户设的进度条粗细，fitCard 会按需要收 */
    card.__vmFontSize = num(cfg.字号, 0);         /* >0 = 固定字号；0 = 随区域大小自适应 */
    card.style.setProperty('--vm-bar-h', Math.max(3, num(cfg.进度条粗细, 8)) + 'px');
    if (cfg.字号 > 0) card.style.setProperty('--vm-fit', cfg.字号 + 'px');
    else card.style.setProperty('--vm-fit',
      'clamp(11px, calc(' + (cfg.尺寸.w / 20).toFixed(2) + 'px + ' +
      (cfg.尺寸.h / 12).toFixed(2) + 'px), 30px)');
    card.__vmFit = true;

    ['e', 's', 'se'].forEach(function (dir) {
      var h = el('div', 'vm-handle ' + dir);
      h.addEventListener('mousedown', function (e) {
        e.stopPropagation(); e.preventDefault();
        bringToFront(id, cfg);
        startResize(e, id, cfg, dir);
      });
      card.appendChild(h);
    });

    var g = el('div', 'vm-card-gear', GEAR_SVG);
    g.title = '设置这个变量区';
    g.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    g.addEventListener('click', function (e) {
      e.stopPropagation();
      bringToFront(id, cfg, true);
      openCardSettings(id, false);
    });
    card.appendChild(g);

    /* 任何接触卡片的操作都把它提到最前 */
    card.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      bringToFront(id, cfg);
      if (e.target.closest && e.target.closest('.vm-card-gear, .vm-handle')) return;
      e.stopPropagation();
      e.preventDefault();
      startMove(e, id, cfg);
    });

    return card;
  }

  /* 把卡片提到最前：层级 = 全局递增计数，保证「最后一次接触鼠标的在最上面」
   * 顺手更新叠放顺序并落盘，刷新后保持一致 */
  function bringToFront(id, cfg, saveOnly) {
    S.topZ = (S.topZ || 1) + 1;
    cfg.层级 = S.topZ;
    var card = S.layer && S.layer.querySelector('.vm-card[data-id="' + id + '"]');
    if (card) card.style.zIndex = String(cfg.层级);
    /* 让叠放顺序在 DOM 上也一致（方便调试，不影响渲染） */
    if (card && S.layer.lastElementChild !== card) S.layer.appendChild(card);
    saveLayout();
  }

  function buildIcon(icon) {
    var wrap = el('span', 'vm-icon');
    if (!icon || !icon.值) { wrap.textContent = '·'; return wrap; }
    if (icon.类型 === '图片') {
      var img = document.createElement('img');
      img.src = icon.值; img.alt = '';
      img.addEventListener('error', function () { wrap.textContent = '🖼'; });
      wrap.appendChild(img);
    } else wrap.textContent = icon.值;
    return wrap;
  }

  function buildValue(cfg) {
    var frag = document.createDocumentFragment();
    var raw = getPath(S.statData, cfg.变量);
    var style = cfg.样式;

    if (style === '是或否') {
      var on = toBool(raw);
      var b = el('div', 'vm-bool ' + (on ? 'on' : 'off'));
      b.appendChild(el('span', 'vm-bool-dot'));
      b.appendChild(el('span', 'vm-bool-text', on ? '是' : '否'));
      frag.appendChild(b);
      return frag;
    }

    if (style === '进度条') {
      var v = num(raw, cfg.min);
      var pct = clamp((v - cfg.min) / ((cfg.max - cfg.min) || 1) * 100, 0, 100);
      var row = el('div', 'vm-value-row');
      row.appendChild(el('span', 'vm-value', raw === undefined ? '—' : esc(fmt(v))));
      if (cfg.单位) row.appendChild(el('span', 'vm-unit', esc(cfg.单位)));
      frag.appendChild(row);
      var bar = el('div', 'vm-bar');
      var fill = el('div', 'vm-bar-fill tone-' + cfg.色调);
      fill.style.width = pct.toFixed(1) + '%';
      bar.appendChild(fill);
      frag.appendChild(bar);
      return frag;
    }

    if (style === '数值') {
      var row2 = el('div', 'vm-value-row');
      row2.appendChild(el('span', 'vm-value', raw === undefined ? '—' : esc(fmt(num(raw, 0)))));
      if (cfg.单位) row2.appendChild(el('span', 'vm-unit', esc(cfg.单位)));
      frag.appendChild(row2);
      return frag;
    }

    /* ---- 自由卡片：整块只放你自己写的东西，不读变量 ---- */
    if (style === '自定义文字') {
      frag.appendChild(el('div', 'vm-text-val vm-free-text',
        esc(cfg.自定义文字 || '（点右下角齿轮写文字）')));
      return frag;
    }
    if (style === '图片') {
      if (!cfg.图片) {
        frag.appendChild(el('div', 'vm-text-val vm-free-holder', '（点右下角齿轮选图片）'));
        return frag;
      }
      var im = document.createElement('img');
      im.className = 'vm-free-img';
      im.alt = '';
      im.src = cfg.图片;
      im.style.transform = 'rotate(' + num(cfg.图片旋转, 0) + 'deg)';
      /* 图片载入后再按「旋转后仍完整放得下」算一次尺寸 */
      im.addEventListener('load', function () { fitRotatedImageSoon(im); });
      im.addEventListener('error', function () {
        if (im.parentNode) {
          im.parentNode.replaceChild(el('div', 'vm-text-val vm-free-holder', '（图片加载失败）'), im);
        }
      });
      frag.appendChild(im);
      return frag;
    }

    var txt = raw === undefined ? '（无此变量）'
            : (typeof raw === 'object' ? JSON.stringify(raw) : String(raw));
    frag.appendChild(el('div', 'vm-text-val', esc(txt)));
    return frag;
  }

  /* ---------------- 彩虹取色器 ----------------
   * 一个「红→紫」渐变小方块；点开后有明度/饱和度方格 + 色相条 + 十六进制输入。 */
  function hsvToHex(h, s, v) {
    h = ((h % 360) + 360) % 360;
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    var r, g, b;
    if (h < 60)       { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    var to = function (n) {
      var t = Math.round((n + m) * 255);
      return ('0' + Math.max(0, Math.min(255, t)).toString(16)).slice(-2);
    };
    return '#' + to(r) + to(g) + to(b);
  }

  function hexToHsv(hex) {
    var c = hexToRgb(hex) || { r: 255, g: 0, b: 0 };
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var h = 0;
    if (d !== 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return { h: h, s: max === 0 ? 0 : d / max, v: max };
  }

  /**
   * @param {string} value 当前色
   * @param {function(string)} onChange 选色回调
   * @param {object} opts { live: function(hex), chromaBar: true 时色块本身是红→紫渐变条 }
   */
  function rainbowPicker(value, onChange, opts) {
    opts = opts || {};
    var chromaBar = !!opts.chromaBar;
    var cur = /^#[0-9a-f]{6}$/i.test(value) ? value : '#ff0000';
    var hsv = hexToHsv(cur);
    var open = false;

    var wrap = el('div', 'vm-rainbow-wrap' + (chromaBar ? ' vm-chroma-bar' : ''));
    var chip = el('div', chromaBar ? 'vm-chroma' : 'vm-rainbow-chip');
    chip.title = '点击选择颜色';
    var pop = el('div', 'vm-rainbow-pop');
    pop.style.display = 'none';

    var sv = el('div', 'vm-rainbow-sv');
    var svWhite = el('div', 'vm-rainbow-sv-white');
    var svBlack = el('div', 'vm-rainbow-sv-black');
    var svKnob = el('div', 'vm-rainbow-sv-knob');
    sv.appendChild(svWhite);
    sv.appendChild(svBlack);
    sv.appendChild(svKnob);

    var hueBar = el('div', 'vm-rainbow-hue');
    var hueKnob = el('div', 'vm-rainbow-hue-knob');
    hueBar.appendChild(hueKnob);

    var previewBox = el('div', 'vm-rainbow-preview');
    var hexInput = el('input', 'vm-rainbow-hex');
    hexInput.type = 'text';
    hexInput.spellcheck = false;
    var row = el('div', 'vm-rainbow-row');
    row.appendChild(previewBox);
    row.appendChild(hexInput);

    pop.appendChild(sv);
    pop.appendChild(hueBar);
    pop.appendChild(row);

    function paint(silent) {
      var hex = hsvToHex(hsv.h, hsv.s, hsv.v);
      cur = hex;
      if (!chromaBar) chip.style.background = hex;   /* 渐变条保持彩虹，不刷纯色 */
      previewBox.style.background = hex;
      sv.style.setProperty('--hue', String(Math.round(hsv.h)));
      hueKnob.style.left = (hsv.h / 360 * 100).toFixed(1) + '%';
      svKnob.style.left = (hsv.s * 100).toFixed(1) + '%';
      svKnob.style.top = ((1 - hsv.v) * 100).toFixed(1) + '%';
      svKnob.style.background = hex;
      if (document.activeElement !== hexInput) hexInput.value = hex.toUpperCase();
      if (!silent && onChange) onChange(hex);
      return hex;
    }

    /* 取元素矩形；拿不到布局宽度时退回 offset 尺寸 */
    function rectOf(el2) {
      var r = el2.getBoundingClientRect();
      if (!r.width) {
        r = { left: r.left, top: r.top, width: el2.offsetWidth || 1, height: el2.offsetHeight || 1 };
      }
      return r;
    }

    function dragOn(target, compute, apply) {
      target.addEventListener('mousedown', function (e) {
        e.preventDefault(); e.stopPropagation();
        var move = function (ev) { apply(compute(ev)); paint(); opts.live && opts.live(cur); };
        var up = function () {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
        };
        move(e);
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
    }
    dragOn(sv, function (ev) {
      var r = rectOf(sv);
      return { s: clamp((ev.clientX - r.left) / (r.width || 1), 0, 1),
               v: 1 - clamp((ev.clientY - r.top) / (r.height || 1), 0, 1) };
    }, function (p) { hsv.s = p.s; hsv.v = p.v; });
    dragOn(hueBar, function (ev) {
      var r = rectOf(hueBar);
      return clamp((ev.clientX - r.left) / (r.width || 1), 0, 1) * 360;
    }, function (h) { hsv.h = h; });

    hexInput.addEventListener('input', function () {
      var v = hexInput.value.trim();
      if (/^#?[0-9a-f]{6}$/i.test(v)) {
        hsv = hexToHsv(v[0] === '#' ? v : ('#' + v));
        paint();
      }
    });
    hexInput.addEventListener('click', function (e) { e.stopPropagation(); });

    chip.addEventListener('click', function (e) {
      e.stopPropagation();
      open = !open;
      pop.style.display = open ? '' : 'none';
      if (open) { hsv = hexToHsv(cur); paint(true); }
    });

    var outside = function (e) {
      if (!open) return;
      if (wrap.contains(e.target)) return;
      open = false;
      pop.style.display = 'none';
    };
    document.addEventListener('mousedown', outside, true);

    wrap.appendChild(chip);
    wrap.appendChild(pop);
    paint(true);

    wrap.vmSetColor = function (hex) {
      if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
      hsv = hexToHsv(hex);
      paint(true);
    };
    wrap.vmDestroy = function () { document.removeEventListener('mousedown', outside, true); };
    return wrap;
  }

  /* 统一取色行：左边一排预设色，右边一条红→紫渐变条（点它自选颜色） */
  function colorRow(opts) {
    var box = el('div');
    var sw = el('div', 'vm-swatches');
    var picker = rainbowPicker(opts.value || opts.fallback, function (hex) {
      if (picker.vmOnColor) picker.vmOnColor(hex);
      opts.onChange(hex);
      $$('.vm-swatch', sw).forEach(function (x) { x.classList.remove('on'); });
    }, { live: opts.onLive, chromaBar: true });

    (opts.presets || []).forEach(function (p) {
      var s = el('div', 'vm-swatch' + ((opts.value || '') === (p.css || '') ? ' on' : ''));
      s.title = p.label;
      if (p.css) s.style.background = p.css;
      else s.style.background = 'repeating-linear-gradient(45deg, rgba(128,128,128,0.3) 0 5px, rgba(128,128,128,0.08) 5px 10px)';
      s.addEventListener('click', function () {
        opts.onChange(p.css || '');
        if (picker.vmSetColor) picker.vmSetColor(p.css || opts.fallback);
        if (picker.vmOnColor) picker.vmOnColor(p.css || '');
        $$('.vm-swatch', sw).forEach(function (x) { x.classList.remove('on'); });
        s.classList.add('on');
      });
      sw.appendChild(s);
    });

    /* 当前颜色的实心方块（渐变条本身永远保持彩虹，不随取色变化） */
    var curChip = el('span', 'vm-color-cur');
    curChip.title = '当前颜色';
    function syncCur(hex) {
      curChip.style.background = hex || 'transparent';
      if (!hex) curChip.classList.add('is-inherit');
      else curChip.classList.remove('is-inherit');
    }
    syncCur(opts.value);
    picker.vmOnColor = syncCur;

    var line = el('div', 'vm-color-row');
    line.appendChild(sw);
    var tail = el('div', 'vm-color-tail');
    tail.appendChild(curChip);
    tail.appendChild(picker);
    line.appendChild(tail);

    box.appendChild(line);
    box.vmPicker = picker;
    return box;
  }

  /* 自绘下拉框：不用系统原生 select，外观跟面板一致 */
  function dropdown(options, value, onChange, placeholder) {
    var wrap = el('div', 'vm-dd');
    var btn = el('button', 'vm-dd-btn');
    btn.type = 'button';
    var label = el('span', 'vm-dd-label');
    var caret = el('span', 'vm-dd-caret', '\u25BE');
    btn.appendChild(label);
    btn.appendChild(caret);

    var list = el('div', 'vm-dd-list');
    list.style.display = 'none';
    var opened = false;
    var cur = value;

    function labelOf(v) {
      for (var i = 0; i < options.length; i++) if (options[i].value === v) return options[i].label;
      return placeholder || (options[0] ? options[0].label : '');
    }

    function renderList() {
      list.innerHTML = '';
      options.forEach(function (o) {
        var item = el('div', 'vm-dd-item' + (o.value === cur ? ' on' : ''));
        item.appendChild(el('span', 'vm-dd-item-label', esc(o.label)));
        if (o.hint) item.appendChild(el('span', 'vm-dd-item-hint', esc(o.hint)));
        item.addEventListener('click', function (e) {
          e.stopPropagation();
          cur = o.value;
          label.textContent = o.label;
          close();
          if (onChange) onChange(o.value);
        });
        list.appendChild(item);
      });
    }

    function close() { opened = false; list.style.display = 'none'; wrap.classList.remove('open'); }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      opened = !opened;
      if (!opened) { close(); return; }
      renderList();
      list.style.display = '';
      wrap.classList.add('open');
      var r = btn.getBoundingClientRect();
      var below = (window.innerHeight || 800) - r.bottom;
      wrap.classList.toggle('drop-up', below < 230);
    });

    var outside = function (e) {
      if (!opened) return;
      if (wrap.contains(e.target)) return;
      close();
    };
    document.addEventListener('mousedown', outside, true);

    label.textContent = labelOf(cur);
    wrap.appendChild(btn);
    wrap.appendChild(list);
    wrap.vmValue = function () { return cur; };
    wrap.vmSet = function (v) { cur = v; label.textContent = labelOf(v); };
    wrap.vmDestroy = function () { document.removeEventListener('mousedown', outside, true); };
    return wrap;
  }

  /* ---------------- 修改变量（就地编辑） ---------------- */
  /* 点「修改变量」后：关掉设置弹窗，给该卡片的可改内容加白色框；
   * 点白框就地改值，是否类直接切换「是/否」并带绿/红光晕 */
  function enterEditMode(id) {
    S.editingId = id;
    /* 宽限期：刚进入修改态时的那次点击（来自设置弹窗）不该被当成「点了外面」 */
    S.editGuardUntil = Date.now() + 300;
    render();
  }
  function exitEditMode() {
    if (!S.editingId) return;
    S.editingId = null;
    /* 记一下「刚刚退出修改态」：紧接着的那次 mousedown 不该被当成「拖出新变量区」 */
    S.editExitedAt = Date.now();
    render();
  }

  function openInlineEditor(id, cfg, hostNode) {
    var old = hostNode.querySelector('.vm-inline-editor');
    if (old) { old.parentNode.removeChild(old); return; }

    var cur = getPath(S.statData, cfg.变量);
    var isBool = isBoolish(cur) || cfg.样式 === '是或否';

    var box = el('div', 'vm-inline-editor');
    var firstBtn = null;

    function commit(v) {
      try {
        writeVar(cfg.变量, v, '玩家在面板上修改了「' + (cfg.显示名 || cfg.变量) + '」');
        S.statData = readStat();
        S.editingId = id;          /* 保持编辑态，方便连续改 */
        render();
      } catch (e) {
        box.appendChild(el('div', 'vm-warn', '写入失败：' + esc(e.message)));
      }
    }

    if (isBool) {
      var curOn = toBool(cur);
      var yes = el('button', 'vm-ie-btn yes', '是');
      var no = el('button', 'vm-ie-btn no', '否');
      if (curOn) yes.classList.add('on');
      yes.addEventListener('click', function (e) { e.stopPropagation(); commit(true); });
      no.addEventListener('click', function (e) { e.stopPropagation(); commit(false); });
      box.appendChild(yes);
      box.appendChild(no);
      firstBtn = curOn ? no : yes;
    } else {
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.value = (cur === undefined || cur === null) ? '' : String(cur);
      var ok = el('button', 'vm-ie-btn ok', '确定');
      function doOk(e) {
        e.stopPropagation();
        var raw = inp.value.trim();
        var v = (raw !== '' && isFinite(parseFloat(raw)) && String(parseFloat(raw)) === raw) ? parseFloat(raw) : raw;
        commit(v);
      }
      ok.addEventListener('click', doOk);
      inp.addEventListener('click', function (e) { e.stopPropagation(); });
      inp.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') doOk(e);
        if (e.key === 'Escape') { S.editingId = id; render(); }
      });
      box.appendChild(inp);
      box.appendChild(ok);
      firstBtn = inp;
    }

    hostNode.appendChild(box);
    /* preventScroll：不然浏览器会把聚焦的按钮/输入框滚进视野，页面会「往上一跳」 */
    if (firstBtn && firstBtn.focus) setTimeout(function () { try { firstBtn.focus({ preventScroll: true }); } catch (e) { firstBtn.focus(); } }, 20);
  }

  /* 点卡片外面退出修改态 */
  function bindEditExitOnce() {
    if (S.editExitBound) return;
    S.editExitBound = true;
    document.addEventListener('mousedown', function (e) {
      if (!S.editingId) return;
      if (S.editGuardUntil && Date.now() < S.editGuardUntil) return;
      var card = e.target.closest && e.target.closest('.vm-card');
      if (!card) { exitEditMode(); return; }
      if (card.getAttribute('data-id') !== S.editingId) exitEditMode();
    }, true);
  }

  /* ---------------- Alt 对齐辅助线 ----------------
   * 按住 Alt 拖动卡片时，把该卡片的 左/右/上/下 边缘与其他卡片的对应边缘对齐，
   * 命中后用白色虚线标出对齐位置。 */
  var ALIGN_TOL = 6;          // 吸附判定容差（像素）
  var alignGuides = [];       // 当前显示的辅助线元素

  /* ---------------- 「按住 Alt 对齐」提示 ----------------
   * 用户反复手动挪卡片、又不按 Alt 时，累计一点「努力值」，
   * 攒够就在面板右下角浮一条提示。
   * 规则：按过 Alt（= 他会用）之后本次会话不再提示；
   *       没按过的话，两次提示之间至少隔 2 分钟。 */
  var HINT_EFFORT_MS = 4500;      // 攒够这么多「手动挪卡时间」就提示
  var HINT_PER_DRAG_MS = 900;     // 一次白费的手动拖拽折算多少努力值
  var HINT_GAP_MS = 120000;       // 两次提示的最小间隔
  var altHint = { effort: 0, lastMove: 0, quiet: false, nextAt: 0, box: null, timer: null };

  function hideAltHint() {
    if (altHint.timer) { clearTimeout(altHint.timer); altHint.timer = null; }
    var box = altHint.box;
    altHint.box = null;
    if (!box) return;
    box.classList.remove('in');
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 300);
  }

  function showAltHint() {
    if (altHint.quiet) return;
    var now = Date.now();
    if (now < altHint.nextAt) return;
    var host = S.root && S.root.querySelector('.vm-panel');
    if (!host) return;
    altHint.effort = 0;
    altHint.nextAt = now + HINT_GAP_MS;
    hideAltHint();
    var box = el('div', 'vm-alt-hint');
    box.innerHTML = '尝试对齐？按住 <span class="vm-alt-key">Alt</span> 键拖卡片';
    box.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    box.addEventListener('click', function (e) { e.stopPropagation(); hideAltHint(); });
    host.appendChild(box);
    altHint.box = box;
    requestAnimationFrame(function () { box.classList.add('in'); });
    altHint.timer = setTimeout(hideAltHint, 5200);
  }

  /* 手动拖动中（没按 Alt）累计努力值：停住不动的时间不算 */
  function noteManualMove() {
    if (altHint.quiet) return;
    var now = Date.now();
    if (altHint.lastMove) {
      var dt = now - altHint.lastMove;
      if (dt > 0 && dt < 200) altHint.effort += dt;
    }
    altHint.lastMove = now;
    if (altHint.effort >= HINT_EFFORT_MS) showAltHint();
  }

  /* 一次手动拖拽收尾：白费的一次也折算一点，连着挪几次就会提示 */
  function endManualMove(moved) {
    altHint.lastMove = 0;
    if (altHint.quiet || !moved) return;
    altHint.effort += HINT_PER_DRAG_MS;
    if (altHint.effort >= HINT_EFFORT_MS) showAltHint();
  }

  /* 按过 Alt 就说明他会用，收起提示并且不再打扰 */
  function markAltUsed() {
    altHint.quiet = true;
    altHint.effort = 0;
    altHint.lastMove = 0;
    if (altHint.box) hideAltHint();
  }

  /* ---------------- 贴边合并 ----------------
   * 两张卡片严丝合缝对齐时，各自那条虚线边框会叠在一起；
   * 两条虚线的起笔位置不同，叠出来就是一条「锯齿状」的粗线。
   * 处理：贴住的那条边只留先画的那张（左上优先），另一张的内侧边框抹掉，
   * 于是公共边上只剩一条干净的虚线。
   */
  var FLUSH_TOL = 1.5;        // 边距差多少像素算「贴住」
  var FLUSH_MIN_OVERLAP = 8;  // 两条边在投影上至少重叠这么多像素才算共用一条边

  function refreshFlushBorders(layer) {
    var lay = layer || S.layer;
    if (!lay || !S.layout) return;
    var cards = S.layout.卡片 || {};
    var ids = Object.keys(cards);
    var els = {};

    /* 一次查完所有卡片（拖动时每帧都会调这里，别一张一张 querySelector） */
    $$('.vm-card', lay).forEach(function (e) {
      var id = e.getAttribute('data-id');
      if (id) els[id] = e;
    });
    /* 先清掉上一次写进去的单边覆盖 —— 只在真的写过时才动，避免无意义的样式重算 */
    ids.forEach(function (id) {
      var e = els[id];
      if (!e) return;
      if (e.style.borderTopWidth) e.style.borderTopWidth = '';
      if (e.style.borderRightWidth) e.style.borderRightWidth = '';
      if (e.style.borderBottomWidth) e.style.borderBottomWidth = '';
      if (e.style.borderLeftWidth) e.style.borderLeftWidth = '';
    });

    function box(id) {
      var c = cards[id];
      return { x: c.位置.x, y: c.位置.y, w: c.尺寸.w, h: c.尺寸.h };
    }
    function drop(id, side) {
      var e = els[id];
      var prop = 'border' + side + 'Width';
      if (e && e.style[prop] !== '0px') e.style[prop] = '0px';
    }

    for (var i = 0; i < ids.length; i++) {
      for (var j = i + 1; j < ids.length; j++) {
        if (!els[ids[i]] || !els[ids[j]]) continue;
        var P = box(ids[i]), Q = box(ids[j]);
        var vOverlap = Math.min(P.y + P.h, Q.y + Q.h) - Math.max(P.y, Q.y);
        var hOverlap = Math.min(P.x + P.w, Q.x + Q.w) - Math.max(P.x, Q.x);
        /* 左右贴住：留左边那张的右边框，抹掉右边那张的左边框 */
        if (vOverlap > FLUSH_MIN_OVERLAP) {
          if (Math.abs(Q.x - (P.x + P.w)) <= FLUSH_TOL) drop(ids[j], 'Left');
          else if (Math.abs(P.x - (Q.x + Q.w)) <= FLUSH_TOL) drop(ids[i], 'Left');
        }
        /* 上下贴住：留上面那张的下边框，抹掉下面那张的上边框 */
        if (hOverlap > FLUSH_MIN_OVERLAP) {
          if (Math.abs(Q.y - (P.y + P.h)) <= FLUSH_TOL) drop(ids[j], 'Top');
          else if (Math.abs(P.y - (Q.y + Q.h)) <= FLUSH_TOL) drop(ids[i], 'Top');
        }
      }
    }
  }

  function clearAlignGuides() {
    for (var i = 0; i < alignGuides.length; i++) {
      var g = alignGuides[i];
      if (g && g.parentNode) g.parentNode.removeChild(g);
    }
    alignGuides = [];
  }

  function showAlignGuides(vLines, hLines) {
    clearAlignGuides();
    var layer = S.layer, canvas = S.canvas;
    if (!layer || !canvas) return;
    var H = canvas.clientHeight;
    var W = canvas.clientWidth;
    vLines.forEach(function (x) {
      var d = el('div', 'vm-guide vm-guide-v');
      d.style.left = x + 'px';
      d.style.height = H + 'px';
      layer.appendChild(d);
      alignGuides.push(d);
    });
    hLines.forEach(function (y) {
      var d = el('div', 'vm-guide vm-guide-h');
      d.style.top = y + 'px';
      d.style.width = W + 'px';
      layer.appendChild(d);
      alignGuides.push(d);
    });
  }

  /* 返回吸附后的坐标 + 命中的辅助线 */
  function computeAlign(id, x, y, w, h) {
    var vCand = [], hCand = [];
    Object.keys(S.layout.卡片).forEach(function (oid) {
      if (oid === id) return;
      var o = S.layout.卡片[oid];
      var ox = o.位置.x, oy = o.位置.y, ow = o.尺寸.w, oh = o.尺寸.h;
      /* 竖直方向可对齐的 x：左边对左边、左边对右边、右边对左边、右边对右边、中线对中线 */
      vCand.push({ self: x,         other: ox });
      vCand.push({ self: x,         other: ox + ow });
      vCand.push({ self: x + w,     other: ox });
      vCand.push({ self: x + w,     other: ox + ow });
      vCand.push({ self: x + w / 2, other: ox + ow / 2 });
      /* 水平方向可对齐的 y */
      hCand.push({ self: y,         other: oy });
      hCand.push({ self: y,         other: oy + oh });
      hCand.push({ self: y + h,     other: oy });
      hCand.push({ self: y + h,     other: oy + oh });
      hCand.push({ self: y + h / 2, other: oy + oh / 2 });
    });

    var bestV = null, bestH = null;
    vCand.forEach(function (c) {
      var d = Math.abs(c.self - c.other);
      if (d <= ALIGN_TOL && (!bestV || d < bestV.d)) bestV = { d: d, other: c.other, self: c.self };
    });
    hCand.forEach(function (c) {
      var d = Math.abs(c.self - c.other);
      if (d <= ALIGN_TOL && (!bestH || d < bestH.d)) bestH = { d: d, other: c.other, self: c.self };
    });

    var nx = x, ny = y, vLines = [], hLines = [];
    if (bestV) {
      nx = x + (bestV.other - bestV.self);      // 把自身对齐到对方
      vLines.push(bestV.other);
    }
    if (bestH) {
      ny = y + (bestH.other - bestH.self);
      hLines.push(bestH.other);
    }
    return { x: Math.max(0, Math.round(nx)), y: Math.max(0, Math.round(ny)), vLines: vLines, hLines: hLines };
  }

  /* 缩放时的对齐：被拖的那条边吸附到其他卡片的边线（按住 Alt 缩放时用） */
  function computeAlignResize(id, x, y, w, h, dir) {
    var vCand = [], hCand = [];
    Object.keys(S.layout.卡片).forEach(function (oid) {
      if (oid === id) return;
      var o = S.layout.卡片[oid];
      vCand.push(o.位置.x, o.位置.x + o.尺寸.w, o.位置.x + o.尺寸.w / 2);
      hCand.push(o.位置.y, o.位置.y + o.尺寸.h, o.位置.y + o.尺寸.h / 2);
    });
    var out = { w: w, h: h, vLines: [], hLines: [] };
    function nearest(list, edge) {
      var best = null;
      list.forEach(function (o) {
        var d = Math.abs(edge - o);
        if (d <= ALIGN_TOL && (!best || d < best.d)) best = { d: d, line: o };
      });
      return best;
    }
    if (dir.indexOf('e') >= 0) {
      var bv = nearest(vCand, x + w);
      if (bv) { out.w = Math.max(MIN_W, bv.line - x); out.vLines.push(bv.line); }
    }
    if (dir.indexOf('s') >= 0) {
      var bh = nearest(hCand, y + h);
      if (bh) { out.h = Math.max(MIN_H, bh.line - y); out.hLines.push(bh.line); }
    }
    return out;
  }

  /* ---------------- 字号自适应 ----------------
   * 字号为「自动」时，随区域大小缩放，但不超过区域边界；
   * 「是否」那颗胶囊也跟着一起缩放。 */
  var fitObserver = null;

  function fitCard(card) {
    if (!card) return;
    try {
      var cfgH = parseFloat(card.style.height) || card.clientHeight;
      var cfgW = parseFloat(card.style.width) || card.clientWidth;
      /* 自由卡片（图片）：旋转后要整张都留在框里，不能贴边被裁 */
      var freeImg = card.querySelector('.vm-free-img');
      if (freeImg) fitRotatedImage(freeImg, cfgW, cfgH, num(card.__vmRot, 0));
      var innerW = Math.max(20, cfgW - 24);        /* 减去左右内边距 */
      var innerH = Math.max(16, cfgH - 34);        /* 减去上下内边距 + 标题行 */

      /* 字号 = 宽/20 + 高/12，再按 min(宽,高) 收一下，避免极扁或极高的框算得离谱 */
      var byW = innerW / 9.5;
      var byH = innerH / 3.2;
      var byMix = innerW / 20 + innerH / 12;
      /* 卡片设置里填了固定字号就用它，别再被自适应覆盖（之前这里把设置直接盖掉了） */
      var fixedSize = num(card.__vmFontSize, 0);
      var base = fixedSize > 0 ? fixedSize : clamp(Math.min(byW, byH, byMix * 1.15), 11, 30);
      card.style.setProperty('--vm-fit', base.toFixed(1) + 'px');

      /* 是否胶囊：在剩余宽度内尽量大，但不超过基础字号的 2 倍 */
      var boolText = card.querySelector('.vm-bool-text');
      if (boolText) {
        var bs = clamp(base * 1.15, 12, 34);
        var est = bs * 2.4 + 30;                   /* 估算胶囊总宽（文字 + 圆点 + 内边距） */
        if (est > innerW) bs = Math.max(11, bs * (innerW / est));
        card.style.setProperty('--vm-bool-size', bs.toFixed(1) + 'px');
      }

      /* ---- 竖向收纳：小卡片别把内容裁掉（进度条卡片最容易中招）----
       * 从「正常外观」逐级收紧：行高 → 行距 → 内边距 → 进度条粗细，
       * 每级实测一次，放得下就停。正常尺寸在 0 级就通过，外观与以前完全一致。 */
      var hasBar = !!card.querySelector('.vm-bar');
      var barSet = num(card.__vmBarSet, 8);
      /* [上内边距, 下内边距, 标题间距, 正文行距, 行高倍数, 进度条粗细] */
      var LEVELS = [
        [10, 12, 5, 5, '',   barSet],
        [10, 12, 4, 4, '1.30', barSet],
        [9,  10, 3, 3, '1.15', Math.min(barSet, 6)],
        [7,  8,  2, 2, '1.05', Math.min(barSet, 4)],
        [5,  6,  2, 2, '1.00', Math.min(barSet, 3)],
        [4,  5,  1, 1, '1.00', 3]
      ];
      /* 内容实测高度：卡片自己的 scrollHeight 会被挂在边角外面的缩放手柄撑大，不准，
         所以直接量「标题行 + 数值区」的自然高度。 */
      function contentFits(lv) {
        var headEl = card.querySelector('.vm-card-head');
        var wrapEl = card.querySelector('.vm-val-wrap') || card.querySelector('.vm-card-body');
        var h = (headEl ? headEl.offsetHeight : 0) + (wrapEl ? wrapEl.offsetHeight : 0) +
                lv[0] + lv[1] + lv[2];
        /* 行框里本来就带一截空白（leading），允许一点「溢出」不算裁掉，
           否则正常尺寸的卡片也会被误判成放不下、白白收紧。 */
        return h <= card.clientHeight * 1.12 + 0.5;
      }
      for (var li = 0; li < LEVELS.length; li++) {
        var lv = LEVELS[li];
        card.style.setProperty('--vm-pad-t', lv[0] + 'px');
        card.style.setProperty('--vm-pad-b', lv[1] + 'px');
        card.style.setProperty('--vm-pad-x', '12px');
        card.style.setProperty('--vm-head-gap', lv[2] + 'px');
        card.style.setProperty('--vm-body-gap', lv[3] + 'px');
        if (lv[4]) card.style.setProperty('--vm-row-lh', lv[4]);
        else card.style.removeProperty('--vm-row-lh');
        if (hasBar) card.style.setProperty('--vm-bar-h', Math.max(3, lv[5]) + 'px');
        if (li === LEVELS.length - 1) break;
        if (contentFits(lv)) break;   /* 放得下就停 */
      }
    } catch (e) {
      console.warn('[可视化面板] 字号自适应失败', e);
    }
  }

  /* 手动重算所有卡片字号（外部/测试可用） */
  function refitAll() {
    if (!S.layer) return 0;
    var n = 0;
    $$('.vm-card', S.layer).forEach(function (c) { fitCard(c); n++; });
    return n;
  }

  function bindFitObserver() {
    if (typeof ResizeObserver === 'undefined') return;
    if (!fitObserver) {
      fitObserver = new ResizeObserver(function (entries) {
        entries.forEach(function (en) {
          var card = en.target;
          if (card.__vmFit) fitCard(card);
        });
      });
    }
    $$('.vm-card', S.layer).forEach(function (card) {
      card.__vmFit = true;
      fitObserver.observe(card);
      fitCard(card);
    });
  }

  /* ---------------- 画布交互 ----------------
   * 注意：document 级的 mousemove / mouseup 只在这里挂一次（模块级）。
   * 之前是每 render 一次就往 document 上再挂一组，导致取消创建后
   * 多组陈旧闭包同时响应，草稿框的尺寸记录被写到了已移除的节点上，
   * 表现就是「取消一次后新建拖不出东西，只有一个点」。
   */
  var drag = { mode: null, sx: 0, sy: 0, ox: 0, oy: 0, ow: 0, oh: 0, id: null, cfg: null, dir: '', draft: null, alt: false, moved: false };
  /* 拖动 / 缩放结束后，紧接着冒出来的那个 click 不算「点一下」
     （不然拖完一张「未设置」的卡片、松手就会弹出设置界面）。
     用布尔标记而不是时间窗口：酒馆里 saveLayout() 可能要几百毫秒，
     时间窗口很容易在 click 真正派发之前就过期。 */
  var suppressNextClick = false;
  var DOC_BOUND = false;

  /* 鼠标事件按帧合并：一帧最多算一次，拖动才跟手 */
  var raf = (typeof requestAnimationFrame === 'function')
    ? requestAnimationFrame : function (fn) { return setTimeout(fn, 16); };
  var caf = (typeof cancelAnimationFrame === 'function') ? cancelAnimationFrame : clearTimeout;
  var dragFrame = 0;
  var dragLast = null;

  function docMove(e) {
    if (!drag.mode) return;
    dragLast = { x: e.clientX, y: e.clientY, alt: !!e.altKey };
    if (dragFrame) return;
    dragFrame = raf(function () {
      dragFrame = 0;
      var ev = dragLast;
      if (ev && drag.mode) applyDrag(ev.x, ev.y, ev.alt);
    });
  }

  /* 松手前把最后一帧补上，免得拖动的终点被丢掉 */
  function flushDragFrame() {
    if (dragFrame) { caf(dragFrame); dragFrame = 0; }
    if (dragLast && drag.mode) applyDrag(dragLast.x, dragLast.y, dragLast.alt);
    dragLast = null;
  }

  function applyDrag(cx0, cy0, altKey) {
    if (drag.mode === 'create') {
      var canvas = S.canvas; if (!canvas || !drag.draft) return;
      var r = canvas.getBoundingClientRect();
      var off = S.scrollY || 0;
      var cx = clamp(cx0 - r.left, 0, r.width);
      var cy = clamp(cy0 - r.top - off, 0, r.height);
      var x = Math.min(drag.sx, cx), y = Math.min(drag.sy, cy);
      var w = Math.abs(cx - drag.sx), h = Math.abs(cy - drag.sy);
      drag.draft.style.left = x + 'px';
      drag.draft.style.top = y + 'px';
      drag.draft.style.width = w + 'px';
      drag.draft.style.height = h + 'px';
      drag.draft.setAttribute('data-box', JSON.stringify({ x: x, y: y, w: w, h: h }));
      drag.box = { x: x, y: y, w: w, h: h };   /* 另存一份：万一重绘把草稿框冲掉，松手照样能建出来 */
      return;
    }
    if (drag.mode === 'move') {
      var card = S.layer && S.layer.querySelector('.vm-card[data-id="' + drag.id + '"]');
      if (!card) return;
      var nx = snap(drag.ox + cx0 - drag.sx);
      var ny = snap(drag.oy + cy0 - drag.sy);
      if (altKey) {
        /* 按住 Alt：对齐到其他卡片的边缘，并用白色虚线标出 */
        drag.alt = true;
        markAltUsed();
        var a = computeAlign(drag.id, nx, ny, drag.cfg.尺寸.w, drag.cfg.尺寸.h);
        nx = a.x; ny = a.y;
        showAlignGuides(a.vLines, a.hLines);
      } else {
        clearAlignGuides();
        noteManualMove();
      }
      if (Math.abs(nx - drag.ox) > 2 || Math.abs(ny - drag.oy) > 2) drag.moved = true;
      nx = Math.max(0, nx);
      ny = Math.max(0, ny);
      drag.cfg.位置.x = nx;
      drag.cfg.位置.y = ny;
      /* 拖动期间只改 transform（走合成层，不触发布局），松手时再落到 left/top。
         以前每帧写 left/top，卡片一多就明显掉帧。 */
      card.style.transform = 'translate(' + (nx - drag.ox) + 'px,' + (ny - drag.oy) + 'px)';
      refreshFlushBorders();      /* 贴住了就把重复的那条边框收掉 */
      return;
    }
    if (drag.mode === 'resize') {
      var card2 = S.layer && S.layer.querySelector('.vm-card[data-id="' + drag.id + '"]');
      if (!card2) return;
      var w2 = drag.ow, h2 = drag.oh;
      if (drag.dir.indexOf('e') >= 0) w2 = Math.max(MIN_W, snap(drag.ow + cx0 - drag.sx));
      if (drag.dir.indexOf('s') >= 0) h2 = Math.max(MIN_H, snap(drag.oh + cy0 - drag.sy));
      if (altKey) {
        /* 按住 Alt 缩放：被拖的那条边吸附到其他卡片的边线 */
        drag.alt = true;
        markAltUsed();
        var rs = computeAlignResize(drag.id, drag.cfg.位置.x, drag.cfg.位置.y, w2, h2, drag.dir);
        w2 = rs.w; h2 = rs.h;
        showAlignGuides(rs.vLines, rs.hLines);
      } else {
        clearAlignGuides();
      }
      card2.style.width = w2 + 'px';
      card2.style.height = h2 + 'px';
      drag.cfg.尺寸.w = w2;
      drag.cfg.尺寸.h = h2;
      fitCard(card2);            /* 缩放时立刻重算字号（不依赖 ResizeObserver） */
      updateScrollbar();         /* 尺寸变了，滚动条也要跟着重算 */
      refreshFlushBorders();     /* 尺寸变了，贴边关系也可能变 */
    }
  }

  function docUp() {
    if (!drag.mode) return;
    flushDragFrame();                 /* 先把最后一帧补上，终点不会被吞 */
    var mode = drag.mode;
    var draft = drag.draft;

    /* 收尾：草稿框 */
    var box = (drag.box && JSON.stringify(drag.box)) || (draft && draft.getAttribute('data-box'));
    if (draft && draft.parentNode) draft.parentNode.removeChild(draft);

    /* 收尾：对齐辅助线 */
    clearAlignGuides();

    /* 收尾：拖动 / 缩放 */
    if (mode !== 'create') {
      var card = S.layer && S.layer.querySelector('.vm-card[data-id="' + drag.id + '"]');
      if (card) {
        card.classList.remove('vm-dragging');
        if (mode === 'move') {
          /* 把拖动期间的 transform 落回 left/top，这一下才真正重排一次 */
          card.style.transform = '';
          card.style.willChange = '';
          if (drag.cfg) {
            card.style.left = drag.cfg.位置.x + 'px';
            card.style.top = drag.cfg.位置.y + 'px';
          }
        }
      }
      saveLayout();
      if (mode === 'move') {
        /* 手动挪了半天也没按过 Alt —— 提示一下有自动对齐 */
        if (drag.alt) markAltUsed(); else endManualMove(drag.moved);
      }
    }

    /* 清空状态（先清，避免弹窗操作期间被再次触发） */
    if ((mode === 'move' || mode === 'resize') && drag.moved) {
      suppressNextClick = true;                   /* 拖过了 → 松手冒出来的那个 click 忽略掉 */
    }
    drag.mode = null; drag.draft = null; drag.id = null; drag.cfg = null; drag.dir = '';
    drag.alt = false; drag.moved = false;

    if (mode !== 'create' || !box) return;
    var b;
    try { b = JSON.parse(box); } catch (e) { return; }
    if (!b || b.w < 40 || b.h < 30) return;

    /* 拖完不立刻弹设置，先放一个「点击此处设置」的占位卡片。
       注意：它只活在内存里 —— saveLayout 会把占位卡过滤掉，
       所以刷新页面不会又冒出来一堆没设好的框。 */
    var nid = uid();
    S.layout.卡片[nid] = normalizeLayout({
      卡片: (function () {
        var o = {};
        o[nid] = {
          变量: '', 显示名: '', 样式: '文本', min: 0, max: 100, 单位: '', 色调: 'pink',
          图标: { 类型: '内置', 值: '' },
          位置: { x: snap(b.x), y: snap(b.y) },
          尺寸: { w: Math.max(MIN_W, snap(b.w)), h: Math.max(MIN_H, snap(b.h)) },
          待设置: true
        };
        return o;
      })()
    }, true).卡片[nid];
    saveLayout();
    render();
  }

  function bindDocOnce() {
    if (DOC_BOUND) return;
    DOC_BOUND = true;
    document.addEventListener('mousemove', docMove);
    document.addEventListener('mouseup', docUp);
  }

  function bindCanvas(canvas, layer) {
    bindDocOnce();

    canvas.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest('.vm-card')) return;
      /* 正在就地改数值（或刚点空白退出改值）：这一下只算「退出编辑」，
         不要顺手拖出一个新的变量区 —— 以前点空白会把草稿框拖出来、松手就多一张卡。 */
      suppressNextClick = false;
      if (S.editingId) { exitEditMode(); return; }
      if (Date.now() - (S.editExitedAt || 0) < 350) return;
      var r = canvas.getBoundingClientRect();
      /* 关键：卡片层可能被滚轮平移过（translateY），
         鼠标坐标必须先减去这个位移才是画布坐标系里的位置，
         否则往下滚动后新建的框会画在鼠标上面。 */
      var off = S.scrollY || 0;
      drag.mode = 'create';
      drag.sx = e.clientX - r.left;
      drag.sy = e.clientY - r.top - off;
      drag.draft = el('div', 'vm-draft');
      drag.draft.style.left = drag.sx + 'px';
      drag.draft.style.top = drag.sy + 'px';
      drag.draft.style.width = '0px';
      drag.draft.style.height = '0px';
      layer.appendChild(drag.draft);
      e.preventDefault();
    });

    /* 悬停滚轮：整层平移，超出部分被裁 */
    canvas.addEventListener('wheel', function (e) {
      var lay = S.layer || layer;
      if (!lay) return;
      var contentH = 0;
      $$('.vm-card', lay).forEach(function (c) {
        contentH = Math.max(contentH, num(c.style.top.replace('px', ''), 0) + num(c.style.height.replace('px', ''), 0));
      });
      e.preventDefault();
      var minOff = Math.min(0, canvas.clientHeight - contentH - 16);
      var next = clamp(S.scrollY - e.deltaY, minOff, 0);
      if (next === S.scrollY) return;
      var prev = S.scrollY;
      S.scrollY = next;
      lay.style.transform = 'translateY(' + next + 'px)';
      updateScrollbar();
      /* 正在拖动卡片时，层的位移会让卡片跑偏。
         这里把鼠标基准点一起补偿掉，保证「卡片与鼠标的相对位置」不变，
         于是可以一边滚轮一边拖着走。 */
      if ((drag.mode === 'move' || drag.mode === 'resize') && drag.sy !== undefined) {
        drag.sy += (next - prev);
      }
      if (drag.mode === 'create' && drag.sy !== undefined) {
        drag.sy += (next - prev);
      }
    }, { passive: false });
  }

  function startMove(e, id, cfg) {
    var card = S.layer && S.layer.querySelector('.vm-card[data-id="' + id + '"]');
    if (!card) return;
    suppressNextClick = false;              /* 新一轮按下：把上一次的「忽略点击」标记清掉 */
    card.classList.add('vm-dragging');
    card.style.willChange = 'transform';   /* 拖动期间提升成合成层 */
    altHint.lastMove = 0;
    drag.alt = false;
    drag.moved = false;
    drag.mode = 'move';
    drag.id = id;
    drag.cfg = cfg;
    drag.sx = e.clientX;
    drag.sy = e.clientY;
    drag.ox = cfg.位置.x;
    drag.oy = cfg.位置.y;
  }

  function startResize(e, id, cfg, dir) {
    var card = S.layer && S.layer.querySelector('.vm-card[data-id="' + id + '"]');
    if (!card) return;
    suppressNextClick = false;
    altHint.lastMove = 0;
    drag.alt = false;
    drag.moved = false;
    drag.mode = 'resize';
    drag.id = id;
    drag.cfg = cfg;
    drag.dir = dir;
    drag.sx = e.clientX;
    drag.sy = e.clientY;
    drag.ow = cfg.尺寸.w;
    drag.oh = cfg.尺寸.h;
  }

  /* ---------------- 弹窗 ---------------- */
  function modal(title, bodyNode, footNodes) {
    closeModal();
    var ov = createOverlay();
    var box = el('div', 'vm-modal');
    var head = el('div', 'vm-modal-head');
    head.appendChild(el('span', 'vm-modal-title', esc(title)));
    head.appendChild(el('span', 'vm-topbar-spacer'));
    var x = el('div', 'vm-red-btn'); x.title = '关闭'; x.textContent = '×';
    x.addEventListener('click', closeModal);
    head.appendChild(x);
    box.appendChild(head);

    var body = el('div', 'vm-modal-body');
    body.appendChild(bodyNode);
    box.appendChild(body);

    var foot = el('div', 'vm-modal-foot');
    (footNodes || []).forEach(function (n) { foot.appendChild(n); });
    box.appendChild(foot);

    ov.appendChild(box);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) closeModal(); });
    currentOverlay = ov;
    anchorOverlaySoon(ov);
    syncOverlayTheme();                /* 把主题变量复制过来，否则弹窗背景是透明的 */
    return ov;
  }
  /* 当前打开的弹窗。挂在 document.body 上：面板本身在酒馆的消息 DOM 里，
     祖先可能带 transform / filter，position:fixed 会被它“抓住”，
     弹窗就会跑到聊天顶部去（点哪一层的设置都不对）。 */
  var currentOverlay = null;

  /* 弹窗外壳
   * 优先用 <dialog>.showModal()：它渲染在浏览器**顶层（top layer）**，
   * 不受任何祖先的 transform / filter / contain / will-change 影响 ——
   * 从根上杜绝「弹窗飞到页面顶部」这类问题（那个坑以前靠 position:fixed 是防不住的）。
   * 老浏览器不支持 showModal 时退回普通 div（附定位自检兜底）。 */
  function createOverlay() {
    var canDialog = (typeof HTMLDialogElement !== 'undefined') &&
                    HTMLDialogElement.prototype &&
                    typeof HTMLDialogElement.prototype.showModal === 'function';
    if (canDialog) {
      var dlg = document.createElement('dialog');
      dlg.className = 'vm-overlay vm-dialog';
      document.body.appendChild(dlg);
      try {
        dlg.showModal();
        /* Esc 关掉时走我们自己的收尾（清监听、摘节点） */
        dlg.addEventListener('cancel', function (e) { e.preventDefault(); closeModal(); });
        return dlg;
      } catch (e) {
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
      }
    }
    var ov = el('div', 'vm-overlay');
    document.body.appendChild(ov);
    return ov;
  }

  /* 弹窗定位自检
   * 正常情况 position:fixed 会铺满整个视口；但只要祖先里有人带了
   * transform / filter / backdrop-filter / contain / will-change，
   * fixed 的包含块就会被改掉 —— 弹窗会跑到文档顶部（看着像「飞天上去」）。
   * 酒馆的主题、消息容器、某些脚本都可能干这事，所以这里量一下：
   * 没铺满视口就改用「按滚动位置手算的绝对定位」兜住。 */
  function anchorOverlay(ov) {
    if (!ov) return;
    try {
      var r = ov.getBoundingClientRect();
      var vw = window.innerWidth, vh = window.innerHeight;
      var bad = Math.abs(r.top) > 2 || Math.abs(r.left) > 2 ||
                r.width < vw - 4 || r.height < vh - 4;
      if (!bad) return;
      var sx = window.scrollX || window.pageXOffset || 0;
      var sy = window.scrollY || window.pageYOffset || 0;
      ov.style.position = 'absolute';
      ov.style.top = sy + 'px';
      ov.style.left = sx + 'px';
      ov.style.width = vw + 'px';
      ov.style.height = vh + 'px';
      ov.style.inset = 'auto';
      console.warn('[可视化面板] 弹窗定位被外部容器影响（transform/filter 之类），已改用绝对定位兜底');
    } catch (e) {}
  }
  function anchorOverlaySoon(ov) {
    var sx0 = window.scrollX || 0, sy0 = window.scrollY || 0;
    var fix = function () {
      anchorOverlay(ov);
      /* 兜一层：万一聚焦输入框/插入 DOM 把页面滚走了，拉回打开前的位置 */
      var sx1 = window.scrollX || 0, sy1 = window.scrollY || 0;
      if (Math.abs(sy1 - sy0) > 2 || Math.abs(sx1 - sx0) > 2) {
        try { window.scrollTo(sx0, sy0); } catch (e) {}
      }
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(fix);
      setTimeout(fix, 60);
    } else {
      setTimeout(fix, 16);
      setTimeout(fix, 60);
    }
  }

  /* 弹窗挂在 body 上，拿不到 #vmvu-root 上的主题变量 —— 把根节点的行内变量复制一份过去，
     否则 var(--vm-panel-bg) 全部解析失败，背景就变透明了。 */
  function syncOverlayTheme() {
    if (!currentOverlay || !S.root) return;
    try {
      /* 只搬主题变量过去。root 上的 filter（亮度/对比度）不能跟着来 ——
         不然你调暗面板，设置弹窗也一起被调暗，调起来就没法看清了。 */
      var styleText = String(S.root.getAttribute('style') || '').replace(/(^|;)\s*filter\s*:[^;]*;?/gi, '$1');
      currentOverlay.setAttribute('style', styleText);
      currentOverlay.style.filter = 'none';
    } catch (e) {}
  }

  function closeModal() {
    var ov = currentOverlay ||
      (S.root && S.root.querySelector('.vm-overlay')) ||
      document.querySelector('body > .vm-overlay');
    currentOverlay = null;
    if (!ov || !ov.parentNode) return;
    /* 自绘下拉 / 取色器把监听挂在 document 上，弹窗移除时顺手摘掉 */
    $$('.vm-dd, .vm-picker', ov).forEach(function (n) {
      if (typeof n.vmDestroy === 'function') { try { n.vmDestroy(); } catch (e) {} }
    });
    if (ov.tagName === 'DIALOG' && ov.open) { try { ov.close(); } catch (e) {} }
    ov.parentNode.removeChild(ov);
  }

  /* 分页设置弹窗：把设置拆成几页，不再全都摊在一个平面上。
   * tabs: [{ id, label, build: function () { return Node } }] */
  function settingsModal(title, tabs, footNodes, kind) {
    closeModal();
    var ov = createOverlay();
    var box = el('div', 'vm-modal');

    var head = el('div', 'vm-modal-head');
    head.appendChild(el('span', 'vm-modal-title', esc(title)));
    head.appendChild(el('span', 'vm-topbar-spacer'));
    var x = el('div', 'vm-red-btn'); x.title = '关闭'; x.textContent = '×';
    x.addEventListener('click', closeModal);
    head.appendChild(x);
    box.appendChild(head);

    var bar = el('div', 'vm-tabs-bar');
    var bodyWrap = el('div', 'vm-modal-body');
    var panelHost = el('div', 'vm-tab-panel');
    bodyWrap.appendChild(panelHost);
    box.appendChild(bar);
    box.appendChild(bodyWrap);

    var built = {};
    var tabBtns = [];
    var current = 0;
    function show(idx) {
      current = idx;
      tabBtns.forEach(function (b, i) { b.classList.toggle('on', i === idx); });
      var t = tabs[idx];
      if (!built[t.id]) built[t.id] = t.build();
      panelHost.innerHTML = '';
      panelHost.appendChild(built[t.id]);
    }
    tabs.forEach(function (t, i) {
      var b = el('button', 'vm-tab-btn', esc(t.label));
      b.addEventListener('click', function () { show(i); });
      tabBtns.push(b);
      bar.appendChild(b);
    });

    var foot = el('div', 'vm-modal-foot');
    (footNodes || []).forEach(function (n) { foot.appendChild(n); });
    box.appendChild(foot);

    ov.appendChild(box);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) closeModal(); });
    currentOverlay = ov;
    anchorOverlaySoon(ov);
    syncOverlayTheme();                /* 把主题变量复制过来，否则弹窗背景是透明的 */
    if (kind) ov.setAttribute('data-kind', kind);

    /* 重建当前页（清掉缓存），用于切换选项后刷新内容 —— 不会关闭弹窗 */
    ov.vmRefresh = function () {
      built = {};
      show(current);
    };
    show(0);
    return ov;
  }
  function btn(text, cls, fn) {
    var b = el('button', 'vm-btn ' + (cls || ''), esc(text));
    b.addEventListener('click', fn);
    return b;
  }
  function field(label, node) {
    var f = el('div', 'vm-field');
    if (label) f.appendChild(el('div', 'vm-field-label', esc(label)));
    f.appendChild(node);
    return f;
  }
  function input(value, ph) {
    var i = el('input', 'vm-input');
    i.type = 'text';
    i.value = value === undefined ? '' : value;
    if (ph) i.placeholder = ph;
    return i;
  }
  function sel(options, value) {
    var s = el('select', 'vm-select');
    options.forEach(function (o) {
      var op = document.createElement('option');
      op.value = o; op.textContent = o;
      if (o === value) op.selected = true;
      s.appendChild(op);
    });
    return s;
  }

  /* ---------------- 样式 → 可见字段 的对应表 ----------------
   * 每项声明「选了这个样式，才显示哪些设置」：
   *   range = 最小值/最大值    unit = 单位
   *   tone  = 进度条色调       bool = 是否值提示
   */
  var STYLE_FIELDS = {
    '进度条': { range: true, unit: true, tone: true, hint: '按 min~max 换算成百分比宽度' },
    '数值':   { range: true, unit: true, tone: false, hint: '只显示数字，可带单位（min/max 仅用于越界提示）' },
    '文本':   { range: false, unit: false, tone: false, hint: '直接显示变量的文字内容，超长会自动截断' },
    '是或否': { range: false, unit: false, tone: false, hint: '把变量当布尔值：是 / 否（true、是、1 都算「是」）' },
    /* 下面两种是「不绑变量」的自由卡片：整块只放你写的东西 */
    '自定义文字': { range: false, unit: false, tone: false, free: true, hint: '整块只显示你写的一段文字（不绑变量、AI 不管它）' },
    '图片':       { range: false, unit: false, tone: false, free: true, img: true, hint: '整块只放一张图片：没有边框、没有底色，可旋转' }
  };

  /* ---------------- 图片处理 ---------------- */
  /* 旋转后仍然整张放得进框里：
     直接把图片按 contain 塞进 W×H、再转 θ，四角会顶出框外被裁；
     这里按旋转后的外接矩形反解一个缩放系数，让整张图都留在框内。 */
  function fitRotatedImage(im, boxW, boxH, deg) {
    if (!im || !im.naturalWidth || !im.naturalHeight || !boxW || !boxH) return;
    var rad = num(deg, 0) * Math.PI / 180;
    var c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
    var ar = im.naturalWidth / im.naturalHeight;
    var w0 = Math.min(boxW, boxH * ar);
    var h0 = w0 / ar;
    var k = 1;
    var needW = w0 * c + h0 * s;
    var needH = w0 * s + h0 * c;
    if (needW > boxW) k = Math.min(k, boxW / needW);
    if (needH > boxH) k = Math.min(k, boxH / needH);
    im.style.width = (w0 * k).toFixed(2) + 'px';
    im.style.height = (h0 * k).toFixed(2) + 'px';
    im.style.transform = 'rotate(' + num(deg, 0) + 'deg)';
  }
  function fitRotatedImageSoon(im) {
    var run = function () {
      var card = im.closest ? im.closest('.vm-card') : null;
      if (!card) return;
      /* 自由卡片没有内边距，减去 2px 免得贴边被 1px 边框裁掉 */
      fitRotatedImage(im, Math.max(8, card.clientWidth - 2), Math.max(8, card.clientHeight - 2),
        num(card.__vmRot, 0));
    };
    run();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    setTimeout(run, 60);
  }

  /* ---------------- 图片卡片的「按像素碰撞」 ----------------
   * 图片背景透明时，透明的地方不该吃鼠标。做法：
   *   指针移到透明像素上 → 把这张卡的 pointer-events 关掉（事件自然落到下面的卡片/画布）
   *   指针回到不透明像素 → 再打开
   * 透明度表在图片载入时生成一次（最长边压到 160px，够用又便宜）。 */
  function buildAlphaMask(im) {
    try {
      var nw = im.naturalWidth, nh = im.naturalHeight;
      if (!nw || !nh) return null;
      var k = Math.min(1, 160 / Math.max(nw, nh));
      var w = Math.max(1, Math.round(nw * k));
      var h = Math.max(1, Math.round(nh * k));
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var g = cv.getContext('2d');
      g.clearRect(0, 0, w, h);
      g.drawImage(im, 0, 0, w, h);
      var data = g.getImageData(0, 0, w, h).data;
      var alpha = new Uint8Array(w * h);
      var anyTransparent = false;
      for (var i = 0; i < w * h; i++) {
        alpha[i] = data[i * 4 + 3];
        if (alpha[i] < 250) anyTransparent = true;
      }
      return anyTransparent ? { w: w, h: h, alpha: alpha } : null;   /* 整张不透明就不用管 */
    } catch (e) {
      return null;            /* 跨域图片取不到像素 → 退回普通矩形碰撞 */
    }
  }

  /* 这个点是否落在图片「有颜色」的部分 */
  function hitOpaquePixel(card, im, clientX, clientY) {
    var mask = im.__vmMask;
    if (!mask) return true;
    var r = im.getBoundingClientRect();              /* 旋转不影响中心点 */
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var w = im.offsetWidth, h = im.offsetHeight;     /* 布局尺寸（不受 rotate 影响） */
    if (!w || !h) return true;
    var deg = num(card.__vmRot, 0) * Math.PI / 180;
    var dx = clientX - cx, dy = clientY - cy;
    var c = Math.cos(-deg), s = Math.sin(-deg);      /* 反向旋转回图片自己的坐标系 */
    var lx = dx * c - dy * s;
    var ly = dx * s + dy * c;
    var u = 0.5 + lx / w, v = 0.5 + ly / h;
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;
    var px = Math.min(mask.w - 1, Math.max(0, Math.floor(u * mask.w)));
    var py = Math.min(mask.h - 1, Math.max(0, Math.floor(v * mask.h)));
    return mask.alpha[py * mask.w + px] >= 12;       /* 基本全透明 → 不算命中 */
  }

  function setupPixelHit(card, im) {
    card.__vmMaskState = 'armed';
    function ready() {
      if (!im.__vmMask) im.__vmMask = buildAlphaMask(im);
      card.__vmMaskState = im.__vmMask ? 'ready' : 'opaque-or-unreadable';
    }
    if (im.complete && im.naturalWidth) ready();
    im.addEventListener('load', ready);

    function restore(e) {
      if (!hitOpaquePixel(card, im, e.clientX, e.clientY)) return;
      card.style.pointerEvents = '';
      card.__vmGhost = false;
      document.removeEventListener('mousemove', restore);
    }
    card.addEventListener('mousemove', function (e) {
      var hit = im.__vmMask ? hitOpaquePixel(card, im, e.clientX, e.clientY) : null;
      card.__vmLastMove = { x: e.clientX, y: e.clientY, hit: hit };
      if (card.__vmGhost || !im.__vmMask) return;
      if (hit) return;
      card.style.pointerEvents = 'none';             /* 透明处：让鼠标穿过去 */
      card.__vmGhost = true;
      document.addEventListener('mousemove', restore);
    });
    /* 注意：这里不能监听 mouseleave 去恢复 ——
       把 pointer-events 关掉的那一瞬间浏览器就会给卡片发 mouseleave，
       立刻恢复的话等于白忙一场（会看到「刚穿透又变回去」）。 */
  }

  /* 把图片压到 maxSide 以内，避免布局 JSON 过大。带透明通道输出 PNG，否则 JPEG */
  function shrinkImage(file, maxSide) {
    maxSide = maxSide || 256;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('读取文件失败')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () {
          /* 画布解不开（svg / avif 之类）：原样把文件数据存下来，至少能显示 */
          try {
            var raw = (reader.result && String(reader.result)) || '';
            if (raw && raw.length <= 2 * 1024 * 1024) {
              resolve({ data: raw, w: 0, h: 0 });
              return;
            }
          } catch (e) {}
          reject(new Error('这个图片格式浏览器解不开，换 png / jpg 试试'));
        };
        img.onload = function () {
          try {
            var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            var w = Math.max(1, Math.round(img.width * scale));
            var h = Math.max(1, Math.round(img.height * scale));
            var cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            cv.getContext('2d').drawImage(img, 0, 0, w, h);
            var out;
            try { out = cv.toDataURL('image/png'); } catch (e) { out = null; }
            if (!out) out = cv.toDataURL('image/jpeg', 0.85);
            /* PNG 比 JPEG 大很多时改用 JPEG */
            if (out.indexOf('image/png') === 0) {
              var jp = cv.toDataURL('image/jpeg', 0.85);
              if (jp.length < out.length * 0.8) out = jp;
            }
            resolve({ data: out, w: w, h: h });
          } catch (e) { reject(e); }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function readImageFile(file, maxSide) {
    if (!file) return Promise.reject(new Error('请拖入图片文件'));
    /* 有些来源（从别的程序拖、某些网盘客户端）拿到的 File 没有 MIME 类型，
       只按 type 判断会误报「请拖入图片文件」，这里补一层扩展名兜底。 */
    var typeOk = /^image\//.test(file.type || '');
    var extOk = /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(file.name || '');
    if (!typeOk && !extOk) return Promise.reject(new Error('请拖入图片文件（png / jpg / webp / gif 都行）'));
    if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error('图片太大了（超过 8MB）'));
    return shrinkImage(file, maxSide || 256);
  }

  /* ---------------- 卡片设置 ---------------- */
  function openCardSettings(id, isNew, seed) {
    seed = seed || {};
    /* 卡片可能已经被删掉了（比如刚点过垃圾桶、DOM 还没重建）——别硬开，
       否则下面 JSON.parse(undefined) 会直接抛错。 */
    if (id && !(S.layout.卡片 && S.layout.卡片[id])) { render(); return; }
    var isCreate = !id;
    var cfg = isCreate
      ? { 变量: '', 显示名: '', 样式: '文本', min: 0, max: 100, 单位: '', 色调: 'pink',
          图标: { 类型: '内置', 值: '' },
          位置: (seed && seed.位置) || { x: 16, y: 16 },
          尺寸: (seed && seed.尺寸) || { w: 220, h: 96 }, 只读: false }
      : JSON.parse(JSON.stringify(S.layout.卡片[id]));

    var body = el('div');        /* 「基本」页 */
    var stylePage = el('div');   /* 「样式」页 */

    /* ---- 基本 ---- */
    var iVar = input(cfg.变量, '如：好感度 或 背包.金币');
    var varField = field('变量路径（相对 stat_data，用 . 分层）', iVar);
    body.appendChild(varField);

    var iName = input(cfg.显示名, '留空则用变量名');
    var iHint = document.createElement('textarea');
    iHint.className = 'vm-input';
    iHint.rows = 3;
    iHint.placeholder = '请输入文本';
    iHint.value = cfg.填值说明 || '';
    iHint.style.cssText = 'resize:vertical;min-height:64px;font-family:inherit;line-height:1.5';
    var nameField = field('显示名', iName);
    body.appendChild(nameField);
    var hintField = field('告诉 AI 这里填什么（会临时注入给 AI 看）', iHint);
    body.appendChild(hintField);

    /* 展示样式：跟「字体」一样用自绘下拉，不用系统原生 select */
    var sStyle = dropdown([
      { value: '进度条', label: '进度条', hint: '按 min~max 换算成百分比宽度' },
      { value: '文本',   label: '文本',   hint: '直接显示变量的文字内容' },
      { value: '是或否', label: '是或否', hint: '把变量当布尔值：是 / 否' },
      { value: '数值',   label: '数值',   hint: '只显示数字，可带单位' },
      { value: '自定义文字', label: '自定义文字', hint: '整块只显示你写的文字，不绑变量' },
      { value: '图片',       label: '图片',       hint: '整块只放一张图片：无边框无底色，可旋转' }
    ], cfg.样式, function () { syncFields(); });
    var styleHint = el('div', 'vm-hint', '');
    var styleBox = el('div');
    styleBox.appendChild(sStyle);
    styleBox.appendChild(styleHint);
    body.appendChild(field('展示样式', styleBox));

    /* ---- 数值范围（仅进度条 / 数值） ---- */
    var iMin = input(String(cfg.min)), iMax = input(String(cfg.max));
    var rowRange = el('div', 'vm-row');
    rowRange.appendChild(field('最小', iMin));
    rowRange.appendChild(field('最大', iMax));
    var rangeField = field('数值范围', rowRange);
    stylePage.appendChild(rangeField);

    /* ---- 单位（仅进度条 / 数值） ---- */
    var iUnit = input(cfg.单位, '如 % / ml / 级');
    var unitField = field('单位', iUnit);
    stylePage.appendChild(unitField);

    /* ---- 色调（仅进度条） ---- */
    var sw = el('div', 'vm-swatches');
    TONES.forEach(function (t) {
      var s = el('div', 'vm-swatch' + (cfg.色调 === t.id ? ' on' : ''));
      s.title = t.label;
      s.style.background = t.css;
      s.addEventListener('click', function () {
        cfg.色调 = t.id;
        $$('.vm-swatch', sw).forEach(function (x) { x.classList.remove('on'); });
        s.classList.add('on');
      });
      sw.appendChild(s);
    });
    var toneField = field('进度条色调', sw);
    stylePage.appendChild(toneField);

    /* ---- 图标 / emoji / 图片 ---- */
    var iconState = JSON.parse(JSON.stringify(cfg.图标));
    var tabs = el('div', 'vm-tabs');
    var grid = el('div', 'vm-icon-grid');
    var iconArea = el('div');

    /* emoji 输入 */
    var emojiInput = input('', '在这里粘贴一个 emoji');
    var emojiWrap = el('div');
    emojiWrap.appendChild(emojiInput);

    /* 图片：拖入 / 文件选择 / 粘贴 */
    var imgWrap = el('div');
    var dropZone = el('div', 'vm-dropzone',
      '<div class="vm-dropzone-main">把图片拖到这里</div>' +
      '<div class="vm-dropzone-sub">或点击选择文件 · 也可以直接 Ctrl+V 粘贴</div>');
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    var imgStatus = el('div', 'vm-hint', '');
    var urlInput = input('', '或直接填图片 URL（https://…）');
    var urlRow = el('div', 'vm-row');
    urlRow.style.marginTop = '6px';
    urlRow.appendChild(urlInput);

    dropZone.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) handleImageFile(fileInput.files[0]);
      fileInput.value = '';
    });
    dropZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.stopPropagation();          /* 别让酒馆自己的拖放处理也跟着吃这个文件 */
      dropZone.classList.add('over');
    });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('over'); });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleImageFile(f);
    });
    dropZone.addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') === 0) {
          var f = items[i].getAsFile();
          if (f) { handleImageFile(f); e.preventDefault(); e.stopPropagation(); return; }
        }
      }
    });
    document.addEventListener('paste', onDocPaste);

    function onDocPaste(e) {
      var ov = S.root && S.root.querySelector('.vm-overlay');
      if (!ov || ov.getAttribute('data-kind') !== 'card') return;
      if (iconState.类型 !== '图片') return;
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') === 0) {
          var f = items[i].getAsFile();
          if (f) { handleImageFile(f); e.preventDefault(); return; }
        }
      }
    }

    function handleImageFile(f) {
      imgStatus.textContent = '正在处理图片…';
      readImageFile(f).then(function (res) {
        iconState.类型 = '图片';
        iconState.值 = res.data;
        imgStatus.textContent = '已载入 ' + res.w + '×' + res.h + ' 的图片（已压缩，约 ' + Math.round(res.data.length / 1024) + ' KB）';
        urlInput.value = '';
        renderIcons();
      }).catch(function (err) {
        imgStatus.textContent = '';
        imgStatus.appendChild(el('span', 'vm-warn', '载入失败：' + err.message));
      });
    }

    urlInput.addEventListener('change', function () {
      var u = urlInput.value.trim();
      if (!u) return;
      iconState.类型 = '图片';
      iconState.值 = u;
      imgStatus.textContent = '使用外部图片 URL（不会存进布局，换设备可能失效）';
      renderIcons();
    });

    imgWrap.appendChild(dropZone);
    imgWrap.appendChild(fileInput);
    imgWrap.appendChild(imgStatus);
    imgWrap.appendChild(urlRow);
    imgWrap.appendChild(el('div', 'vm-hint', '建议用拖入/选择文件：会压缩后直接存进布局，不依赖网络。'));

    function renderIcons() {
      tabs.innerHTML = ''; grid.innerHTML = '';
      ['内置', 'emoji', '图片'].forEach(function (tp) {
        var t = el('div', 'vm-tab' + (iconState.类型 === tp ? ' on' : ''), tp);
        t.addEventListener('click', function () { iconState.类型 = tp; renderIcons(); });
        tabs.appendChild(t);
      });
      emojiWrap.style.display = (iconState.类型 === 'emoji') ? '' : 'none';
      imgWrap.style.display = (iconState.类型 === '图片') ? '' : 'none';
      if (iconState.类型 === '内置') {
        BUILTIN_ICONS.forEach(function (ic) {
          var o = el('div', 'vm-icon-opt' + (iconState.值 === ic ? ' on' : ''), ic);
          o.addEventListener('click', function () { iconState.值 = ic; renderIcons(); });
          grid.appendChild(o);
        });
      } else if (iconState.类型 === 'emoji') {
        emojiInput.value = iconState.值 || '';
      } else {
        if (iconState.值) {
          var prev = el('div', 'vm-icon-opt on');
          var im = document.createElement('img');
          im.src = iconState.值;
          prev.appendChild(im);
          grid.appendChild(prev);
        }
      }
    }
    emojiInput.addEventListener('input', function () { iconState.值 = emojiInput.value.trim(); });
    renderIcons();

    iconArea.appendChild(tabs);
    iconArea.appendChild(el('div', null, '<div style="height:8px"></div>'));
    iconArea.appendChild(grid);
    iconArea.appendChild(el('div', null, '<div style="height:6px"></div>'));
    iconArea.appendChild(emojiWrap);
    iconArea.appendChild(imgWrap);
    stylePage.appendChild(field('标识', iconArea));

    /* ---- 字体 / 字号 / 进度条粗细 ---- */
    var sFont = dropdown(CARD_FONTS.map(function (f) {
      return { value: f.id, label: f.label };
    }), cfg.字体 || 'inherit', function (v) {
      cfg.字体 = v;
      var c = S.layer && S.layer.querySelector('.vm-card[data-id="' + id + '"]');
      if (c) {
        var fd = null;
        for (var fi = 0; fi < CARD_FONTS.length; fi++) if (CARD_FONTS[fi].id === v) fd = CARD_FONTS[fi];
        c.style.fontFamily = (fd && fd.css) ? fd.css : '';
      }
    });

    var iFontSize = document.createElement('input');
    iFontSize.type = 'range'; iFontSize.min = '0'; iFontSize.max = '30'; iFontSize.step = '1';
    iFontSize.value = String(cfg.字号 || 0);
    iFontSize.style.width = '100%';
    var fontSizeLabel = el('div', 'vm-hint', cfg.字号 > 0 ? ('固定 ' + cfg.字号 + 'px') : '自动（随区域大小缩放）');
    iFontSize.addEventListener('input', function () {
      var v = parseInt(iFontSize.value, 10);
      fontSizeLabel.textContent = v > 0 ? ('固定 ' + v + 'px') : '自动（随区域大小缩放）';
      /* 拖动时即时预览：改的是这张卡片的「固定字号」，0 就回到自适应 */
      var liveCard = S.layer && S.layer.querySelector('.vm-card[data-id="' + id + '"]');
      if (liveCard) { liveCard.__vmFontSize = v; fitCard(liveCard); }
    });
    var fontBox = el('div');
    fontBox.appendChild(field('字体', sFont));
    fontBox.appendChild(field('字号', (function () { var d = el('div'); d.appendChild(iFontSize); d.appendChild(fontSizeLabel); return d; })()));
    stylePage.appendChild(field('文字', fontBox));

    var iBarH = document.createElement('input');
    iBarH.type = 'range'; iBarH.min = '3'; iBarH.max = '26'; iBarH.step = '1';
    iBarH.value = String(cfg.进度条粗细 || 8);
    iBarH.style.width = '100%';
    var barHLabel = el('div', 'vm-hint', (cfg.进度条粗细 || 8) + ' px');
    iBarH.addEventListener('input', function () { barHLabel.textContent = iBarH.value + ' px'; });
    var barHBox = el('div');
    barHBox.appendChild(iBarH);
    barHBox.appendChild(barHLabel);
    var barHField = field('进度条粗细', barHBox);
    stylePage.appendChild(barHField);

    /* ---- 背景颜色（预设 + 彩虹取色） ---- */
    var CARD_BG_PRESETS = bgPresets();
    function paintCardBg() {
      var th2 = resolveTheme();
      var c2 = S.layer && S.layer.querySelector('.vm-card[data-id="' + id + '"]');
      if (!c2) return;
      var bg = cfg.背景色 || th2.card;
      c2.style.setProperty('--vm-card-bg', bg);
      /* 底色变了，边框色也要重新算（没单独指定边框色时按底色自动挑） */
      if (typeof paintBorder === 'function') paintBorder();
      else if (!cfg.边框色) {
        var rgb = hexToRgb(bg);
        if (rgb) c2.style.setProperty('--vm-card-dash', ensureContrast(th2.accent, rgb, 2.2));
      }
    }
    var bgBox = colorRow({
      value: cfg.背景色,
      fallback: '#ffffff',
      presets: CARD_BG_PRESETS,
      onLive: function (hex) { cfg.背景色 = hex; paintCardBg(); },
      onChange: function (hex) { cfg.背景色 = hex; paintCardBg(); }
    });
    bgBox.appendChild(el('div', 'vm-hint', '留「跟随主题」就用主题给变量区的底色。'));
    stylePage.appendChild(field('变量区背景色', bgBox));

    /* ---- 文字颜色（底色浅 / 底色深时，用它把字调清楚） ---- */
    var INK_PRESETS = [
      { label: '跟随主题', css: '' },
      { label: '近黑', css: '#141413' },
      { label: '深灰', css: '#3d3d3a' },
      { label: '深棕', css: '#4a3b32' },
      { label: '藏青', css: '#1f2a44' },
      { label: '白', css: '#ffffff' },
      { label: '浅米', css: '#f2efe8' }
    ];
    function paintCardInk() {
      var c3 = liveCard();
      if (!c3) return;
      if (cfg.文字色) {
        c3.style.setProperty('--vm-card-ink', cfg.文字色);
        c3.style.setProperty('--vm-card-ink-strong', cfg.文字色);
      } else {
        c3.style.removeProperty('--vm-card-ink');
        c3.style.removeProperty('--vm-card-ink-strong');
      }
    }
    var inkBox = colorRow({
      value: cfg.文字色,
      fallback: '#141413',
      presets: INK_PRESETS,
      onLive: function (hex) { cfg.文字色 = hex; paintCardInk(); },
      onChange: function (hex) { cfg.文字色 = hex; paintCardInk(); }
    });
    inkBox.appendChild(el('div', 'vm-hint',
      '留「跟随主题」就用主题的文字色。变量区底色偏浅（比如白底）时，选深色字才不会糊在一起。'));
    stylePage.appendChild(field('变量区文字色', inkBox));

    /* ---- 自由卡片①：自定义文字（样式选「自定义文字」时才显示） ---- */
    var iFreeText = document.createElement('textarea');
    iFreeText.className = 'vm-input';
    iFreeText.rows = 4;
    iFreeText.placeholder = '写点什么…可以换行';
    iFreeText.value = cfg.自定义文字 || '';
    iFreeText.style.cssText = 'resize:vertical;min-height:70px;font-family:inherit;line-height:1.5';
    iFreeText.addEventListener('input', function () {
      cfg.自定义文字 = iFreeText.value;
      var c = liveCard();
      var t = c && c.querySelector('.vm-free-text');
      if (t) t.textContent = cfg.自定义文字 || '（点右下角齿轮写文字）';
    });
    var freeTextField = field('卡片里的文字', iFreeText);
    freeTextField.appendChild(el('div', 'vm-hint', '这段文字不绑变量，AI 不会碰它。字号 / 字体 / 文字色都按上面那几项走。'));
    stylePage.appendChild(freeTextField);

    /* ---- 自由卡片②：图片（样式选「图片」时才显示）---- */
    var imgState = { 值: cfg.图片 || '' };
    var pvWrap = el('div');
    var pvDrop = el('div', 'vm-dropzone',
      '<div class="vm-dropzone-main">把图片拖到这里</div>' +
      '<div class="vm-dropzone-sub">或点击选择文件 · 也可以直接 Ctrl+V 粘贴</div>');
    pvDrop.setAttribute('data-vm-free-img', '1');     /* 用来区分图标那个拖放区（自动化/排查用） */
    var pvFile = document.createElement('input');
    pvFile.type = 'file';
    pvFile.accept = 'image/*';
    pvFile.style.display = 'none';
    var pvStatus = el('div', 'vm-hint', '');
    var pvUrl = input('', '或直接填图片 URL（https://…）');
    var pvUrlRow = el('div', 'vm-row');
    pvUrlRow.style.marginTop = '6px';
    pvUrlRow.appendChild(pvUrl);
    pvWrap.appendChild(pvDrop);
    pvWrap.appendChild(pvFile);
    pvWrap.appendChild(pvStatus);
    pvWrap.appendChild(pvUrlRow);
    pvWrap.appendChild(el('div', 'vm-hint', '拖入的图会压缩后存进布局（最大边 1024px），不依赖网络。'));

    function applyFreeImage(v) {
      imgState.值 = v;
      cfg.图片 = v;
      render();                 /* 图片内容变了，整块重画（占位提示 / 加载失败都在里面处理） */
    }
    function loadFreeImage(f) {
      pvStatus.textContent = '正在处理图片…';
      readImageFile(f, 1024).then(function (res) {
        applyFreeImage(res.data);
        pvStatus.textContent = res.w
          ? ('已载入 ' + res.w + '×' + res.h + '（已压缩，约 ' + Math.round(res.data.length / 1024) + ' KB）')
          : ('已载入（原始数据直存，约 ' + Math.round(res.data.length / 1024) + ' KB）');
        pvUrl.value = '';
      }).catch(function (err) {
        pvStatus.textContent = '';
        pvStatus.appendChild(el('span', 'vm-warn', '载入失败：' + err.message));
      });
    }
    pvDrop.addEventListener('click', function () { pvFile.click(); });
    pvFile.addEventListener('change', function () {
      if (pvFile.files && pvFile.files[0]) loadFreeImage(pvFile.files[0]);
      pvFile.value = '';
    });
    pvDrop.addEventListener('dragover', function (e) { e.preventDefault(); pvDrop.classList.add('over'); });
    pvDrop.addEventListener('dragleave', function () { pvDrop.classList.remove('over'); });
    pvDrop.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation();   /* 拦下来，别让酒馆的全局拖放也跟着处理 */
      pvDrop.classList.remove('over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFreeImage(f);
    });
    pvDrop.addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') === 0) {
          var f = items[i].getAsFile();
          if (f) { loadFreeImage(f); e.preventDefault(); e.stopPropagation(); return; }
        }
      }
    });
    pvUrl.addEventListener('change', function () {
      var u = pvUrl.value.trim();
      if (!u) return;
      applyFreeImage(u);
      pvStatus.textContent = '使用外部图片 URL（不会存进布局，换设备可能失效）';
    });

    /* 旋转：-180° ~ 180°，双击复位 */
    var rotRange = document.createElement('input');
    rotRange.type = 'range';
    rotRange.min = '-180'; rotRange.max = '180'; rotRange.step = '1';
    rotRange.value = String(num(cfg.图片旋转, 0));
    var rotLabel = el('div', 'vm-hint', num(cfg.图片旋转, 0) + '°');
    function paintRot() {
      var c = liveCard();
      var im = c && c.querySelector('.vm-free-img');
      if (c) c.__vmRot = num(cfg.图片旋转, 0);
      if (im) fitRotatedImage(im, Math.max(8, (c ? c.clientWidth : 0) - 2),
        Math.max(8, (c ? c.clientHeight : 0) - 2), num(cfg.图片旋转, 0));
    }
    rotRange.addEventListener('input', function () {
      cfg.图片旋转 = parseInt(rotRange.value, 10) || 0;
      rotLabel.textContent = cfg.图片旋转 + '°';
      paintRot();
    });
    rotRange.addEventListener('change', function () { saveLayout(); });
    rotRange.addEventListener('dblclick', function () {
      rotRange.value = '0';
      cfg.图片旋转 = 0;
      rotLabel.textContent = '0°';
      paintRot();
      saveLayout();
    });
    var rotBox = el('div');
    rotBox.appendChild(rotRange);
    rotBox.appendChild(rotLabel);
    var rotField = field('图片旋转（双击滑块复位）', rotBox);

    var imgField = field('整块显示的图片', pvWrap);
    stylePage.appendChild(imgField);
    stylePage.appendChild(rotField);

    /* ---- 圆角开关 ---- */
    var radiusState = { on: cfg.圆角 !== false };
    var chkRadius = document.createElement('input');
    chkRadius.type = 'checkbox';
    chkRadius.checked = radiusState.on;
    chkRadius.addEventListener('change', function () {
      radiusState.on = chkRadius.checked;
      cfg.圆角 = chkRadius.checked;
      var c = liveCard();
      if (c) c.style.setProperty('--vm-card-radius', chkRadius.checked ? '14px' : '0');
    });
    var rowRadius = el('label', 'vm-checkrow');
    rowRadius.appendChild(chkRadius);
    rowRadius.appendChild(el('span', null, '圆角（关掉就是直角）'));
    stylePage.appendChild(field('外形', rowRadius));

    /* ---- 边框：线型 + 颜色 ---- */
    var borderState = { style: cfg.边框线型 === '实线' ? '实线' : '虚线' };

    function liveCard() {
      return S.layer && S.layer.querySelector('.vm-card[data-id="' + id + '"]');
    }
    /* 边框色没单独设时，按卡片底色自动挑一个看得清的颜色 */
    function autoBorder(hex) {
      var th2 = resolveTheme();
      if (hex) return hex;
      var bgRgb = hexToRgb(cfg.背景色 || th2.card);
      return bgRgb ? ensureContrast(th2.accent, bgRgb, 2.0) : th2.accent;
    }
    function paintBorder() {
      var c = liveCard();
      if (!c) return;
      c.style.setProperty('--vm-card-dash', autoBorder(cfg.边框色));
      c.style.setProperty('--vm-card-border-style', borderState.style === '实线' ? 'solid' : 'dashed');
    }

    var segBorder = el('div', 'vm-segmented');
    ['虚线', '实线'].forEach(function (sv) {
      var b = el('button', 'vm-seg' + (borderState.style === sv ? ' on' : ''), sv);
      b.addEventListener('click', function () {
        borderState.style = sv;
        cfg.边框线型 = sv;
        $$('.vm-seg', segBorder).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        paintBorder();
      });
      segBorder.appendChild(b);
    });
    stylePage.appendChild(field('边框线型', segBorder));

    var borderBox = colorRow({
      value: cfg.边框色,
      fallback: autoBorder(''),
      presets: BORDER_COLORS,
      onLive: function (hex) { cfg.边框色 = hex; paintBorder(); },
      onChange: function (hex) { cfg.边框色 = hex; paintBorder(); }
    });
    borderBox.appendChild(el('div', 'vm-hint',
      '留「跟随主题」时，边框色会按变量区底色自动挑一个看得清的颜色。'));
    stylePage.appendChild(field('边框颜色', borderBox));

    /* ---- 修改变量（点它进入就地修改态） ---- */
    if (!isCreate) {
      var editBtn = el('div', 'vm-change-btn', '修改变量');
      editBtn.title = '点击后关闭设置，卡片里的可改内容会被白框圈出来';
      editBtn.addEventListener('click', function () {
        /* 先把当前编辑结果存下来，再进修改态 */
        cfg.变量 = iVar.value.trim() || cfg.变量;
        cfg.显示名 = iName.value.trim() || cfg.变量;
        cfg.样式 = sStyle.vmValue();
        cfg.min = num(iMin.value, 0);
        cfg.max = num(iMax.value, 100);
        cfg.单位 = iUnit.value.trim();
        cfg.图标 = iconState;
        cfg.字体 = sFont.vmValue();
        cfg.字号 = parseInt(iFontSize.value, 10) || 0;
        cfg.进度条粗细 = parseInt(iBarH.value, 10) || 8;
      cfg.边框线型 = borderState.style;
      cfg.圆角 = radiusState.on;
      cfg.填值说明 = iHint.value.trim();
        S.layout.卡片[id] = cfg;
        saveLayout();
        document.removeEventListener('paste', onDocPaste);
        closeModal();
        enterEditMode(id);
        syncWorldBook();
      });
      body.appendChild(field('修改内容', editBtn));
    }

    /* ---- 底部按钮 ---- */
    var foot = [];
    if (!isCreate) {
      foot.push(btn('删除', 'danger', function () {
        var c = S.layout.卡片[id] || {};
        var path = String(c.变量 || '');
        var label = String(c.显示名 || path || '这个变量区');
        /* 有绑定变量就多问一句：要不要连变量一起删 */
        if (!global.confirm('删除变量区「' + label + '」？' +
            (path ? '' : '\n\n（这个变量区还没设置变量，直接删掉。）'))) return;
        var alsoVar = false;
        if (path) {
          alsoVar = global.confirm('要一并删除变量「' + path + '」吗？\n\n' +
            '确定 = 连变量一起删（这一楼的数据里也删掉）\n' +
            '取消 = 只删这个变量区，变量留着');
        }
        delete S.layout.卡片[id];
        if (alsoVar) { try { deleteVariable(path); } catch (e) {} }
        saveLayout(); closeModal(); render(); syncWorldBook();
      }));
    }
    foot.push(btn('取消', 'ghost', function () {
      document.removeEventListener('paste', onDocPaste);
      /* 从占位卡片进来的：点「取消」才丢这张卡（只关弹窗不算放弃，见 closeModal） */
      if (seed && seed.占位id) { delete S.layout.卡片[seed.占位id]; saveLayout(); }
      closeModal(); render();
    }));
    foot.push(btn(isCreate ? '创建' : '保存', null, function () {
      cfg.样式 = sStyle.vmValue();
      var freeStyle = (cfg.样式 === '自定义文字' || cfg.样式 === '图片');
      var v = iVar.value.trim();
      if (!freeStyle && !v) { try { iVar.focus({ preventScroll: true }); } catch (e) { iVar.focus(); } iVar.style.borderColor = '#ff6a6a'; return; }
      cfg.变量 = freeStyle ? '' : v;
      cfg.显示名 = iName.value.trim() || (freeStyle ? '自由卡片' : v);
      cfg.自定义文字 = iFreeText.value;
      cfg.图片 = imgState.值;
      cfg.图片旋转 = parseInt(rotRange.value, 10) || 0;
      cfg.min = num(iMin.value, 0);
      cfg.max = num(iMax.value, 100);
      cfg.单位 = iUnit.value.trim();
      cfg.图标 = iconState;
      cfg.字体 = sFont.vmValue();
      cfg.字号 = parseInt(iFontSize.value, 10) || 0;
      cfg.进度条粗细 = parseInt(iBarH.value, 10) || 8;
      cfg.边框线型 = borderState.style;
      cfg.圆角 = radiusState.on;
      cfg.填值说明 = iHint.value.trim();
      if (!freeStyle) ensureVariable(cfg);   /* 填了个还没有的变量路径 → 先建出来给默认值 */
      if (!id && seed && seed.占位id) id = seed.占位id;
      delete cfg.待设置;
      S.layout.卡片[id || uid()] = cfg;
      document.removeEventListener('paste', onDocPaste);
      saveLayout(); closeModal(); render(); syncWorldBook();
      var size = JSON.stringify(S.layout).length;
      if (size > 300 * 1024) console.warn('[可视化面板] 布局已 ' + Math.round(size / 1024) + ' KB，主要是内嵌图片，注意别加太多大图');
    }));

    /* ===== 样式 → 字段显隐（一一对应）===== */
    function syncFields() {
      var st = sStyle.vmValue();
      var f = STYLE_FIELDS[st] || STYLE_FIELDS['文本'];
      var free = !!f.free;
      /* 自由卡片（自定义文字 / 图片）不绑变量：把变量相关的字段收起来 */
      varField.style.display = free ? 'none' : '';
      hintField.style.display = free ? 'none' : '';
      freeTextField.style.display = (st === '自定义文字') ? '' : 'none';
      imgField.style.display = (st === '图片') ? '' : 'none';
      rotField.style.display = (st === '图片') ? '' : 'none';
      rangeField.style.display = f.range ? '' : 'none';
      unitField.style.display = f.unit ? '' : 'none';
      toneField.style.display = f.tone ? '' : 'none';
      barHField.style.display = (st === '进度条') ? '' : 'none';
      barHField.setAttribute('data-hidden', (st === '进度条') ? '0' : '1');
      nameField.style.display = '';          // 显示名所有样式都要
      styleHint.textContent = f.hint;
    }
    syncFields();

    var ov = settingsModal(isCreate ? '新建变量区' : ('设置 · ' + (cfg.显示名 || cfg.变量)), [
      { id: 'basic', label: '基本', build: function () { return body; } },
      { id: 'style', label: '样式', build: function () { return stylePage; } }
    ], foot, 'card');

    /* 关闭时摘掉全局 paste 监听 */
    if (ov) {
      var mo = new MutationObserver(function () {
        if (!document.body.contains(ov)) {
          document.removeEventListener('paste', onDocPaste);
          mo.disconnect();
        }
      });
      mo.observe(S.root, { childList: true });
    }

    /* preventScroll：打开设置时别让页面滚到顶部（非全屏、页面能滚时特别明显） */
    setTimeout(function () { try { iVar.focus({ preventScroll: true }); } catch (e) { iVar.focus(); } }, 30);
  }

  /* ---------------- 面板设置（分页） ---------------- */
  function openPanelSettings() {
    var th = S.layout.主题;

    /* 刷新当前设置页（不关弹窗）。用于切换色派 / 主题色后重建色板。 */
    function remountTabs() {
      var ov = S.root && S.root.querySelector('.vm-overlay');
      if (ov && typeof ov.vmRefresh === 'function') ov.vmRefresh();
    }

    /* ==== 页1：主题颜色 ==== */
    function buildTheme() {
      var box = el('div');
      box.style.cssText = 'display:flex;flex-direction:column;gap:16px';

      /* 淡 / 浓 */
      var seg = el('div', 'vm-segmented');
      var curMode = th.模式 || themeOf(th.预设).mode;
      THEME_MODES.forEach(function (m) {
        var b = el('button', 'vm-seg' + (curMode === m.id ? ' on' : ''), m.label);
        b.addEventListener('click', function () {
          th.模式 = m.id;
          /* 换到同名主题的另一派 */
          var same = THEMES.filter(function (t) {
            return t.mode === m.id && t.label === (themeOf(th.预设).label);
          })[0];
          if (same) th.预设 = same.id;
          /* 只重画设置内容 + 主题，不整体重绘，弹窗保持打开 */
          saveLayout(); applyThemeAnimated(); remountTabs();
        });
        seg.appendChild(b);
      });
      box.appendChild(field('色派', seg));

      /* 主题色（按当前派别过滤） */
      var curMode2 = th.模式 || themeOf(th.预设).mode;
      var sw = el('div', 'vm-swatches');
      THEMES.filter(function (t) { return t.mode === curMode2; }).forEach(function (t) {
        var s = el('div', 'vm-swatch' + (th.预设 === t.id ? ' on' : ''));
        s.title = t.label;
        s.style.background = 'linear-gradient(135deg,' + t.bar + ' 45%,' + t.accent + ' 45%)';
        s.addEventListener('click', function () {
          th.预设 = t.id; saveLayout(); applyThemeAnimated(); remountTabs();
        });
        sw.appendChild(s);
      });
      box.appendChild(field('主题色', sw));

      /* 单色强调色 */
      var aw = el('div', 'vm-swatches');
      ACCENTS.forEach(function (a) {
        var s = el('div', 'vm-swatch' + ((th.强调色 || 'theme') === a.id ? ' on' : ''));
        s.title = a.label;
        s.style.background = a.css || 'repeating-linear-gradient(45deg,#d97757 0 5px,#efece4 5px 10px)';
        s.addEventListener('click', function () {
          th.强调色 = (a.id === 'theme') ? '' : a.id;
          saveLayout(); applyThemeAnimated();
        });
        aw.appendChild(s);
      });
      box.appendChild(field('强调色（与主题色独立）', aw));

      /* 亮度 / 对比度：整体调节，浅色主题嫌刺眼就压亮度 */
      function mkBcRange(label, key) {
        var wrap = el('div');
        var rng = document.createElement('input');
        rng.type = 'range';
        rng.min = '40'; rng.max = '180'; rng.step = '2';
        rng.value = String(Math.round(num(th[key], 1) * 100));
        var lab = el('div', 'vm-hint', rng.value + '%');
        rng.addEventListener('input', function () {
          th[key] = parseInt(rng.value, 10) / 100;
          lab.textContent = rng.value + '%';
          applyTheme();                    /* 立刻看到效果 */
          saveLayout();
        });
        rng.addEventListener('dblclick', function () {
          rng.value = '100'; th[key] = 1; lab.textContent = '100%';
          applyTheme(); saveLayout();
        });
        wrap.appendChild(rng);
        wrap.appendChild(lab);
        return field(label, wrap);
      }
      var bcBox = el('div');
      bcBox.style.cssText = 'display:flex;flex-direction:column;gap:10px';
      bcBox.appendChild(mkBcRange('亮度', '亮度'));
      bcBox.appendChild(mkBcRange('对比度', '对比度'));
      box.appendChild(field('亮度和对比度（100% = 不变，双击滑块复位）', bcBox));

      box.appendChild(el('div', 'vm-hint',
        '「淡」适合浅色界面，「浓」适合深色界面。两者共用同一批色相，切换时自动换算明暗。'));
      return box;
    }

    /* ==== 页2：背景 ==== */
    function buildBg() {
      var box = el('div');
      box.style.cssText = 'display:flex;flex-direction:column;gap:16px';

      /* 三个独立底色 */
      [
        { key: '面板底色', label: '面板底色', dft: themeOf(th.预设).panel },
        { key: '交互区底色', label: '交互区底色', dft: themeOf(th.预设).canvas },
        { key: '卡片底色', label: '变量区底色', dft: themeOf(th.预设).card }
      ].forEach(function (item) {
        var row = colorRow({
          value: th[item.key],
          fallback: item.dft || '#ffffff',
          presets: bgPresets(),
          onLive: function (hex) { th[item.key] = hex; applyTheme(); },
          onChange: function (hex) { th[item.key] = hex; applyTheme(); saveLayout(); }
        });
        box.appendChild(field(item.label, row));
      });
      /* 界面字体（可切换） */
      var sUIFont = dropdown(FONTS.map(function (f) {
        return { value: f.id, label: f.label };
      }), S.layout.界面字体 || 'inherit', function (v) {
        S.layout.界面字体 = (v === 'inherit') ? '' : v;
        applyTheme(); saveLayout();
      });
      box.appendChild(field('界面字体', sUIFont));
      var chkGrid = document.createElement('input');
      chkGrid.type = 'checkbox'; chkGrid.checked = th.网格;
      chkGrid.addEventListener('change', function () {
        th.网格 = chkGrid.checked; saveLayout();
        /* 只切 class 不重绘 —— 重绘会连设置弹窗一起销毁 */
        if (S.canvas) S.canvas.classList.toggle('vm-nogrid', !chkGrid.checked);
      });
      var rowG = el('label', 'vm-checkrow');
      rowG.appendChild(chkGrid);
      rowG.appendChild(el('span', null, '显示网格背景'));
      box.appendChild(field('网格', rowG));

      var rngVig = document.createElement('input');
      rngVig.type = 'range'; rngVig.min = '0'; rngVig.max = '1'; rngVig.step = '0.05';
      rngVig.value = String(th.暗角);
      var vigLabel = el('div', 'vm-hint', '当前 ' + Math.round(th.暗角 * 100) + '%');
      rngVig.addEventListener('input', function () {
        th.暗角 = parseFloat(rngVig.value);
        vigLabel.textContent = '当前 ' + Math.round(th.暗角 * 100) + '%';
        applyTheme(); saveLayout();
      });
      var vigBox = el('div');
      vigBox.appendChild(rngVig);
      vigBox.appendChild(vigLabel);
      box.appendChild(field('暗角强度（0 = 关闭）', vigBox));
      return box;
    }

    /* ==== 页3：布局 ==== */
    function buildLayoutTab() {
      var box = el('div');
      box.style.cssText = 'display:flex;flex-direction:column;gap:16px';
      var rngH = document.createElement('input');
      rngH.type = 'range'; rngH.min = '140'; rngH.max = '700'; rngH.step = '10';
      rngH.value = String(S.layout.交互区高度);
      var hLabel = el('div', 'vm-hint', S.layout.交互区高度 + ' px');
      rngH.addEventListener('input', function () {
        S.layout.交互区高度 = parseInt(rngH.value, 10);
        hLabel.textContent = S.layout.交互区高度 + ' px';
        if (S.canvas) S.canvas.style.height = S.layout.交互区高度 + 'px';
        updateScrollbar();
        saveLayout();
      });
      var hBox = el('div');
      hBox.appendChild(rngH);
      hBox.appendChild(hLabel);
      box.appendChild(field('交互区高度', hBox));

      box.appendChild(el('div', 'vm-hint',
        '布局是**每个聊天各存一套**。<br>数值读每一楼自己的变量，所以翻旧楼层会看到当时的值；' +
        '只有最新一条 AI 回复上面的面板可以编辑，旧楼层是只读历史。'));
      return box;
    }

    /* ==== 页4：导入 / 导出（只有两个按钮，支持拖入） ==== */
    function buildIo() {
      var box = el('div');
      box.style.cssText = 'display:flex;flex-direction:column;gap:14px';

      var exp = el('div', 'vm-io-btn',
        '<div class="vm-io-title">导出布局</div><div class="vm-io-sub">下载成 JSON 文件</div>');
      exp.addEventListener('click', function () {
        try {
          var data = JSON.stringify(S.layout, null, 2);
          var blob = new Blob([data], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = '可视化面板布局-' + new Date().toISOString().slice(0, 10) + '.json';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
        } catch (e) {
          box.appendChild(el('div', 'vm-warn', '导出失败：' + esc(e.message)));
        }
      });

      var imp = el('div', 'vm-io-btn',
        '<div class="vm-io-title">导入布局</div><div class="vm-io-sub">点这里选文件 · 或把 JSON 拖进来</div>');
      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json,application/json';
      fileInput.style.display = 'none';

      function applyJson(text) {
        try {
          S.layout = normalizeLayout(JSON.parse(text));
          healMissingVariables('导入布局');      /* 导入的布局里带的变量也一起建出来 */
          saveLayout(); render(); syncWorldBook(); closeModal();
        } catch (e) {
          box.appendChild(el('div', 'vm-warn', '这个文件不是有效的布局 JSON：' + esc(e.message)));
        }
      }
      imp.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function () { applyJson(String(rd.result)); };
        rd.readAsText(f);
        fileInput.value = '';
      });
      imp.addEventListener('dragover', function (e) { e.preventDefault(); imp.classList.add('over'); });
      imp.addEventListener('dragleave', function () { imp.classList.remove('over'); });
      imp.addEventListener('drop', function (e) {
        e.preventDefault();
        imp.classList.remove('over');
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function () { applyJson(String(rd.result)); };
        rd.readAsText(f);
      });

      var row = el('div', 'vm-io-row');
      row.appendChild(exp);
      row.appendChild(imp);
      box.appendChild(row);
      box.appendChild(fileInput);
      box.appendChild(el('div', 'vm-hint', '导入会整体替换当前布局。想备份就先点「导出布局」。'));
      return box;
    }

    /* ==== 页5：危险操作 ==== */
    function buildDanger() {
      var box = el('div');
      box.style.cssText = 'display:flex;flex-direction:column;gap:12px';

      /* ---- 已创建的变量：勾选后删除 ---- */
      var vars = listVariables();
      var picked = {};
      var listBox = el('div', 'vm-varlist');
      if (!vars.length) {
        listBox.appendChild(el('div', 'vm-hint', '这一楼还没有任何变量。'));
      }
      vars.forEach(function (v) {
        var row = el('label', 'vm-varrow');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        var pathEl = el('span', 'vm-varpath', esc(v.path));
        row.appendChild(cb);
        row.appendChild(pathEl);
        if (v.cards.length) row.appendChild(el('span', 'vm-vartag', '有变量区'));
        row.appendChild(el('span', 'vm-varval', esc(v.text)));
        cb.addEventListener('change', function () { picked[v.path] = cb.checked; });
        listBox.appendChild(row);
      });

      box.appendChild(el('div', 'vm-hint', '已创建的变量（这一楼 stat_data 里的内容）：'));
      box.appendChild(listBox);
      box.appendChild(btn('删除选中的变量', 'danger', function () {
        var paths = Object.keys(picked).filter(function (k) { return picked[k]; });
        if (!paths.length) { global.alert('先勾选要删除的变量。'); return; }
        if (!global.confirm('确定删除选中的 ' + paths.length + ' 个变量？\n' +
          '它们会从这一楼的数据里删掉，用着它们的变量区也会一起删掉。此操作不可撤销。')) return;
        paths.forEach(deleteVariable);
        saveLayout(); closeModal(); render(); syncWorldBook();
      }));
      box.appendChild(el('div', 'vm-hint',
        '删除只影响这一楼的数据；如果是面板自动建出来的变量，AI 下次写回时可能又会出现。'));

      box.appendChild(btn('补出变量区里还缺的变量', 'ghost', function () {
        var n = healMissingVariables('手动补齐');
        if (!n) { global.alert('没有缺的变量，变量区绑的路径这一楼都有。'); return; }
        saveLayout(); closeModal(); render(); syncWorldBook();
        global.alert('已补出 ' + n + ' 个变量（默认值随样式）。');
      }));
      box.appendChild(el('div', 'vm-hint',
        '变量区绑的路径在这一楼不存在时会自动建：进度条/数值 → 0，文本 → 「请输入文本」，是或否 → 否。（打开面板、导入布局时也会自动补）'));

      var hr = el('div');
      hr.style.cssText = 'height:1px;background:var(--vm-input-border);margin:2px 0';
      box.appendChild(hr);

      box.appendChild(btn('清空所有变量区', 'danger', function () {
        if (!global.confirm('确定清空所有变量区？不可撤销。')) return;
        S.layout.卡片 = {}; saveLayout(); render(); syncWorldBook(); closeModal();
      }));
      box.appendChild(el('div', 'vm-hint', '只清空「变量区」的位置与样式，不会动你聊天里的任何变量数据。'));

      var hr2 = el('div');
      hr2.style.cssText = 'height:1px;background:var(--vm-input-border);margin:2px 0';
      box.appendChild(hr2);

      box.appendChild(el('div', 'vm-hint',
        '面板只用临时注入说明，不往世界书写任何东西（旧版本留下的条目会在启动时自动清理一次）。'));

      return box;
    }

    settingsModal('面板设置', [
      { id: 'theme',  label: '主题颜色', build: buildTheme },
      { id: 'bg',     label: '背景',     build: buildBg },
      { id: 'layout', label: '布局',     build: buildLayoutTab },
      { id: 'io',     label: '导入 / 导出', build: buildIo },
      { id: 'danger', label: '危险操作', build: buildDanger }
    ], [
      el('div', 'vm-copy', '© 2026 fuli233i · 保留所有权利（未经许可请勿转载 / 商用）'),
      btn('关闭', 'ghost', closeModal)
    ], 'panel');
  }

  /* ---------------- 对外接口 ---------------- */
  var VMVU = {
    /**
     * 初始化
     * @param {HTMLElement} rootEl 挂载点
     * @param {Object} opts { messageId, api, onLayoutChange }
     */
    init: function (rootEl, opts) {
      opts = opts || {};
      S.root = rootEl || document.getElementById('vmvu-root');
      if (!S.root) { console.warn('[可视化面板] 找不到挂载点'); return false; }
      S.api = opts.api || global.TavernHelper || null;
      S.messageId = (typeof opts.messageId === 'number') ? opts.messageId : -1;
      S.onLayoutChange = opts.onLayoutChange || null;
      S.demo = !S.api;

      var loaded = readLayout();
      /* 默认不带任何变量区（发布出去就是空面板，让用户自己拖）。
         独立预览页想看内置示例，用 ?demo=1 打开。 */
      S.layout = normalizeLayout(loaded || (demoWanted() ? DEMO_LAYOUT() : null));
      S.statData = S.demo ? DEMO_STAT() : readStat();
      healMissingVariables('打开面板');        /* 布局里有、数据里还没有的变量 → 直接建出来 */
      S.scrollY = 0;
      S.editingId = null;
      render();
      bindEditExitOnce();
      if (!S.demo) {
        syncWorldBook();                 /* = 把说明注入上下文（不写世界书） */
        cleanupWorldbook(true);          /* 顺手把以前写进世界书的东西清掉 */
      }
      console.info('[可视化面板] 就绪 · ' + (S.demo ? '演示数据' : ('第 ' + S.messageId + ' 楼')));
      return true;
    },

    /** 刷新数值（AI 更新变量后调用） */
    refresh: function () {
      if (S.demo) return;
      /* 正在拖（含正在拖出新的变量区）时不重绘：
         重绘会把草稿框一起冲掉，表现就是「按住一两秒那块区域自己没了」。 */
      if (drag.mode) return;
      S.statData = readStat(true);      /* 刷新：强制重读（变量可能刚被 AI 改过） */
      /* 删掉消息退回上一楼、或 AI 刚更新完变量之后，都可能出现「变量区绑的变量在这一楼没了」，
         这里顺手补出来（只在最新可交互楼层动手，历史楼层只读）。 */
      healMissingVariables('刷新');
      render();
    },

    /** 指定楼层并刷新 */
    setMessage: function (mid) {
      S.messageId = mid;
      this.refresh();
    },

    /** 把「当前操作对象」切到点中的那一块面板。
     *  面板内部只有一份状态（S），不切换的话弹窗/重绘会跑到别的楼层去。 */
    useMessage: function (rootEl, messageId) {
      if (!rootEl) return false;
      S.root = rootEl;
      S.messageId = (typeof messageId === 'number') ? messageId : -1;
      S.canvas = rootEl.querySelector('.vm-canvas') || S.canvas;
      S.layer = rootEl.querySelector('.vm-layer') || S.layer;
      S.scrollTrack = rootEl.querySelector('.vm-scroll-track') || S.scrollTrack;
      S.scrollThumb = rootEl.querySelector('.vm-scroll-thumb') || S.scrollThumb;
      if (!S.demo) S.statData = readStat(true);   /* 换了一块面板：这一楼要重新读 */
      return true;
    },

    openSettings: openPanelSettings,
    syncWorldBook: syncWorldBook,
    applyPrompt: applyPrompt,
    cleanupWorldbook: cleanupWorldbook,
    refit: refitAll,
    applyTheme: applyTheme,                  /* 重新套用主题（外部改完亮度/对比度后可调用） */
    render: render,                          /* 重画一遍（调试 / 自动化用） */
    healVariables: healMissingVariables,      /* 把变量区里还缺的变量补出来 */
    applyMarker: applyMarker,                 /* 解析 AI 写在 {visual-mvu: …} 里的变量改动 */
    /** 加一张变量区（也会同步世界书） */
    addCard: function (cfg) {
      var id = uid();
      var o = {};
      o[id] = cfg || {};
      S.layout.卡片[id] = normalizeLayout({ 卡片: o }, true).卡片[id];
      ensureVariable(S.layout.卡片[id]);      /* 变量不在就按样式补个默认值 */
      saveLayout(); render(); syncWorldBook();
      return id;
    },
    /** 批量加卡片：传数组 [{变量, 显示名, ...}]，默认按网格排布 */
    addCards: function (list) {
      var ids = [];
      (list || []).forEach(function (cfg, i) {
        var c = Object.assign({}, cfg);
        if (!c.位置) c.位置 = { x: 16 + (i % 4) * 228, y: 16 + Math.floor(i / 4) * 110 };
        if (!c.尺寸) c.尺寸 = { w: 210, h: 94 };
        ids.push(this.addCard(c));
      }, this);
      return ids;
    },
    /** 读某一楼的数值（不重绘） */
    peek: function (messageId) {
      try {
        var v = S.api && S.api.getVariables
          ? S.api.getVariables({ type: 'message', message_id: messageId })
          : null;
        return v ? v.stat_data : null;
      } catch (e) { return null; }
    },
    getLayout: function () { return JSON.parse(JSON.stringify(S.layout || {})); },
    /** 直接套用一份布局（会保存并重绘） */
    setLayout: function (v) {
      S.layout = normalizeLayout(v);
      saveLayout(); render();
      return true;
    },
    isDemo: function () { return S.demo; },
    /* 调试用：读内部状态，排查「面板突然空了」这类问题 */
    _state: function () {
      return {
        messageId: S.messageId,
        layout: S.layout,                 /* 调试/自动化用：直接看这份布局 */
        statData: S.statData,
        hasRoot: !!S.root,
        rootInDom: !!(S.root && document.body.contains(S.root)),
        rootChildCount: S.root ? S.root.childElementCount : -1,
        hasLayout: !!S.layout,
        cardCount: S.layout ? Object.keys(S.layout.卡片).length : -1,
        editingId: S.editingId || null,
        messageId: S.messageId,
        dragMode: drag.mode || null,
        dragId: drag.id || null,
        dragDir: drag.dir || '',
        canvasInDom: !!(S.canvas && document.body.contains(S.canvas)),
        layerInDom: !!(S.layer && document.body.contains(S.layer))
      };
    },
    destroy: function () { if (S.root) S.root.innerHTML = ''; }
  };

  /* ---------------- 演示数据 ---------------- */
  /* 独立预览页默认是空面板；想看内置示例布局就加 ?demo=1（或 #demo）。 */
  function demoWanted() {
    if (!S.demo) return false;
    try {
      var q = String((global.location && global.location.search) || '') +
              String((global.location && global.location.hash) || '');
      return /[?&#]demo\b/i.test(q);
    } catch (e) { return false; }
  }
  function DEMO_STAT() {
    return {
      好感度: 78, 体力: 41, 心情: 62,
      当前位置: '公寓 · 卧室', 是否受伤: false,
      背包: { 金币: 120 }
    };
  }
  function DEMO_LAYOUT() {
    var L = defaultLayout();
    L.卡片 = {
      z1: { 变量: '好感度', 显示名: '好感度', 样式: '进度条', min: 0, max: 100, 单位: '', 色调: 'pink', 图标: { 类型: '内置', 值: '🌸' }, 位置: { x: 16, y: 16 }, 尺寸: { w: 216, h: 96 } },
      z2: { 变量: '体力', 显示名: '体力', 样式: '进度条', min: 0, max: 100, 单位: '', 色调: 'danger', 图标: { 类型: '内置', 值: '🔋' }, 位置: { x: 248, y: 16 }, 尺寸: { w: 216, h: 96 } },
      z3: { 变量: '心情', 显示名: '心情', 样式: '进度条', min: 0, max: 100, 单位: '', 色调: 'rose', 图标: { 类型: '内置', 值: '🙂' }, 位置: { x: 16, y: 128 }, 尺寸: { w: 216, h: 96 } },
      z4: { 变量: '是否受伤', 显示名: '是否受伤', 样式: '是或否', min: 0, max: 100, 单位: '', 色调: 'gold', 图标: { 类型: '内置', 值: '🩹' }, 位置: { x: 248, y: 128 }, 尺寸: { w: 216, h: 96 } },
      z5: { 变量: '当前位置', 显示名: '当前位置', 样式: '文本', min: 0, max: 100, 单位: '', 色调: 'pink', 图标: { 类型: '内置', 值: '🗝️' }, 位置: { x: 16, y: 240 }, 尺寸: { w: 216, h: 96 } },
      z6: { 变量: '背包.金币', 显示名: '金币', 样式: '数值', min: 0, max: 999, 单位: '枚', 色调: 'gold', 图标: { 类型: '内置', 值: '🪙' }, 位置: { x: 248, y: 240 }, 尺寸: { w: 216, h: 96 } }
    };
    return L;
  }

  global.VMVU = VMVU;
  try { console.info('[可视化面板] 脚本版本 ' + BUILD + '（路径写法：/<变量>，不带 stat_data 前缀）'); } catch (e) {}

  /* 单独打开预览时自动挂载（在酒馆里由扩展调用 init，不会走这里）
   * 注意：不能只试一次 —— 预览 iframe 里脚本执行的时机可能早于 DOM 就绪，
   * 或者挂载点是随后才被插入的。所以这里带重试。 */
  if (!global.__VMVU_NO_AUTOBOOT) {
    var autoTries = 0;
    var autoBoot = function () {
      var r = document.getElementById('vmvu-root');
      if (!r) {
        if (++autoTries < 40) setTimeout(autoBoot, 100);
        return;
      }
      if (r.getAttribute('data-vmvu-inited')) return;
      var ok = false;
      try { ok = VMVU.init(r, {}); } catch (e) { console.error('[可视化面板] 自动挂载失败', e); }
      if (ok) r.setAttribute('data-vmvu-inited', '1');
      else if (++autoTries < 40) setTimeout(autoBoot, 100);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoBoot);
    else autoBoot();
  }
})(typeof window !== 'undefined' ? window : this);
