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
     这里由扩展自己兜底隐藏（不动正文数据，只是不显示）。 */
  var CODE_PATTERNS = [
    /<UpdateVariable[\s\S]*?<\/UpdateVariable>/i,
    /<JSONPatch[\s\S]*?<\/JSONPatch>/i,
    /<StatusPlaceHolderImpl\s*\/?>/i
  ];

  function maskCodeBlocksIn(text) {
    var nodes = [];
    var walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      var p = n.parentNode;
      if (!p) continue;
      if (p.closest && (p.closest('.vmvu-code') || p.closest('#' + ROOT_ID))) continue;
      var v = n.nodeValue || '';
      for (var i = 0; i < CODE_PATTERNS.length; i++) {
        if (CODE_PATTERNS[i].test(v)) { nodes.push(n); break; }
      }
    }
    nodes.forEach(function (node) {
      var rest = node.nodeValue;
      var frag = document.createDocumentFragment();
      var hit = false;
      while (rest) {
        var best = null;
        CODE_PATTERNS.forEach(function (re) {
          var m = re.exec(rest);
          if (m && m[0] && (!best || m.index < best.index)) best = m;
        });
        if (!best) break;
        hit = true;
        if (best.index > 0) frag.appendChild(document.createTextNode(rest.slice(0, best.index)));
        var span = document.createElement('span');
        span.className = 'vmvu-code';
        span.style.display = 'none';
        span.textContent = best[0];
        frag.appendChild(span);
        rest = rest.slice(best.index + best[0].length);
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
        if (x.parentNode && x.parentNode.closest && x.parentNode.closest('.vmvu-code')) continue;
        vis += x.nodeValue || '';
      }
      if (!vis.replace(/\s/g, '')) pre.style.display = 'none';
    }
  }

  function maskTriggerIn(text) {
    if (!HIDE_TRIGGER || !TRIGGER_PATTERNS.length) return;
    var nodes = [];
    var walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      var p = n.parentNode;
      if (!p) continue;
      /* 跳过已经藏起来的标记，以及面板自己生成的 DOM */
      if (p.closest && (p.closest('.' + TRIGGER_CLASS) || p.closest('#' + ROOT_ID))) continue;
      if (n.nodeValue && findTrigger(n.nodeValue)) nodes.push(n);
    }
    nodes.forEach(function (node) {
      var rest = node.nodeValue;
      var frag = document.createDocumentFragment();
      var hit = false;
      while (true) {
        var m = findTrigger(rest);
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
    /* 先挑出「有触发标记的 AI 楼层」，只保留最后 MAX_PANEL_FLOORS 层 */
    var candidates = [];
    list.forEach(function (mes) {
      var mid = Number(mes.getAttribute('mesid'));
      if (!isFinite(mid)) return;
      if (mes.getAttribute('is_user') === 'true') return;
      if (mes.getAttribute('is_system') === 'true') return;
      /* 隐藏 MVU 指令块：每层都要做，跟挂不挂面板无关 */
      var txAll = mes.querySelector('.mes_text');
      if (txAll) maskCodeBlocksIn(txAll);
      candidates.push({ mes: mes, mid: mid });
    });
    var keep = {};
    candidates.slice(-MAX_PANEL_FLOORS).forEach(function (c) { keep[c.mid] = 1; });

    list.forEach(function (mes) {
      var mid = Number(mes.getAttribute('mesid'));
      if (!isFinite(mid)) return;
      if (mes.getAttribute('is_user') === 'true') return;
      if (mes.getAttribute('is_system') === 'true') return;
      /* 隐藏 MVU 指令块：每层都要做，跟挂不挂面板无关 */
      var txAll = mes.querySelector('.mes_text');
      if (txAll) maskCodeBlocksIn(txAll);
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
