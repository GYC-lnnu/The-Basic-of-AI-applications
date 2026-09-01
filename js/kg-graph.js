/* 课程知识图谱 · SVG 版引擎（参考量子力学讲义知识图谱方案）
   数据：kg-data.js → KG_DATA {nodes, edges}
   设计要点：加载时同步完成 160 轮力松弛预计算（无动画循环），SVG 分层渲染，
   悬停预览 / 点击固定 / 搜索 / 类别过滤 / 滚轮缩放 / ?focus= 定位 */
(function () {
  'use strict';

  var DATA = window.KG_DATA;
  var svg = document.getElementById('kg-canvas');
  var detail = document.getElementById('kg-detail');
  var search = document.getElementById('kg-search');
  var filtersBox = document.getElementById('kg-filters');
  var statusEl = document.getElementById('kg-status');
  if (!DATA || !svg) return;

  /* ---------- 类别 ---------- */
  var CATS = {
    term:    { label: '术语',          color: '#2f6fed' },
    lecture: { label: '讲次',          color: '#2e9e5b' },
    module:  { label: '模块',          color: '#e6852a' },
    stage:   { label: '能力主线',      color: '#8e44d3' },
    case:    { label: '物理案例/任务', color: '#d9435f' },
    quiz:    { label: '核心考点',      color: '#0f9ba8' }
  };
  var CAT_ORDER = ['term', 'lecture', 'case', 'quiz', 'module', 'stage'];

  /* ---------- 度数与邻接 ---------- */
  var byId = {};
  DATA.nodes.forEach(function (n) { byId[n.id] = n; n.degree = 0; n.on = true; });
  DATA.edges.forEach(function (e) { byId[e.s].degree++; byId[e.t].degree++; });
  var adjacency = {};
  DATA.edges.forEach(function (e) {
    (adjacency[e.s] = adjacency[e.s] || []).push(e.t);
    (adjacency[e.t] = adjacency[e.t] || []).push(e.s);
  });

  /* ---------- 初始布局：按类别扇区 + 度数分层圆环 ---------- */
  var width = 2000, height = 1400;
  var centerX = width / 2, centerY = height / 2;
  var rings = [430, 620, 810];
  var catIdx = {}; CAT_ORDER.forEach(function (c, i) { catIdx[c] = i; });
  var counters = {};
  DATA.nodes.forEach(function (n) {
    var ci = catIdx[n.cat];
    var sector = (ci / CAT_ORDER.length) * Math.PI * 2;
    var within = (counters[n.cat] = (counters[n.cat] || 0) + 1);
    var inSector = (within % 7) / 7 + (0.5 / 7);
    var angle = sector + inSector * (Math.PI * 2 / CAT_ORDER.length);
    var ring = n.degree >= 12 ? rings[0] : n.degree >= 6 ? rings[1] : rings[2];
    n.x = centerX + Math.cos(angle) * ring;
    n.y = centerY + Math.sin(angle) * ring * 0.72;
    n.r = Math.max(7, Math.min(19, 6 + Math.sqrt(n.degree) * 2.3));
    n.color = CATS[n.cat].color;
  });

  /* ---------- 160 轮同步力松弛（参考方案） ---------- */
  var step, i, j;
  for (step = 0; step < 160; step++) {
    DATA.edges.forEach(function (e) {
      var a = byId[e.s], b = byId[e.t];
      var dx = b.x - a.x, dy = b.y - a.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var desired = 165 + Math.min(130, (a.degree + b.degree) * 4);
      var force = (dist - desired) * 0.006;
      var fx = dx / dist * force, fy = dy / dist * force;
      a.x += fx; a.y += fy; b.x -= fx; b.y -= fy;
    });
    for (i = 0; i < DATA.nodes.length; i++) {
      var a = DATA.nodes[i];
      for (j = i + 1; j < DATA.nodes.length; j++) {
        var b = DATA.nodes[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        var d2 = dx * dx + dy * dy || 1;
        if (d2 > 44000) continue;
        var dist = Math.sqrt(d2);
        var push = (116 - Math.min(116, dist)) * 0.018;
        var fx2 = dx / dist * push, fy2 = dy / dist * push;
        a.x -= fx2; a.y -= fy2; b.x += fx2; b.y += fy2;
      }
      a.x += (centerX - a.x) * 0.006;
      a.y += (centerY - a.y) * 0.006;
      a.x = Math.max(60, Math.min(width - 60, a.x));
      a.y = Math.max(40, Math.min(height - 40, a.y));
    }
  }

  /* ---------- SVG 分层 ---------- */
  var NS = 'http://www.w3.org/2000/svg';
  var viewport = document.createElementNS(NS, 'g');
  var lineLayer = document.createElementNS(NS, 'g');
  var nodeLayer = document.createElementNS(NS, 'g');
  viewport.setAttribute('class', 'kg-viewport');
  lineLayer.setAttribute('class', 'kg-lines');
  nodeLayer.setAttribute('class', 'kg-nodes');
  viewport.appendChild(lineLayer); viewport.appendChild(nodeLayer);
  svg.appendChild(viewport);

  var zoom = 1.5, minZoom = 0.55, maxZoom = 4.2;
  function applyZoom() {
    viewport.setAttribute('transform',
      'translate(' + centerX + ' ' + centerY + ') scale(' + zoom + ') translate(' + (-centerX) + ' ' + (-centerY) + ')');
  }
  applyZoom();
  svg.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    zoom = Math.max(minZoom, Math.min(maxZoom, zoom * (ev.deltaY < 0 ? 1.12 : 0.88)));
    applyZoom();
  }, { passive: false });

  /* ---------- 边与节点元素 ---------- */
  var lineEls = DATA.edges.map(function (e) {
    var a = byId[e.s], b = byId[e.t];
    var line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
    line.dataset.source = e.s; line.dataset.target = e.t;
    lineLayer.appendChild(line);
    return line;
  });

  function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  var nodeEls = DATA.nodes.map(function (node) {
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'kg-node');
    g.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
    g.dataset.id = node.id;
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', node.label);
    var circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('r', node.r);
    circle.setAttribute('fill', node.color);
    g.appendChild(circle);
    var text = document.createElementNS(NS, 'text');
    text.textContent = trunc(node.label, 11);
    text.setAttribute('x', node.r + 5);
    text.setAttribute('y', 4);
    g.appendChild(text);
    nodeLayer.appendChild(g);
    return g;
  });

  /* ---------- 聚焦逻辑 ---------- */
  var selectedId = null;
  function focusNode(id) {
    var node = byId[id];
    var neigh = adjacency[id] || [];
    var neighSet = {};
    neigh.forEach(function (x) { neighSet[x] = true; });
    svg.classList.add('has-focus');
    nodeEls.forEach(function (el) {
      var on = (el.dataset.id === id) || (neighSet[el.dataset.id] === true);
      el.classList.toggle('is-related', on);
      el.classList.toggle('is-source', el.dataset.id === id);
      el.style.display = byId[el.dataset.id].on ? '' : 'none';
    });
    lineEls.forEach(function (el) {
      var active = el.dataset.source === id || el.dataset.target === id;
      var visible = byId[el.dataset.source].on && byId[el.dataset.target].on;
      el.classList.toggle('is-related', active);
      el.style.display = visible ? '' : 'none';
    });
    var defHtml = '';
    if (node.cat === 'term') {
      defHtml += '<span class="kg-en">' + esc(node.en || '') + '</span><p>' + esc(node.def || '') + '</p>';
      defHtml += '<p><a class="term" href="#' + node.id + '">查看详解表词条 ↓</a></p>';
    }
    if (node.cat === 'lecture') {
      defHtml += '<p><a class="term" href="' + node.id + '/index.html">进入该讲页面 →</a></p>';
    }
    if (node.cat === 'quiz') {
      var lecId = 'ch' + node.id.slice(1);
      defHtml += '<p>对应讲次：<a class="term" href="' + lecId + '/index.html">第 ' + parseInt(node.id.slice(1), 10) + ' 讲</a>（回到本讲自测题动手验证）</p>';
    }
    if (node.cat === 'case') {
      var lecs = (adjacency[node.id] || []).filter(function (x) { return byId[x] && byId[x].cat === 'lecture'; }).sort();
      if (lecs.length) {
        defHtml += '<p>应用于：' + lecs.map(function (lid) {
          return '<a class="term" href="' + lid + '/index.html">' + esc(byId[lid].label) + '</a>';
        }).join('、') + '</p>';
      }
    }
    var neighSorted = neigh.slice().sort(function (a, b) { return byId[b].degree - byId[a].degree; }).slice(0, 12);
    var chips = neighSorted.map(function (nid) {
      return '<button class="kg-chip" data-id="' + nid + '" style="border-color:' + byId[nid].color + '">' + esc(byId[nid].label) + '</button>';
    }).join('');
    detail.innerHTML = '<div class="kg-badge" style="background:' + node.color + '">' + CATS[node.cat].label + '</div>' +
      '<h3>' + esc(node.label) + '</h3>' + defHtml +
      '<p class="kg-rel-title">相连节点（' + neigh.length + '）：</p><div class="kg-rel">' + (chips || '<em>暂无关联</em>') + '</div>';
    detail.querySelectorAll('.kg-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var nid = btn.getAttribute('data-id');
        selectedId = nid; focusNode(nid);
      });
    });
    statusEl.textContent = '已选中：' + node.label;
  }
  function clearFocus() {
    if (search && search.value.trim()) return;
    if (selectedId) { focusNode(selectedId); return; }
    svg.classList.remove('has-focus');
    nodeEls.forEach(function (el) { el.classList.remove('is-related', 'is-source', 'is-search'); el.style.display = byId[el.dataset.id].on ? '' : 'none'; });
    lineEls.forEach(function (el) { el.classList.remove('is-related'); el.style.display = ''; });
    statusEl.textContent = '';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  nodeEls.forEach(function (el) {
    el.addEventListener('mouseenter', function () { focusNode(el.dataset.id); });
    el.addEventListener('mouseleave', clearFocus);
    el.addEventListener('click', function () { selectedId = el.dataset.id; focusNode(el.dataset.id); });
  });
  svg.addEventListener('click', function (ev) {
    if (!(ev.target.closest && ev.target.closest('.kg-node'))) {
      selectedId = null; clearFocus();
    }
  });

  /* ---------- 类别过滤 ---------- */
  Object.keys(CATS).forEach(function (cat) {
    var lab = document.createElement('label');
    lab.className = 'kg-filter';
    lab.innerHTML = '<input type="checkbox" checked data-cat="' + cat + '">' +
      '<span style="color:' + CATS[cat].color + '">●</span> ' + CATS[cat].label;
    filtersBox.appendChild(lab);
  });
  filtersBox.addEventListener('change', function (ev) {
    var cat = ev.target.getAttribute && ev.target.getAttribute('data-cat');
    if (!cat) return;
    var on = ev.target.checked;
    DATA.nodes.forEach(function (n) { if (n.cat === cat) n.on = on; });
    if (selectedId && !byId[selectedId].on) { selectedId = null; clearFocus(); return; }
    if (selectedId) focusNode(selectedId); else clearFocus();
  });

  /* ---------- 搜索 ---------- */
  search.addEventListener('input', function () {
    var q = search.value.trim().toLowerCase();
    if (!q) { clearFocus(); return; }
    svg.classList.add('has-focus');
    var first = null;
    nodeEls.forEach(function (el) {
      var n = byId[el.dataset.id];
      var hit = n.on && (n.label.toLowerCase().indexOf(q) >= 0 || (n.en || '').toLowerCase().indexOf(q) >= 0);
      el.classList.toggle('is-related', hit);
      el.classList.toggle('is-search', hit);
      el.style.display = n.on ? '' : 'none';
      if (hit && !first) first = n;
    });
    lineEls.forEach(function (el) { el.classList.remove('is-related'); });
    if (first) { selectedId = first.id; focusNode(first.id); }
  });
  search.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') search.dispatchEvent(new Event('input')); });

  /* ---------- 重置 ---------- */
  document.getElementById('kg-reset').addEventListener('click', function () {
    search.value = ''; selectedId = null;
    svg.classList.remove('has-focus');
    nodeEls.forEach(function (el) { el.classList.remove('is-related', 'is-source', 'is-search'); });
    lineEls.forEach(function (el) { el.classList.remove('is-related'); });
    zoom = 1.5; applyZoom();
    detail.innerHTML = '<p class="kg-empty">点击节点查看详情；滚轮缩放；悬停预览关联。</p>';
    statusEl.textContent = '';
  });

  /* ---------- 术语表行“🔍 定位”按钮 ---------- */
  document.querySelectorAll('tr[id^="term-"]').forEach(function (tr) {
    var id = tr.id;
    if (!byId[id]) return;
    var td = tr.querySelector('td');
    if (!td) return;
    var btn = document.createElement('button');
    btn.className = 'kg-locate'; btn.textContent = '🔍 定位';
    btn.title = '在知识图谱中定位该术语';
    btn.addEventListener('click', function () {
      selectedId = id; focusNode(id);
      document.getElementById('kg-canvas').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    td.appendChild(document.createTextNode(' '));
    td.appendChild(btn);
  });

  /* ---------- ?focus= 定位 ---------- */
  var mq = new RegExp('[?&]focus=([a-zA-Z0-9-]+)').exec(location.search);
  if (mq && byId[mq[1]]) {
    selectedId = mq[1];
    setTimeout(function () { focusNode(mq[1]); }, 200);
  } else {
    detail.innerHTML = '<p class="kg-empty">点击节点查看详情；滚轮缩放；悬停预览关联。</p>';
  }
})();
