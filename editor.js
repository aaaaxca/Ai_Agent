/*
 * 그린컵 수업 페이지 편집 모드
 * - 주소 끝에 ?edit 를 붙여 열면 켜집니다 (예: lesson7.html?edit)
 * - 글 클릭해서 바로 수정 / 블록 왼쪽 ⠿ 손잡이를 끌어 순서 변경
 * - Alt(맥은 Option)를 누른 채 마우스를 올리면 한 단계 큰 블록을 잡습니다
 * - Ctrl+S (맥 ⌘+S) 로 수정된 HTML 파일을 다운로드합니다
 * 학생이 보는 일반 주소에서는 아무 동작도 하지 않습니다.
 */
(function () {
  var params = new URLSearchParams(location.search);
  if (!params.has('edit') && location.hash !== '#edit') return;

  var EDIT_ROOTS = 'header.masthead, main';
  var CONTAINERS = 'main, .lesson-section, .callout, .toggle-body, ul, ol, tbody';
  var dirty = false;

  function init() {
    var roots = document.querySelectorAll(EDIT_ROOTS);
    if (!roots.length) return;

    // 처음 열려 있던 토글 상태 기억 (저장할 때 되돌림)
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
      '.__ed-dragging{opacity:.35}' +
      '.__ed-line{position:absolute;z-index:9998;height:4px;background:#2954D6;border-radius:2px;display:none;pointer-events:none}' +
      '.__ed-badge{position:fixed;right:16px;bottom:16px;z-index:9999;padding:8px 14px;border-radius:999px;' +
      'font:600 13px/1.4 "Noto Sans KR",sans-serif;background:#1B2333;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.3);pointer-events:none}' +
      '.__ed-badge.__ed-unsaved{background:#B23434}';
    document.head.appendChild(css);

    var handle = document.createElement('div');
    handle.className = '__ed __ed-handle';
    handle.textContent = '⠿';
    handle.title = '끌어서 순서 바꾸기';
    document.body.appendChild(handle);

    var line = document.createElement('div');
    line.className = '__ed __ed-line';
    document.body.appendChild(line);

    var badge = document.createElement('div');
    badge.className = '__ed __ed-badge';
    document.body.appendChild(badge);
    function updateBadge() {
      badge.textContent = dirty ? '✏️ 편집 모드 · 저장 안 됨 · Ctrl+S' : '✏️ 편집 모드 · Ctrl+S 저장';
      badge.classList.toggle('__ed-unsaved', dirty);
    }
    updateBadge();
    function markDirty() { if (!dirty) { dirty = true; updateBadge(); } }

    roots.forEach(function (r) { r.addEventListener('input', markDirty); });

    // 편집 중 링크 이동 막기
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a');
      if (a && a.closest(EDIT_ROOTS)) e.preventDefault();
    }, true);

    // 붙여넣기는 글자만 (서식 찌꺼기 방지)
    roots.forEach(function (r) {
      r.addEventListener('paste', function (e) {
        e.preventDefault();
        var text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
      });
    });

    // ---------- 블록 찾기 ----------
    function blockChain(el) {
      var chain = [];
      while (el && el !== document.body) {
        var p = el.parentElement;
        if (p && p.matches(CONTAINERS) && el.nodeType === 1 && !el.classList.contains('section-head')) chain.push(el);
        if (el.matches && el.matches('header.masthead, main')) break;
        el = p;
      }
      return chain; // 작은 블록 → 큰 블록 순서
    }

    var current = null, dragging = false, altDown = false, lastTarget = null;

    function setCurrent(el) {
      if (current === el) return;
      if (current) current.classList.remove('__ed-hover');
      current = el;
      if (!el) { handle.style.display = 'none'; return; }
      var r = el.getBoundingClientRect();
      handle.style.display = 'flex';
      handle.style.left = (window.scrollX + r.left - 30) + 'px';
      handle.style.top = (window.scrollY + r.top) + 'px';
    }

    function pick(target) {
      var chain = blockChain(target);
      if (!chain.length) return null;
      return altDown && chain.length > 1 ? chain[1] : chain[0];
    }

    document.addEventListener('mousemove', function (e) {
      if (dragging) return;
      if (e.target === handle) return;
      lastTarget = e.target;
      var b = pick(e.target);
      if (b) setCurrent(b);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Alt' && !altDown) { altDown = true; if (lastTarget && !dragging) setCurrent(pick(lastTarget)); }
    });
    document.addEventListener('keyup', function (e) {
      if (e.key === 'Alt') { altDown = false; if (lastTarget && !dragging) setCurrent(pick(lastTarget)); }
    });
    handle.addEventListener('mouseenter', function () { if (current) current.classList.add('__ed-hover'); });
    handle.addEventListener('mouseleave', function () { if (current && !dragging) current.classList.remove('__ed-hover'); });

    // ---------- 드래그 ----------
    var dropRef = undefined;
    handle.addEventListener('mousedown', function (e) {
      if (!current) return;
      e.preventDefault();
      dragging = true;
      current.classList.add('__ed-dragging', '__ed-hover');
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
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
      // 화면 끝에서 자동 스크롤
      if (e.clientY < 60) window.scrollBy(0, -20);
      else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 20);
    });

    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      line.style.display = 'none';
      document.body.style.userSelect = '';
      current.classList.remove('__ed-dragging', '__ed-hover');
      if (dropRef !== undefined) {
        var parent = current.parentElement;
        var head = parent.querySelector(':scope > .section-head');
        if (dropRef === null) parent.appendChild(current);
        else parent.insertBefore(current, dropRef);
        if (head && parent.firstElementChild !== head) parent.insertBefore(head, parent.firstElementChild);
        markDirty();
      }
      dropRef = undefined;
      var el = current; current = null; setCurrent(el);
    });

    window.addEventListener('scroll', function () { if (!dragging && current) { var c = current; current = null; setCurrent(c); } });

    // ---------- 저장 (Ctrl+S / ⌘+S) ----------
    function save() {
      var clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll('.__ed').forEach(function (n) { n.remove(); });
      clone.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); });
      clone.querySelectorAll('[spellcheck]').forEach(function (n) { n.removeAttribute('spellcheck'); });
      clone.querySelectorAll('.__ed-hover, .__ed-dragging').forEach(function (n) { n.classList.remove('__ed-hover', '__ed-dragging'); });
      clone.querySelectorAll('[class=""]').forEach(function (n) { n.removeAttribute('class'); });
      clone.querySelectorAll('body[style=""], body[style]').forEach(function (n) { n.style.userSelect = ''; if (!n.getAttribute('style')) n.removeAttribute('style'); });
      // 토글 열림 상태 원래대로
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
      dirty = false; updateBadge();
    }
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(); }
    });

    window.addEventListener('beforeunload', function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
