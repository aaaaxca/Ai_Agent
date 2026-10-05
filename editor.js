/*
 * 그린컵 수업 페이지 편집 모드
 * - 주소 끝에 ?edit 를 붙여 열면 켜집니다 (예: lesson7.html?edit)
 * - 글 클릭해서 바로 수정
 * - 블록 왼쪽 ⠿ 손잡이: 끌면 순서 변경, 클릭하면 블록 선택
 * - Alt(맥은 Option)를 누른 채 마우스를 올리면 한 단계 큰 블록을 잡습니다
 * - 복사·붙여넣기
 *     글자: 드래그로 선택 → Ctrl+C → 원하는 곳 클릭 → Ctrl+V (굵게·코드 등 서식 유지)
 *     블록: 손잡이 클릭(선택) → Ctrl+C / Ctrl+X → 다른 블록 선택 → Ctrl+V (그 아래에 붙음)
 *     블록 선택 후 Ctrl+D 복제, Delete 삭제, Esc 선택 해제
 *     다른 차시 탭(?edit)으로 붙여넣기도 됩니다
 * - Ctrl+Z: 블록 이동·붙여넣기·삭제도 되돌립니다
 * - Ctrl+S (맥 ⌘+S) 로 수정된 HTML 파일을 다운로드합니다
 * 학생이 보는 일반 주소에서는 아무 동작도 하지 않습니다.
 */
