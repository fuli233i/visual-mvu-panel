/* ============================================================
 *  可视化 MVU 面板 · 扩展入口
 *  © 2026 fuli233i · 保留所有权利（未经许可请勿转载 / 商用）
 *
 *  作用：当某条 AI 回复的正文里出现触发标记（默认 {visual-mvu}）时，
 *        把面板挂到那一条回复下面；没写标记的楼层不挂。
 *  依赖：酒馆助手（JS-Slash-Runner）提供的全局 TavernHelper。
 *  说明：面板代码本身在 vmvu-panel.js 里，它通过 window.VMVU 暴露接口。
 * ============================================================ */

(function () {
  'use strict';

  var EXT_ID = 'visual-mvu-panel';
  var ASSET_BASE = '/scripts/extensions/third-party/' + EXT_ID + '/';
  var ROOT_ID = 'vmvu-root';

  /* ---------------- 触发标记 ----------------
   * 只有 AI 回复的正文里出现下面任一标记，这一楼才会挂面板。
   *   {visual-mvu}    [visual-mvu]    <visual-mvu>    <visual-mvu/>
   *
   * 为什么要认「裸写的 visual-mvu」：
   *   酒馆渲染消息时会过一遍 HTML 过滤，尖括号写的 <visual-mvu> 会被当成
   *   未知标签直接剥掉，正文里只剩下 visual-mvu 几个字。只认尖括号就会漏掉。
   * 推荐还是用 {visual-mvu}（花括号最稳，也不会被 HTML 过滤吃掉）；
   *   不想让裸词触发，把最后那条删掉即可。
   * 想换标记：改下面的正则即可（例如 /\{\s*面板\s*\}/）。
   * 想让所有 AI 回复都挂面板（旧行为）：把 TRIGGER_PATTERNS 设成 []。 */
  var TRIGGER_PATTERNS = [
    /* {visual-mvu} / { visual mvu }，后面可以跟一段「标记更新」内容：
       {visual-mvu: 体力-5, 好感度=95} —— 整段都会被隐藏，也用这段来改面板变量 */
    /\{\s*visual[-\s]?mvu\s*(?:[:：]\s*[^}]*)?\}/i,
    /\[\s*visual[-\s]?mvu\s*\]/i,     /* [visual-mvu] */
    /<\s*visual[-\s]?mvu\s*\/?\s*>/i, /* <visual-mvu> / <visual-mvu/>（代码块里没被过滤时） */
    /\bvisual-?mvu\b/i,               /* 尖括号被过滤后剩下的裸文本 */
    /* 兜底：有些预设/正则会把标记里的「visual-mvu」几个字单独吃掉，
       只剩 `{: 变量+1, 别的=值}` —— 这种也认，不然那一行会露在正文里。
       只认「花括号 + 冒号 + 里面至少有一个 + - = 运算」，避免误伤正文里正常的 {xxx:yyy} */
    /\{\s*[:：]\s*[^}]*[+\-=＝][^}]*\}/i
  ];
  var TRIGGER_HINT = '{visual-mvu}';
  var HIDE_TRIGGER = true;            /* 把标记从正文里藏起来，别让它露在界面上 */
  var TRIGGER_CLASS = 'vmvu-trigger';
  var HIDDEN_CLASS = 'vmvu-code';

  /* ---------------- {unvis} 隐形开关 ----------------
   * 约定：AI 把「不该给玩家看的东西」夹在两个 {unvis} 中间，例如
   *     {unvis}{visual-mvu: 体力-5, 好感度=95}{unvis}
   *     {unvis}<UpdateVariable>…</UpdateVariable>{unvis}
   * 这两个 {unvis} 之间的一切都隐藏，两个 token 本身也隐藏。
   *
   * 这是「让 AI 自己说清楚」的办法：不用扩展去猜哪个标签是给机器看的
   * （猜过三次都误伤了正文 / 选项块）。 */
  var UNVIS_TOKEN = '{unvis}';
  var UNVIS_PATTERNS = [
    /\{\s*unvis\s*\}[\s\S]*?\{\s*unvis\s*\}/i,   /* 一整段（含两头的 token） */
    /\{\s*unvis\s*\}/i                            /* 落单的（另一半被别的正则吃掉时） */
  ];

  /* ---------------- 工具 ---------------- */
  function log() {
    try { console.log.apply(console, ['[可视化面板]'].concat([].slice.call(arguments))); } catch (e) {}
  }
  function warn() {
    try { console.warn.apply(console, ['[可视化面板]'].concat([].slice.call(arguments))); } catch (e) {}
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------------- 触发标记识别 ---------------- */
  function findTrigger(str) {
    if (!str) return null;
    for (var i = 0; i < TRIGGER_PATTERNS.length; i++) {
      var m = TRIGGER_PATTERNS[i].exec(str);
      if (m && m[0]) return m;
    }
    return null;
  }
  /* 没配标记 = 不设门槛，所有 AI 回复都挂 */
  function hasTrigger(str) {
    if (!TRIGGER_PATTERNS.length) return true;
    return !!findTrigger(str);
  }

  /* 把正文里的标记换成隐藏 span：界面上看不见，但 textContent 里还在，
     所以下一次扫描仍然认得出这一楼该挂面板。 */
  /* MVU 的指令块：很多卡自带正则把它们藏起来，没有卡帮忙时就会原样露在正文里。
     这里由扩展自己兜底隐藏（不动正文数据，只是不显示）。

     判定用的是「正经 HTML 之外的标签」，而不是写死的那几个名字：
     凡是正经 HTML 里没有的标签（各张卡自己约定的 <UpdateVariable>、
     <JSONPatch>、<StatusPlaceHolderImpl/> 之类），一律整块藏掉；
     <p> <br> <b> <code> 这类正经 HTML 一个都不碰。
     好处是换张卡、换个词都照样管用，不用回来改代码。 */
  var HTML_TAGS = (function () {
    var names = ('a abbr address area article aside audio b base bdi bdo big blockquote br button ' +
      'canvas caption center cite code col colgroup data dd del details dfn dialog div dl dt em ' +
      'embed fieldset figcaption figure font footer form h1 h2 h3 h4 h5 h6 head header hgroup hr ' +
      'html i iframe img input ins kbd label legend li link main map mark menu meta meter nav ' +
      'noscript object ol optgroup option output p param picture pre progress q rp rt ruby s samp ' +
      'script section select slot small source span strong style sub summary sup table tbody td ' +
      'template textarea tfoot th thead time title tr track u ul var video wbr ' +
      /* 内联 SVG 也认（有些卡会放图标） */
      'svg path circle rect line polyline polygon ellipse g defs use mask pattern clipPath ' +
      'linearGradient radialGradient stop text tspan filter feGaussianBlur').split(/\s+/);
    var set = {};
    names.forEach(function (x) { if (x) set[x.toLowerCase()] = 1; });
    return set;
  })();

  /* 在一段纯文本里找出「下一个该整块藏起来的东西」。
     写法上刻意避开「先找开头再懒匹配结尾」那种回溯写法（长正文会卡），
     改成一次扫描找标签、再去配另一半，全程 O(n)。 */
  /* 哪些标签算「给 AI / 程序看的指令」要整块藏掉？
   *
   * 这条规则翻车过三次（<game> 正文容器、<LILY_STORY> 正文容器、<fox_selc> 选项块），
   * 每一次都是「靠猜」猜错的。所以现在**不猜了**，只认两件事：
   *
   *   ① 名字必须出现在下面这份名单里（都是确定的指令标签）。
   *      名单外的一律不碰 —— 就算它带下划线、就算它不是正经 HTML。
   *   ② 这张卡自己**没管**它。卡既然写了针对某个标签的显示正则，
   *      就说明这标签归卡管：正文容器、美化面板、CG 渲染、状态栏全是这一类。
   *
   * 判断「卡管了哪些标签」：读当前角色 regex_scripts 里会影响显示的规则，
   * 把出现在 findRegex 里的标签名收集起来。 */
  var HIDE_TAG_NAMES = ['updatevariable', 'jsonpatch', 'statusplaceholderimpl', 'analysis',
    'disclaimer', 'think', 'thinking', 'reasoning', 'cot', 'scratchpad', 'inner_monologue'];
  /* 思考类标签：名字里带 think / thought / reason 的一律当指令块藏掉
     （实测见过 think_nya、think_fox~、reasoning_content 这些）。
     这类名字几乎不可能被卡拿来当正文容器，风险很低；
     真要例外，让 AI 把那内容夹进 {unvis} 里反而更直接。
     注意：仍然排在「卡自己管过」之后 —— 卡为它写了正则，就还是卡说了算。 */
  function looksLikeReasoning(name) {
    return /think|thought|reason|monologue/.test(String(name || '').toLowerCase());
  }
  /* 一个指令块最多这么长。超过就不认（宁可不删）——
     踩过的坑：AI 漏写 </UpdateVariable> 时，匹配会一路吃到下一个闭标签，
     把中间一大段正文吞掉。 */
  var HIDE_BLOCK_MAX = 4000;

  /* 这张卡自己用正则处理了哪些标签？（只算会影响显示的规则） */
  var handledCache = null, handledCacheAt = 0;
  function cardHandledTags() {
    var now = Date.now();
    if (handledCache && (now - handledCacheAt) < 5000) return handledCache;
    var out = {};
    try {
      var ctx = (window.SillyTavern && window.SillyTavern.getContext)
        ? window.SillyTavern.getContext() : null;
      var ch = ctx && ctx.characters && ctx.characters[ctx.characterId];
      var list = (ch && ch.data && ch.data.extensions && ch.data.extensions.regex_scripts) || [];
      list.forEach(function (s) {
        if (!s || s.disabled) return;
        if (s.promptOnly && !s.markdownOnly) return;      /* 只管提示词的，不影响显示 */
        var re = /<([A-Za-z][A-Za-z0-9_-]*)/g, m, f = String(s.findRegex || '');
        while ((m = re.exec(f))) out[m[1].toLowerCase()] = 1;
      });
    } catch (e) {}
    handledCache = out; handledCacheAt = now;
    return out;
  }

  function isInstructionTag(name, handled) {
    var n = String(name || '').toLowerCase();
    if (!n || HTML_TAGS[n]) return false;
    if (handled && handled[n]) return false;               /* ① 卡自己管，别插手 */
    if (HIDE_TAG_NAMES.indexOf(n) >= 0) return true;       /* ② 名单里的指令标签 */
    return looksLikeReasoning(n);                          /* ③ 思考类标签 */
  }

  var ANY_TAG_RE = /<\/?([A-Za-z][A-Za-z0-9_]*)\b[^>]*>/g;
  function findHiddenBlock(str, handled) {
    var m;
    ANY_TAG_RE.lastIndex = 0;
    while ((m = ANY_TAG_RE.exec(str))) {
      if (!isInstructionTag(m[1], handled)) continue;
      var isOpen = m[0].charAt(1) !== '/';
      /* 配另一半：开标签往后找闭标签，闭标签往前找开标签 */
      var mate = new RegExp((isOpen ? '<\\/' : '<') + m[1] + '\\b[^>]*>', 'ig');
      var mm, at = -1, atText = '';
      while ((mm = mate.exec(str))) {
        if (isOpen ? (mm.index > m.index) : (mm.index < m.index)) {
          at = mm.index; atText = mm[0];
          if (isOpen) break;                     /* 往后取第一个 */
        } else if (!isOpen) {
          at = -1; atText = '';                  /* 越过闭标签的位置，之前找的都不算 */
        }
      }
      if (at < 0) return { index: m.index, text: m[0] };      /* 落单的半个标签，收掉它 */
      var from = Math.min(m.index, at);
      var to = Math.max(m.index, at) + (at < m.index ? m[0].length : atText.length);
      /* 整块太长 → 多半是 AI 漏写闭标签，只收掉这个标签本身，别吞正文 */
      if (to - from > HIDE_BLOCK_MAX) return { index: m.index, text: m[0] };
      return { index: from, text: str.slice(from, to) };
    }
    return null;
  }

  function maskCodeBlocksIn(text, handled) {
    var nodes = [];
    var walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      var p = n.parentNode;
      if (!p) continue;
      if (p.closest && (p.closest('.' + HIDDEN_CLASS) || p.closest('#' + ROOT_ID))) continue;
      var v = n.nodeValue || '';
      if (findHiddenBlock(v, handled)) nodes.push(n);
    }
    nodes.forEach(function (node) {
      var rest = node.nodeValue;
      var frag = document.createDocumentFragment();
      var hit = false;
      while (rest) {
        var best = findHiddenBlock(rest, handled);
        if (!best) break;
        hit = true;
        if (best.index > 0) frag.appendChild(document.createTextNode(rest.slice(0, best.index)));
        var span = document.createElement('span');
        span.className = HIDDEN_CLASS;
        span.style.display = 'none';
        span.textContent = best.text;
        frag.appendChild(span);
        rest = rest.slice(best.index + best.text.length);
      }
      if (!hit) return;
      if (rest) frag.appendChild(document.createTextNode(rest));
      node.parentNode.replaceChild(frag, node);
    });
    /* 被整段藏空的 <pre> / <code> 壳也收掉，免得留一个空框 */
    var pres = text.querySelectorAll('pre');
    for (var k = 0; k < pres.length; k++) {
      var pre = pres[k];
      var tw = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT, null);
      var vis = '', x;
      while ((x = tw.nextNode())) {
        if (x.parentNode && x.parentNode.closest && x.parentNode.closest('.' + HIDDEN_CLASS)) continue;
        vis += x.nodeValue || '';
      }
      if (!vis.replace(/\s/g, '')) pre.style.display = 'none';
    }
  }

  function maskTriggerIn(text) {
    if (!HIDE_TRIGGER) return;
    /* 隐藏时把 {unvis} 那对开关也算进来：取「最靠左」的那个匹配，
       所以 {unvis}{visual-mvu}{unvis} 会整段一起藏（而不是只藏中间那截）。 */
    var patterns = UNVIS_PATTERNS.concat(TRIGGER_PATTERNS);
    var findHide = function (s) {
      var best = null;
      patterns.forEach(function (re) {
        var m = re.exec(s);
        if (m && m[0] && (!best || m.index < best.index)) best = m;
      });
      return best;
    };
    var nodes = [];
    var walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      var p = n.parentNode;
      if (!p) continue;
      /* 跳过已经藏起来的标记，以及面板自己生成的 DOM */
      if (p.closest && (p.closest('.' + TRIGGER_CLASS) || p.closest('#' + ROOT_ID))) continue;
      if (n.nodeValue && findHide(n.nodeValue)) nodes.push(n);
    }
    nodes.forEach(function (node) {
      var rest = node.nodeValue;
      var frag = document.createDocumentFragment();
      var hit = false;
      while (true) {
        var m = findHide(rest);
        if (!m) break;
        hit = true;
        if (m.index > 0) frag.appendChild(document.createTextNode(rest.slice(0, m.index)));
        var span = document.createElement('span');
        span.className = TRIGGER_CLASS;
        span.style.display = 'none';
        span.textContent = m[0];
        frag.appendChild(span);
        rest = rest.slice(m.index + m[0].length);
      }
      if (!hit) return;
      if (rest) frag.appendChild(document.createTextNode(rest));
      if (node.parentNode) node.parentNode.replaceChild(frag, node);
    });
  }

  /* 把这一楼正文里的「指令块 + 标记」都藏起来。
     关键点：**每一层都要做**，跟这一楼挂不挂面板、是不是最近三层、是不是正在
     流式输出都无关。以前只在「挂了面板的那三层」里做，于是往上翻的那些旧楼层
     会把 {visual-mvu: 体力-5} / {: 好感度+1} 原样露在正文里。
     玩家自己写的那一楼不动（免得把人家正文里的字吃了）。 */
  function maskMessageText(mes) {
    var text = mes.querySelector('.mes_text');
    if (!text) return;
    var key = text.textContent || '';
    var had = mes.__vmvuMasked || 0;
    if (mes.__vmvuMaskKey === key) {
      if (!had) return;                                    /* 本来就没东西可藏 */
      /* 藏过、而且藏的那几个节点还在（酒馆重绘会整块换掉，那就得重做一遍） */
      if (text.querySelector('.' + HIDDEN_CLASS + ', .' + TRIGGER_CLASS)) return;
    }
    if (HIDE_TRIGGER) maskTriggerIn(text);
    maskCodeBlocksIn(text, cardHandledTags());
    mes.__vmvuMaskKey = text.textContent || '';
    mes.__vmvuMasked = text.querySelectorAll('.' + HIDDEN_CLASS + ', .' + TRIGGER_CLASS).length;
  }

  /* ---------------- 让酒馆在「渲染之前」就把指令块删掉 ----------------
   *
   * 为什么非走这条路不可：
   *   酒馆渲染消息时会先过一遍 DOMPurify，而 <UpdateVariable> / <JSONPatch>
   *   这类「未知标签」会被**剥掉外壳、只留下里面的文字**（那段 JSON、那段说明）。
   *   也就是说等它进了 DOM，已经看不出「这里原本是一块指令」了 ——
   *   光靠前端扫 DOM 只能藏住 {visual-mvu: …} 这种纯文本标记，
   *   标签块的内容照样露在外面。
   *
   *   角色卡自带的「正则」就是干这件事的（[隐藏]变量更新命令 之类）。
   *   没有卡帮忙的聊天，由本扩展往酒馆的正则表里登记一条同样的规则。
   *
   * 两个要点：
   *   · 规则只在「格式显示」时生效（markdownOnly），所以界面上干净，
   *     而发给模型的历史原文一个字都不动 —— AI 还能照着模仿这套格式。
   *   · 判定用「正经 HTML 之外的标签」，不写死卡的名字：
   *     换张卡、换个标签名都照样管用，仓库里也不用留别人的专有名字。
   */
  var HIDE_REGEX_NAME = '可视化MVU面板 · 隐藏指令块';
  var HIDE_REGEX_FLAG = '__vmvuHide';      /* 打个记号，方便认出这是本扩展登记的 */

  function hideFindRegexSource(handled) {
    /* notHandled：这张卡自己用正则管过的标签名不碰（正文容器 / 美化面板 / CG / 状态栏）。 */
    var names = Object.keys(handled || {});
    var notHandled = names.length ? ('(?!(?:' + names.join('|') + ')\\b)') : '';
    /* 思考类标签：名字任意位置带 think / thought / reason / monologue */
    var byReason = '(?=[A-Za-z0-9_-]*(?:think|thought|reason|monologue))[A-Za-z][A-Za-z0-9_-]*';
    var byName = '(?:(?:' + HIDE_TAG_NAMES.join('|') + ')|' + byReason + ')';
    /* ① 名单里的指令标签（卡没管才删）
       ② 触发标记（含被别的正则吃掉「visual-mvu」后剩下的 {: …}） */
    return '(?:' +
      /* 闭合标签后面允许有点杂物：实测有卡把思考块写成 <think_fox~>…</think_fox~> */
      '<' + notHandled + '(' + byName + ')\\b[^>]*>[\\s\\S]{0,' + HIDE_BLOCK_MAX + '}?<\\/\\1[^>]{0,24}>' +
      '|\\{\\s*unvis\\s*\\}[\\s\\S]{0,' + HIDE_BLOCK_MAX + '}?\\{\\s*unvis\\s*\\}' +
      '|\\{\\s*unvis\\s*\\}' +
      '|\\{\\s*visual[-\\s]?mvu\\s*(?:[:：]\\s*[^}]*)?\\}' +
      '|\\{\\s*[:：]\\s*[^}]*[+\\-=＝][^}]*\\}' +
      '|\\[\\s*visual[-\\s]?mvu\\s*\\]' +
      '|<\\s*visual[-\\s]?mvu\\s*\\/?\\s*>' +
      ')';
  }
  function hideFindRegexString() {
    return '/' + hideFindRegexSource(cardHandledTags()) + '/gi';
  }
  function isOurs(s) {
    return !!(s && (s[HIDE_REGEX_FLAG] || s.scriptName === HIDE_REGEX_NAME));
  }

  function ensureHideRegex() {
    try {
      handledCache = null;                       /* 换聊天/换角色了，重新认一遍卡管了哪些标签 */
      var ctx = (window.SillyTavern && window.SillyTavern.getContext)
        ? window.SillyTavern.getContext() : null;
      var st = ctx && ctx.extensionSettings;
      if (!st) return false;                       /* 不是酒馆环境（比如独立预览） */
      if (!Array.isArray(st.regex)) st.regex = [];
      var want = hideFindRegexString();
      /* 已经登记过：只把关掉/改坏的「规则内容」补回来，但仍尊重用户对「停用」的选择 */
      for (var i = 0; i < st.regex.length; i++) {
        var s = st.regex[i];
        if (!isOurs(s)) continue;
        if (s.disabled) return true;               /* 用户自己停用的，就别再插手 */
        if (s.findRegex !== want) {
          s.findRegex = want;
          s.replaceString = '';
          s.placement = [2];
          s.markdownOnly = true;
          s.promptOnly = false;
          s[HIDE_REGEX_FLAG] = true;
          if (typeof ctx.saveSettingsDebounced === 'function') ctx.saveSettingsDebounced();
          log('隐藏指令块的正则已更新到当前版本');
        }
        return true;
      }
      var script = {
        id: 'vmvu-hide-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        scriptName: HIDE_REGEX_NAME,
        findRegex: want,
        replaceString: '',
        trimStrings: [],
        placement: [2],                            /* 2 = AI 输出 */
        disabled: false,
        markdownOnly: true,                        /* 只改显示，不改发给模型的历史 */
        promptOnly: false,
        runOnEdit: false,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null
      };
      script[HIDE_REGEX_FLAG] = true;
      st.regex.push(script);
      if (typeof ctx.saveSettingsDebounced === 'function') ctx.saveSettingsDebounced();
      log('已往酒馆正则表登记「' + HIDE_REGEX_NAME + '」：渲染前删掉指令块');
      if (Array.isArray(st.disabledExtensions) && st.disabledExtensions.indexOf('regex') >= 0) {
        warn('酒馆的「正则」扩展当前是停用状态，这条规则不会生效 —— ' +
             '前端自己那层隐藏还在，但 <UpdateVariable> 这类块的内容会露出来。请启用「正则」扩展。');
      }
      return true;
    } catch (e) { warn('登记隐藏指令块的正则失败', e); return false; }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('加载失败：' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadStyle(href) {
    return new Promise(function (resolve) {
      if (document.querySelector('link[data-vmvu-style]')) return resolve();
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.setAttribute('data-vmvu-style', '1');
      l.onload = function () { resolve(); };
      l.onerror = function () { warn('样式加载失败：' + href); resolve(); };
      document.head.appendChild(l);
    });
  }

  /* ---------------- 等酒馆助手就绪 ---------------- */
  async function waitTavernHelper(timeoutMs) {
    var deadline = Date.now() + (timeoutMs || 30000);
    while (Date.now() < deadline) {
      if (window.TavernHelper && typeof window.TavernHelper.getVariables === 'function') return window.TavernHelper;
      await sleep(200);
    }
    return null;
  }

  /* ---------------- 把面板注入一条消息 ---------------- */
  /* 消息的「原始正文」。有些预设的正则会改写显示内容，
     万一标记在渲染时被吃掉，还能从原始文本里认出来。 */
  function rawMessageText(messageId) {
    try {
      var ctx = (window.SillyTavern && window.SillyTavern.getContext)
        ? window.SillyTavern.getContext() : null;
      var m = ctx && ctx.chat && ctx.chat[messageId];
      return (m && typeof m.mes === 'string') ? m.mes : '';
    } catch (e) { return ''; }
  }

  /* 全聊天里最新的一条 AI 回复：只有它的面板可交互 */
  function latestAiFloorId() {
    var last = -1;
    var list = document.querySelectorAll('#chat > .mes[mesid]');
    list.forEach(function (mes) {
      if (mes.getAttribute('is_user') === 'true') return;
      if (mes.getAttribute('is_system') === 'true') return;
      var id = Number(mes.getAttribute('mesid'));
      if (isFinite(id) && id > last) last = id;
    });
    return last;
  }

  /* ---------------- 流式输出防抖 ----------------
   * 酒馆在流式输出时，每收到一段文字就把这一楼的正文 innerHTML 整个重写一遍；
   * 我们塞在正文里的面板会跟着被抹掉，于是「挂上 → 被抹 → 再挂」不停循环，
   * 看起来就是流式时面板在闪、偶尔还叠出两块。
   *
   * 判断办法：看这一楼的**原始正文**（ctx.chat[id].mes）最近有没有变过。
   * 用原始正文而不是 DOM 文本，是因为原始正文不受我们自己改 DOM（隐藏标记、
   * 往正文里插面板）的影响，不会自己触发自己。
   * 只要最近 SETTLE_MS 毫秒内还变过，就认为「还在写」，先不挂。 */
  var SETTLE_MS = 700;          /* 正文安静这么久才算写完 */
  var SETTLE_POLL_MS = 400;     /* 没写完就过这么久再看一眼 */
  var rawSeen = {};
  function rawChangedRecently(messageId) {
    var raw = rawMessageText(messageId);
    var now = Date.now();
    var last = rawSeen[messageId];
    if (!last || last.text !== raw) {
      rawSeen[messageId] = { text: raw, at: now };
      return true;
    }
    return (now - last.at) < SETTLE_MS;
  }

  /* 点哪一块面板，就把「当前操作对象」切到那一块。
     面板内部只有一份状态，不切的话弹窗/重绘会跑到最后初始化的那块去。 */
  function bindActivate(root, messageId) {
    if (root.getAttribute('data-vmvu-activate')) return;
    root.setAttribute('data-vmvu-activate', '1');
    var activate = function () {
      if (root.getAttribute('data-vmvu-live') === '0') return;   /* 旧楼层只读 */
      if (window.VMVU && window.VMVU.useMessage) {
        try { window.VMVU.useMessage(root, messageId); } catch (e) {}
      }
    };
    /* 捕获阶段先切状态，后面卡片/齿轮自己的处理函数才会作用在正确的楼层上 */
    root.addEventListener('mousedown', activate, true);
    root.addEventListener('click', activate, true);
  }

  function syncLiveFlag(root, messageId, liveId) {
    var live = (messageId === liveId) ? '1' : '0';
    var changed = root.getAttribute('data-vmvu-live') !== live;
    root.setAttribute('data-vmvu-live', live);
    bindActivate(root, messageId);
    return changed;
  }

  function injectIntoMessage(mes, messageId, liveId) {
    var text = mes.querySelector('.mes_text');
    if (!text) return false;

    var wantPanel = hasTrigger(text.textContent || '') || hasTrigger(rawMessageText(messageId));

    /* 同一楼只留一个面板。酒馆重绘（morphdom / 淡入那套）偶尔会把旧面板变成
       「还在正文里、但已经不是我们认得的那个节点」的孤儿，看起来就是凭空
       多出一块一模一样的面板。这里直接把多出来的那几块删掉。 */
    var hosts = text.querySelectorAll('#' + ROOT_ID);
    for (var h = 1; h < hosts.length; h++) {
      if (hosts[h].parentNode) hosts[h].parentNode.removeChild(hosts[h]);
    }
    var exist = hosts[0] || null;

    /* 正文里没有触发标记（或标记被删掉了）→ 这一楼不该有面板 */
    if (!wantPanel) {
      if (exist && exist.parentNode) exist.parentNode.removeChild(exist);
      return false;
    }

    /* 已经注入过：同一楼只刷新，不重复插入 */
    if (exist && exist.getAttribute('data-vmvu-floor') === String(messageId)) {
      maskTriggerIn(text);
      maskCodeBlocksIn(text);
      var liveChanged = syncLiveFlag(exist, messageId, liveId);
      if (window.VMVU) {
        try {
          if (exist.getAttribute('data-vmvu-inited')) {
            var st = window.VMVU._state ? window.VMVU._state() : null;
            var isActive = !!(st && st.messageId === messageId);
            /* 只有「当前操作的那块」或者「可交互状态变了」才重绘，避免每块面板反复重建 */
            if (liveChanged || isActive) {
              if (!isActive) window.VMVU.useMessage(exist, messageId);
              window.VMVU.refresh();
            }
          } else if (window.VMVU.init(exist, { api: window.TavernHelper, messageId: messageId })) {
            exist.setAttribute('data-vmvu-inited', '1');
          }
        } catch (e) { warn('刷新失败（第 ' + messageId + ' 楼）', e); }
      }
      /* 最新楼层：顺便读一下 AI 写在标记里的变量改动（{visual-mvu: 体力-5}） */
      if (messageId === liveId && window.VMVU && window.VMVU.applyMarker) {
        try { window.VMVU.applyMarker(rawMessageText(messageId), messageId); } catch (e) {}
      }
      return false;
    }
    if (exist && exist.parentNode) exist.parentNode.removeChild(exist);

    var host = document.createElement('div');
    host.id = ROOT_ID;
    host.className = 'vmvu-mount';
    host.setAttribute('data-vmvu-floor', String(messageId));
    syncLiveFlag(host, messageId, liveId);

    /* 插在消息正文后面 */
    text.appendChild(host);
    maskTriggerIn(text);
      maskCodeBlocksIn(text);

    if (!window.VMVU) { warn('面板脚本还没加载完'); return false; }

    var ok = false;
    try {
      ok = window.VMVU.init(host, {
        api: window.TavernHelper,
        messageId: messageId
      });
    } catch (e) { warn('初始化失败（第 ' + messageId + ' 楼）', e); }

    if (ok) host.setAttribute('data-vmvu-inited', '1');
    if (ok && messageId === liveId && window.VMVU.applyMarker) {
      try { window.VMVU.applyMarker(rawMessageText(messageId), messageId); } catch (e) {}
    }
    return ok;
  }

  /* 只给「AI 回复」挂面板（跳过用户消息、系统消息） */
  /* 只渲染最近这么多层：长聊天里每楼一块面板会线性吃内存，
     翻上去的旧楼层不挂面板（布局是按聊天存的，不会丢数据）。 */
  var MAX_PANEL_FLOORS = 3;

  function renderAll() {
    var liveId = latestAiFloorId();
    var list = document.querySelectorAll('#chat > .mes[mesid]');
    var n = 0;
    var deferred = false;
    /* 第一步：把正文里的指令块 / 标记藏掉。
       放在最前面、且每一层都做——翻上去的旧楼层、正在流式输出的那一楼，
       都不能让 {visual-mvu: …} 这种东西露在界面上。 */
    list.forEach(function (mes) {
      if (mes.getAttribute('is_user') === 'true') return;   /* 玩家自己写的字不动 */
      maskMessageText(mes);
    });
    /* 先挑出「有触发标记的 AI 楼层」，只保留最后 MAX_PANEL_FLOORS 层 */
    var candidates = [];
    list.forEach(function (mes) {
      var mid = Number(mes.getAttribute('mesid'));
      if (!isFinite(mid)) return;
      if (mes.getAttribute('is_user') === 'true') return;
      if (mes.getAttribute('is_system') === 'true') return;
      candidates.push({ mes: mes, mid: mid });
    });
    var keep = {};
    candidates.slice(-MAX_PANEL_FLOORS).forEach(function (c) { keep[c.mid] = 1; });

    list.forEach(function (mes) {
      var mid = Number(mes.getAttribute('mesid'));
      if (!isFinite(mid)) return;
      if (mes.getAttribute('is_user') === 'true') return;
      if (mes.getAttribute('is_system') === 'true') return;
      /* 超出「最近几层」的：把已经挂上的面板摘掉，不占 DOM */
      if (!keep[mid]) {
        var old = mes.querySelector('#' + ROOT_ID);
        if (old && old.parentNode) old.parentNode.removeChild(old);
        return;
      }
      /* 正在流式输出的那一楼先别挂：酒馆每收到一段文字就把正文整个重写一遍，
         这时候挂上去的面板下一秒就被抹掉，表现就是「流式时一直在闪」。 */
      if (mid === liveId && rawChangedRecently(mid)) { deferred = true; return; }
      if (injectIntoMessage(mes, mid, liveId)) n++;
    });
    if (deferred) schedule(SETTLE_POLL_MS);
    return n;
  }

  /* ---------------- 事件挂载 ---------------- */
  /* 盯住聊天区：消息被插入 / 重渲染 / 编辑，都会触发一次重扫。
   * 这条最可靠，不依赖酒馆或酒馆助手暴露什么全局变量：
   *   - ST 1.15 起不再往 window 上挂 eventSource / event_types
   *   - 酒馆助手 4.x 的事件函数也不再挂在 TavernHelper 上（是全局 eventOn）
   * 只靠事件名很容易一条都绑不上，然后页面加载几十秒后就再也不扫描了。 */
  var chatObserver = null;
  var observedChat = null;

  function attachChatObserver() {
    if (typeof MutationObserver === 'undefined') return;
    var chat = document.getElementById('chat');
    if (!chat) return;
    if (chatObserver && observedChat === chat) return;
    if (chatObserver) chatObserver.disconnect();
    observedChat = chat;
    chatObserver = new MutationObserver(function (mutations) {
      /* 关键：面板自己的重绘也在 #chat 里，如果那也算「消息变了」，
         就会变成 扫描 → 重建面板 → 观察器触发 → 再扫描 的死循环，
         表现就是鼠标悬停闪、拖动被打断。所以只认「面板之外」的改动。 */
      for (var i = 0; i < mutations.length; i++) {
        var t = mutations[i].target;
        if (!t || typeof t.closest !== 'function') return schedule(150);
        if (!t.closest('#' + ROOT_ID)) return schedule(150);
      }
    });
    chatObserver.observe(chat, { childList: true, subtree: true, characterData: true });
    log('已盯住聊天区，消息变化会自动重扫');
  }

  function bindEvents() {
    /* ① 酒馆自带事件：新版走 SillyTavern.getContext()，老版挂在 window 上 */
    var ctx = null;
    try {
      ctx = (window.SillyTavern && window.SillyTavern.getContext)
        ? window.SillyTavern.getContext() : null;
    } catch (e) {}
    var es = (ctx && ctx.eventSource) || window.eventSource;
    var et = (ctx && (ctx.eventTypes || ctx.event_types)) || window.event_types;
    if (es && et && typeof es.on === 'function') {
      ['CHARACTER_MESSAGE_RENDERED', 'MESSAGE_UPDATED', 'MESSAGE_EDITED', 'MESSAGE_SWIPED', 'CHAT_CHANGED',
        'MESSAGE_RECEIVED', 'MESSAGE_DELETED', 'GENERATION_ENDED', 'GENERATION_STOPPED'].forEach(function (k) {
        if (!et[k]) return;
        try {
          es.on(et[k], function () {
            /* 设置/正则表是酒馆加载完才齐的，顺手补一次登记（幂等，登记过就直接返回） */
            if (k === 'CHAT_CHANGED') ensureHideRegex();
            /* 换了聊天：布局是「每个聊天一套」，说明要按新布局重新注入 */
            if (k === 'CHAT_CHANGED' && window.VMVU && window.VMVU.applyPrompt) {
              try { window.VMVU.applyPrompt(); } catch (e) {}
            }
            /* 出字结束后正文已经定了，但我们的「安静一会儿再挂」还要等一拍，
               所以这里给久一点的延迟，省得白扫几轮 */
            var d = 120;
            if (k === 'CHAT_CHANGED') d = 600;
            else if (k === 'MESSAGE_RECEIVED' || k === 'MESSAGE_DELETED' ||
                     k === 'GENERATION_ENDED' || k === 'GENERATION_STOPPED') d = 300;
            schedule(d);
            schedulePromptRefresh();
          });
        } catch (e) {}
      });
      log('已挂上酒馆消息事件');
    }

    /* ② 酒馆助手的事件：4.x 是全局 eventOn；老版本挂在 TavernHelper 上 */
    var TH = window.TavernHelper;
    var thOn = (TH && typeof TH.eventOn === 'function') ? TH.eventOn
      : (typeof window.eventOn === 'function' ? window.eventOn : null);
    if (thOn) {
      ['message_iframe_render_ended', 'message_updated', 'message_edited', 'message_swiped', 'chat_changed',
        'message_received', 'message_deleted', 'generation_ended', 'generation_stopped', 'variable_update_ended'].forEach(function (name) {
        var d = (name === 'chat_changed') ? 600
          : ((name === 'message_received' || name === 'message_deleted' || name.indexOf('generation_') === 0) ? 300 : 150);
        try { thOn(name, function () { schedule(d); schedulePromptRefresh(); }); } catch (e) {}
      });
      log('已挂上酒馆助手事件');
    }

    /* ③ 兜底：盯 DOM */
    attachChatObserver();
  }

  var scanTimer = null;
  function schedule(delay) {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(function () {
      try { renderAll(); } catch (e) { warn('扫描失败', e); }
    }, delay === undefined ? 120 : delay);
  }

  /* 说明里带了「这个变量现在是多少」，变量一变就得重发一次注入，
     不然 AI 拿到的是上一轮的旧值。这里做个防抖，别每来一条事件就打一次 API。 */
  var promptTimer = null;
  function schedulePromptRefresh() {
    if (promptTimer) clearTimeout(promptTimer);
    promptTimer = setTimeout(function () {
      promptTimer = null;
      if (window.VMVU && typeof window.VMVU.applyPrompt === 'function') {
        try { window.VMVU.applyPrompt(); } catch (e) {}
      }
    }, 400);
  }

  /* ---------------- 启动 ---------------- */
  async function boot() {
    /* 禁止面板脚本自己去挂载（由本扩展决定挂在哪） */
    window.__VMVU_NO_AUTOBOOT = true;

    var TH = await waitTavernHelper();
    if (!TH) {
      warn('没等到酒馆助手（JS-Slash-Runner）。本扩展依赖酒馆助手，请确认它已启用。');
      return;
    }
    log('酒馆助手已就绪，开始加载面板资源…');

    try {
      await loadStyle(ASSET_BASE + 'vmvu-style.css');
      await loadScript(ASSET_BASE + 'vmvu-panel.js');
    } catch (e) {
      warn('资源加载失败', e);
      return;
    }
    if (!window.VMVU) { warn('面板脚本加载了但没挂上 window.VMVU'); return; }

    bindEvents();
    ensureHideRegex();

    /* 初次渲染 + 轮询兜底（应对各种加载顺序） */
    var tries = 0;
    (function loop() {
      tries++;
      attachChatObserver();
      try { renderAll(); } catch (e) {}
      if (tries < 30) setTimeout(loop, tries < 6 ? 400 : 1500);
    })();
    /* 短时轮询结束后不再全量扫描（消息一有变化就会被 DOM 观察器抓到），
       只留一个很轻的定时器，保证 #chat 被换掉之后还能重新盯上 */
    setInterval(function () { attachChatObserver(); }, 3000);

    log('已启动。带触发标记 ' + TRIGGER_HINT + ' 的 AI 回复下方会出现面板。');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot(); });
  } else {
    boot();
  }
})();