(function () {
  var params = new URLSearchParams(location.search);
  if (!params.has('edit') && location.hash !== '#edit') return;

  var EDIT_ROOTS = 'header.masthead, main';
  var CONTAINERS = 'main, .lesson-section, .callout, .toggle-body, ul, ol, tbody';
  var CLIP_ATTR = 'data-gc-clip';
  var dirty = false;

  function init() {
    var roots = document.querySelectorAll(EDIT_ROOTS);
    if (!roots.length) return;

    var initiallyOpen = new Set();
    document.querySelectorAll('details').forEach(function (d) { if (d.open) initiallyOpen.add(d); });

    roots.forEach(function (r) {
      r.setAttribute('contenteditable', 'true');
      r.setAttribute('spellcheck', 'false');
    });
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}

    // ---------- 스타일 ----------
    var css = document.createElement('style');
    css.className = '__ed';
    css.textContent =
      '[contenteditable]:focus{outline:none}' +
      '.__ed-handle{position:absolute;z-index:9999;width:22px;height:26px;display:none;align-items:center;justify-content:center;' +
      'font:16px/1 sans-serif;color:#fff;background:#2954D6;border-radius:6px;cursor:grab;user-select:none;box-shadow:0 2px 6px rgba(0,0,0,.25)}' +
      '.__ed-handle:active{cursor:grabbing}' +
      '.__ed-hover{outline:2px dashed #2954D6 !important;outline-offset:3px}' +
      '.__ed-selected{outline:3px solid #E08A00 !important;outline-offset:3px;background-color:rgba(224,138,0,.06)}' +
      '.__ed-dragging{opacity:.35}' +
      '.__ed-line{position:absolute;z-index:9998;height:4px;background:#2954D6;border-radius:2px;display:none;pointer-events:none}' +
      '.__ed-badge{position:fixed;right:16px;bottom:16px;z-index:9999;max-width:calc(100vw - 32px);padding:8px 14px;border-radius:14px;' +
      'font:600 13px/1.5 "Noto Sans KR",sans-serif;background:#1B2333;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.3);pointer-events:none}' +
      '.__ed-badge.__ed-unsaved{background:#B23434}' +
      '.__ed-badge.__ed-sel{background:#8A5A10}';
    document.head.appendChild(css);

    var handle = mk('__ed-handle'); handle.textContent = '⠿'; handle.title = '끌면 이동 · 클릭하면 선택';
    var line = mk('__ed-line');
    var badge = mk('__ed-badge');
    function mk(cls) { var d = document.createElement('div'); d.className = '__ed ' + cls; document.body.appendChild(d); return d; }

    var flash = null, flashTimer = null;
    function updateBadge() {
      var t, cls = '';
      if (flash) t = flash;
      else if (selected) { t = '블록 선택됨 · Ctrl+C 복사 · Ctrl+X 잘라내기 · Ctrl+V 아래에 붙여넣기 · Ctrl+D 복제 · Delete 삭제 · Esc 해제'; cls = '__ed-sel'; }
      else if (dirty) { t = '✏️ 편집 모드 · 저장 안 됨 · Ctrl+S'; cls = '__ed-unsaved'; }
      else t = '✏️ 편집 모드 · Ctrl+S 저장';
      badge.textContent = t;
      badge.classList.remove('__ed-unsaved', '__ed-sel');
      if (cls) badge.classList.add(cls);
    }
    function notify(msg) {
      flash = msg; updateBadge();
      clearTimeout(flashTimer);
      flashTimer = setTimeout(function () { flash = null; updateBadge(); }, 2200);
    }
    function markDirty() { if (!dirty) { dirty = true; updateBadge(); } }

    // ---------- 되돌리기 (블록 작업) ----------
    var undoStack = [], textSinceBlockOp = true;
    function pushUndo(op) { undoStack.push(op); if (undoStack.length > 100) undoStack.shift(); textSinceBlockOp = false; markDirty(); }
    function undoBlock() {
      var op = undoStack.pop(); if (!op) return false;
      if (op.type === 'insert') op.el.remove();
      else op.parent.insertBefore(op.el, op.next && op.next.parentNode === op.parent ? op.next : null);
      fixHead(op.parent || null);
      select(null);
      notify('↩ 되돌렸습니다');
      return true;
    }
    // 브라우저가 글 합칠 때 몰래 넣는 style·span 정리
    function tidy() {
      var s = window.getSelection();
      if (!s || !s.rangeCount) return;
      var chain = blockChain(s.anchorNode);
      var box = chain.length ? chain[chain.length > 1 ? 1 : 0] : null;
      if (!box) return;
      var junk = /rgba?\(|font-size|font-family|background|line-height|letter-spacing/i;
      box.querySelectorAll('span[style], font, strong[style], b[style], em[style], i[style], code[style], u[style]').forEach(function (n) {
        if (n.tagName !== 'FONT' && !junk.test(n.getAttribute('style') || '')) return;   // 원래 있던 스타일은 건드리지 않음
        if (n.tagName === 'FONT' || (n.tagName === 'SPAN' && !n.className)) {
          while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n);
          n.remove();
        } else n.removeAttribute('style');
      });
    }
    roots.forEach(function (r) { r.addEventListener('input', function () { tidy(); textSinceBlockOp = true; markDirty(); }); });

    // ---------- 편집 중 링크 이동 막기 ----------
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a');
      if (a && a.closest(EDIT_ROOTS)) e.preventDefault();
    }, true);

    // ---------- 블록 찾기 ----------
    function blockChain(el) {
      var chain = [];
      if (el && el.nodeType !== 1) el = el.parentElement;
      while (el && el !== document.body) {
        var p = el.parentElement;
        if (p && p.matches(CONTAINERS) && !el.classList.contains('section-head') && !el.classList.contains('__ed')) chain.push(el);
        if (el.matches('header.masthead, main')) break;
        el = p;
      }
      return chain;
    }
    function inRoots(node) {
      var el = node && (node.nodeType === 1 ? node : node.parentElement);
      return !!(el && el.closest(EDIT_ROOTS));
    }
    function fixHead(parent) {
      if (!parent) return;
      var head = parent.querySelector(':scope > .section-head');
      if (head && parent.firstElementChild !== head) parent.insertBefore(head, parent.firstElementChild);
    }

    var current = null, selected = null, altDown = false, lastTarget = null;

    function placeHandle(el) {
      var r = el.getBoundingClientRect();
      handle.style.display = 'flex';
      handle.style.left = (window.scrollX + r.left - 30) + 'px';
      handle.style.top = (window.scrollY + r.top) + 'px';
    }
    function setCurrent(el) {
      if (current === el) return;
      if (current) current.classList.remove('__ed-hover');
      current = el;
      if (!el) { handle.style.display = 'none'; return; }
      placeHandle(el);
    }
    function pick(target) {
      var chain = blockChain(target);
      if (!chain.length) return null;
      return altDown && chain.length > 1 ? chain[1] : chain[0];
    }
    function select(el) {
      if (selected) selected.classList.remove('__ed-selected');
      selected = el;
      if (el) {
        el.classList.add('__ed-selected');
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        var s = window.getSelection(); if (s) s.removeAllRanges();
      }
      updateBadge();
    }

    // ---------- 마우스: 호버 / 드래그 / 클릭 선택 ----------
    var pending = false, dragging = false, startX = 0, startY = 0, dropRef;

    document.addEventListener('mousemove', function (e) {
      if (pending && !dragging && (Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4)) {
        dragging = true;
        current.classList.add('__ed-dragging', '__ed-hover');
      }
      if (dragging) { onDrag(e); return; }
      if (pending) return;
      if (e.target === handle) return;
      lastTarget = e.target;
      var b = pick(e.target);
      if (b) setCurrent(b);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Alt' && !altDown) { altDown = true; if (lastTarget && !pending) setCurrent(pick(lastTarget)); }
    });
    document.addEventListener('keyup', function (e) {
      if (e.key === 'Alt') { altDown = false; if (lastTarget && !pending) setCurrent(pick(lastTarget)); }
    });
    handle.addEventListener('mouseenter', function () { if (current) current.classList.add('__ed-hover'); });
    handle.addEventListener('mouseleave', function () { if (current && !dragging) current.classList.remove('__ed-hover'); });

    handle.addEventListener('mousedown', function (e) {
      if (!current) return;
      e.preventDefault();
      pending = true; dragging = false; dropRef = undefined;
      startX = e.clientX; startY = e.clientY;
      document.body.style.userSelect = 'none';
    });

    // 본문을 클릭하면 블록 선택 해제
    document.addEventListener('mousedown', function (e) {
      if (e.target === handle) return;
      if (selected) select(null);
    }, true);

    function onDrag(e) {
      var parent = current.parentElement;
      var sibs = Array.prototype.filter.call(parent.children, function (c) {
        return c !== current && !c.classList.contains('section-head');
      });
      var ref = null, y = e.clientY;
      for (var i = 0; i < sibs.length; i++) {
        var r = sibs[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) { ref = sibs[i]; break; }
      }
      dropRef = ref;
      var pr = parent.getBoundingClientRect(), ly;
      if (ref) ly = ref.getBoundingClientRect().top - 6;
      else if (sibs.length) ly = sibs[sibs.length - 1].getBoundingClientRect().bottom + 2;
      else ly = pr.top;
      line.style.display = 'block';
      line.style.left = (window.scrollX + pr.left) + 'px';
      line.style.width = pr.width + 'px';
      line.style.top = (window.scrollY + ly) + 'px';
      if (e.clientY < 60) window.scrollBy(0, -20);
      else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 20);
    }

    document.addEventListener('mouseup', function () {
      if (!pending) return;
      pending = false;
      document.body.style.userSelect = '';
      if (!dragging) { select(current); return; }       // 클릭 = 선택
      dragging = false;
      line.style.display = 'none';
      current.classList.remove('__ed-dragging', '__ed-hover');
      if (dropRef !== undefined && dropRef !== current.nextElementSibling) {
        var parent = current.parentElement;
        pushUndo({ type: 'move', el: current, parent: parent, next: current.nextSibling });
        if (dropRef === null) parent.appendChild(current); else parent.insertBefore(current, dropRef);
        fixHead(parent);
      }
      dropRef = undefined;
      var el = current; current = null; setCurrent(el);
    });

    window.addEventListener('scroll', function () { if (!pending && current) placeHandle(current); });

    // ---------- 복사 · 잘라내기 · 붙여넣기 ----------
    function cleanEl(root) {
      root.querySelectorAll('.__ed').forEach(function (n) { n.remove(); });
      var all = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
      all.forEach(function (n) {
        if (n.classList) {
          n.classList.remove('__ed-hover', '__ed-selected', '__ed-dragging');
          if (n.getAttribute('class') === '') n.removeAttribute('class');
        }
        if (n.removeAttribute) { n.removeAttribute('contenteditable'); n.removeAttribute('spellcheck'); n.removeAttribute(CLIP_ATTR); }
      });
      return root;
    }
    function wrapClip(kind, html) { return '<div ' + CLIP_ATTR + '="' + kind + '">' + html + '</div>'; }
    function readClip(html) {
      if (!html || html.indexOf(CLIP_ATTR) < 0) return null;
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var w = doc.querySelector('[' + CLIP_ATTR + ']');
      if (!w) return null;
      return { kind: w.getAttribute(CLIP_ATTR), node: w };
    }

    function onCopy(e, isCut) {
      if (selected) {
        e.preventDefault();
        var c = cleanEl(selected.cloneNode(true));
        e.clipboardData.setData('text/html', wrapClip('block', c.outerHTML));
        e.clipboardData.setData('text/plain', selected.innerText);
        if (isCut) {
          var el = selected;
          pushUndo({ type: 'remove', el: el, parent: el.parentElement, next: el.nextSibling });
          select(null); setCurrent(null); el.remove();
          notify('✂ 블록을 잘라냈습니다 · 붙일 곳의 블록을 선택하고 Ctrl+V');
        } else notify('📋 블록을 복사했습니다 · 붙일 곳의 블록을 선택하고 Ctrl+V');
        return;
      }
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !inRoots(sel.anchorNode)) return;
      var div = document.createElement('div');
      for (var i = 0; i < sel.rangeCount; i++) div.appendChild(sel.getRangeAt(i).cloneContents());
      cleanEl(div);
      e.preventDefault();
      e.clipboardData.setData('text/html', wrapClip('inline', div.innerHTML));
      e.clipboardData.setData('text/plain', sel.toString());
      if (isCut) { document.execCommand('delete'); }
    }
    document.addEventListener('copy', function (e) { onCopy(e, false); });
    document.addEventListener('cut', function (e) { onCopy(e, true); });

    function accepts(parent, el) {
      var tag = el.tagName;
      if (tag === 'LI') return parent.matches('ul, ol');
      if (tag === 'TR') return parent.matches('tbody');
      return parent.matches(CONTAINERS) && !parent.matches('ul, ol, tbody');
    }
    function insertBlocks(nodes, anchor) {
      // anchor 블록부터 위로 올라가며 받아줄 수 있는 자리를 찾아 그 아래에 붙임
      var chain = blockChain(anchor);
      var spot = null;
      for (var i = 0; i < chain.length && !spot; i++) {
        if (nodes.every(function (n) { return accepts(chain[i].parentElement, n); })) spot = chain[i];
      }
      if (!spot) { notify('⚠ 이 블록은 여기에 붙일 수 없습니다 (목록 항목은 목록 안, 표 행은 표 안에만)'); return; }
      var ref = spot.nextSibling, parent = spot.parentElement, last = null;
      nodes.forEach(function (n) {
        parent.insertBefore(n, ref);
        pushUndo({ type: 'insert', el: n });
        last = n;
      });
      fixHead(parent);
      select(last);
      notify('📌 붙여넣었습니다 · 잘못 붙었으면 Ctrl+Z');
    }

    document.addEventListener('paste', function (e) {
      var cd = e.clipboardData || window.clipboardData;
      var html = cd.getData('text/html'), text = cd.getData('text/plain');
      var clip = readClip(html);
      var sel = window.getSelection();
      var caretIn = sel && sel.rangeCount && inRoots(sel.anchorNode);
      if (!selected && !caretIn) return;
      e.preventDefault();

      if (clip && clip.kind === 'block') {
        var nodes = Array.prototype.map.call(clip.node.children, function (n) { return cleanEl(document.importNode(n, true)); });
        insertBlocks(nodes, selected || sel.anchorNode);
        return;
      }
      if (selected) { notify('⚠ 글자는 블록이 아니라 글 속 원하는 위치를 클릭한 뒤 붙여넣으세요'); return; }
      if (clip && clip.kind === 'inline') {
        document.execCommand('insertHTML', false, cleanEl(clip.node).innerHTML);
        tidy();
      } else {
        document.execCommand('insertText', false, text);   // 다른 곳에서 가져온 글은 서식 없이
      }
    }, true);

    // ---------- 단축키 ----------
    document.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey, k = (e.key || '').toLowerCase();
      if (mod && k === 's') { e.preventDefault(); save(); return; }
      if (mod && k === 'z' && !e.shiftKey && undoStack.length && (selected || !textSinceBlockOp)) {
        e.preventDefault(); undoBlock(); return;
      }
      if (!selected) return;
      if (e.key === 'Escape') { select(null); return; }
      if (mod && k === 'd') {
        e.preventDefault();
        var c = cleanEl(selected.cloneNode(true));
        var src = selected, ref = src.nextSibling;
        src.parentElement.insertBefore(c, ref);
        pushUndo({ type: 'insert', el: c });
        select(c); notify('⧉ 복제했습니다');
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        var el = selected;
        pushUndo({ type: 'remove', el: el, parent: el.parentElement, next: el.nextSibling });
        select(null); setCurrent(null); el.remove();
        notify('🗑 블록을 삭제했습니다 · 되돌리려면 Ctrl+Z');
      }
    });

    // ---------- 저장 (Ctrl+S / ⌘+S) ----------
    function save() {
      var clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll('.__ed').forEach(function (n) { n.remove(); });
      cleanEl(clone.querySelector('body'));
      var body = clone.querySelector('body');
      body.style.userSelect = '';
      if (!body.getAttribute('style')) body.removeAttribute('style');
      var orig = document.querySelectorAll('details'), cl = clone.querySelectorAll('details');
      for (var i = 0; i < orig.length && i < cl.length; i++) {
        if (initiallyOpen.has(orig[i])) cl[i].setAttribute('open', ''); else cl[i].removeAttribute('open');
      }
      var html = '<!DOCTYPE html>\n' + clone.outerHTML + '\n';
      var name = decodeURIComponent(location.pathname.split('/').pop() || 'index.html');
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      dirty = false; notify('💾 저장했습니다 · 다운로드된 파일을 GitHub에 올리세요');
    }

    window.addEventListener('beforeunload', function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    updateBadge();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
