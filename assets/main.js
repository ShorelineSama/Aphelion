/* ==========================================================
   OPEN APHELION · main.js
   1) 双语切换（data-zh / data-en / data-zh-html / data-en-html）
   2) 导航下拉菜单（hover + click，aria齐全）
   3) 滚动进入 rise（≤300ms）
   4) 开普勒轨道演示系统：
      · 开场编排：星空浮现 → 太阳点火（双涟漪）→ 三轨道圆规描线
        （橙色笔尖沿椭圆奔跑，实时读取 dashoffset 同步）→ 天体入轨
        → 远日点标记 → 图注与控件浮现（约 3.8s，可重播）
      · 常态：开普勒方程数值解（M = E − e·sinE，牛顿迭代），
        近日点真实加速；仿真时间引擎支持 1× / 8× / 32× 流速；
        每颗天体带 36 点渐隐彗尾；太阳光晕呼吸；星空错相闪烁
   5) prefers-reduced-motion：静态星空、无编排、无彗尾，天体停泊远日点
   ========================================================== */
(function () {
  "use strict";

  /* ============ 1. 双语 ============ */
  var LANG_KEY = "oa-lang";
  var lang = "zh";
  try { lang = localStorage.getItem(LANG_KEY) || "zh"; } catch (e) {}

  function applyLang(l) {
    lang = l;
    try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
    document.documentElement.lang = l === "en" ? "en" : "zh-CN";
    var nodes = document.querySelectorAll("[data-zh],[data-zh-html]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var html = l === "en" ? el.getAttribute("data-en-html") : el.getAttribute("data-zh-html");
      if (html !== null) { el.innerHTML = html; continue; }
      var txt = l === "en" ? el.getAttribute("data-en") : el.getAttribute("data-zh");
      if (txt !== null) el.textContent = txt;
    }
    var btn = document.getElementById("langBtn");
    if (btn) {
      btn.textContent = l === "en" ? "中" : "EN";
      btn.setAttribute("aria-label", l === "en" ? "切换到中文" : "Switch to English");
    }
  }

  function bindLang() {
    var btn = document.getElementById("langBtn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      applyLang(lang === "en" ? "zh" : "en");
    });
  }

  /* ============ 1b. 导航下拉 ============ */
  function bindDropdowns() {
    var items = document.querySelectorAll(".nav-item.has-menu");
    function closeAll(except) {
      items.forEach(function (it) {
        if (it !== except) {
          it.classList.remove("open");
          var b = it.querySelector(".nav-btn");
          if (b) b.setAttribute("aria-expanded", "false");
        }
      });
    }
    items.forEach(function (item) {
      var btn = item.querySelector(".nav-btn");
      if (!btn) return;
      var timer = null;
      function open() {
        clearTimeout(timer);
        closeAll(item);
        item.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }
      function close() {
        item.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      }
      item.addEventListener("mouseenter", open);
      item.addEventListener("mouseleave", function () {
        timer = setTimeout(close, 160);
      });
      btn.addEventListener("click", function () {
        var isOpen = item.classList.contains("open");
        closeAll();
        if (!isOpen) open();
      });
      item.addEventListener("focusout", function (e) {
        if (!item.contains(e.relatedTarget)) close();
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAll();
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".nav-item.has-menu")) closeAll();
    });
  }

  /* ============ 2. reveal ============ */
  function bindReveal() {
    var els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ============ 3. 轨道演示系统 ============ */
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var NS = "http://www.w3.org/2000/svg";

  function initOrbit() {
    var svg = document.getElementById("orbitSvg");
    if (!svg) return;

    var SUN = { x: 150, y: 330 };
    var ORBITS = [
      { a: 105, e: 0.45, w: -10 * Math.PI / 180, T: 36,  phase: 0.10, body: "body1", orbitCls: "o1", target: "distortion.html" },
      { a: 165, e: 0.50, w: -30 * Math.PI / 180, T: 60,  phase: 0.55, body: "body2", orbitCls: "o2", target: "idp.html" },
      { a: 228, e: 0.55, w: -38 * Math.PI / 180, T: 86,  phase: 0.80, body: "body3", orbitCls: "o3", target: "yoursgit.html" }
    ];
    var TRAIL_N = 36;
    var INTRO_CLASSES = ["s-stars", "s-sun", "s-o1", "s-o2", "s-o3", "s-b1", "s-b2", "s-b3", "s-ap", "s-fig"];

    /* ---- 几何准备 ---- */
    ORBITS.forEach(function (o) {
      var c = o.a * o.e;
      o.b = o.a * Math.sqrt(1 - o.e * o.e);
      o.cx = SUN.x + c * Math.cos(o.w);
      o.cy = SUN.y + c * Math.sin(o.w);
      o.ux = Math.cos(o.w); o.uy = Math.sin(o.w);
      o.vx = -o.uy;         o.vy = o.ux;
      o.el = document.getElementById(o.body);
      o.dot = o.el ? o.el.querySelector(".body-dot") : null;
      o.orbitEl = svg.querySelector("." + o.orbitCls);
      o.trail = [];
      o.visible = false;
    });

    /* ---- 星空层（最底层） ---- */
    var starLayer = document.createElementNS(NS, "g");
    starLayer.setAttribute("class", "stars");
    svg.insertBefore(starLayer, svg.firstChild);
    if (!REDUCED) {
      for (var si = 0; si < 70; si++) {
        var st = document.createElementNS(NS, "circle");
        var r = Math.random();
        st.setAttribute("class", "star");
        st.setAttribute("cx", (Math.random() * 640).toFixed(1));
        st.setAttribute("cy", (Math.random() * 480).toFixed(1));
        st.setAttribute("r", (0.5 + r * 0.9).toFixed(2));
        st.style.animationDuration = (2.2 + r * 3.2).toFixed(2) + "s";
        st.style.animationDelay = (-r * 4).toFixed(2) + "s";
        starLayer.appendChild(st);
      }
    } else {
      for (var sj = 0; sj < 40; sj++) {
        var st2 = document.createElementNS(NS, "circle");
        st2.setAttribute("class", "star");
        st2.setAttribute("cx", (Math.random() * 640).toFixed(1));
        st2.setAttribute("cy", (Math.random() * 480).toFixed(1));
        st2.setAttribute("r", (0.4 + Math.random() * 0.7).toFixed(2));
        st2.setAttribute("opacity", "0.25");
        starLayer.appendChild(st2);
      }
    }

    /* ---- 彗尾层 ---- */
    var trailLayer = document.createElementNS(NS, "g");
    var sunGroup = svg.querySelector(".sun");
    svg.insertBefore(trailLayer, sunGroup.nextSibling);
    if (!REDUCED) {
      ORBITS.forEach(function (o, oi) {
        o.trailDots = [];
        for (var k = 0; k < TRAIL_N; k++) {
          var f = 1 - k / TRAIL_N;
          var c = document.createElementNS(NS, "circle");
          c.setAttribute("class", "trail-dot t" + oi);
          c.setAttribute("r", (6 * Math.pow(f, 1.5) + 0.4).toFixed(2));
          c.setAttribute("opacity", (0.45 * Math.pow(f, 1.5) + 0.02).toFixed(3));
          trailLayer.appendChild(c);
          o.trailDots.push(c);
          o.trail.push({ x: SUN.x, y: SUN.y });
        }
      });
    }

    /* ---- 开普勒方程 ---- */
    function solveE(M, e) {
      var E = M, i, f, fp;
      for (i = 0; i < 6; i++) {
        f = E - e * Math.sin(E) - M;
        fp = 1 - e * Math.cos(E);
        E -= f / fp;
        if (Math.abs(f) < 1e-6) break;
      }
      return E;
    }

    function position(o, E) {
      var xo = o.a * (o.e - Math.cos(E));
      var yo = o.b * Math.sin(E);
      return { x: o.cx + xo * o.ux + yo * o.vx, y: o.cy + xo * o.uy + yo * o.vy };
    }

    function place(o, p) {
      if (!o.el) return;
      o.el.setAttribute("transform", "translate(" + p.x.toFixed(2) + " " + p.y.toFixed(2) + ")");
    }

    function updateTrail(o, p) {
      if (!o.trailDots || !o.visible) return;
      o.trail.unshift({ x: p.x, y: p.y });
      if (o.trail.length > TRAIL_N) o.trail.pop();
      for (var k = 0; k < o.trailDots.length; k++) {
        var q = o.trail[Math.min(k, o.trail.length - 1)];
        o.trailDots[k].setAttribute("cx", q.x.toFixed(2));
        o.trailDots[k].setAttribute("cy", q.y.toFixed(2));
      }
    }

    /* ---- 太阳点火涟漪 ---- */
    function fireRipples() {
      if (REDUCED) return;
      [0, 180].forEach(function (delay, idx) {
        setTimeout(function () {
          var rp = document.createElementNS(NS, "circle");
          rp.setAttribute("class", "sun-ripple");
          rp.setAttribute("cx", SUN.x);
          rp.setAttribute("cy", SUN.y);
          rp.setAttribute("r", "12");
          sunGroup.appendChild(rp);
          setTimeout(function () { rp.remove(); }, 1300);
        }, delay);
      });
    }

    /* ---- 圆规描线 + 笔尖亮点 ---- */
    function armOrbitStroke(i) {
      var el = ORBITS[i].orbitEl;
      if (!el) return;
      var len = el.getTotalLength();
      el.style.strokeDasharray = len;
      el.style.strokeDashoffset = len;
    }

    function drawTip(el, len) {
      if (REDUCED) return;
      var tip = document.createElementNS(NS, "circle");
      tip.setAttribute("class", "draw-tip");
      tip.setAttribute("r", "3");
      trailLayer.appendChild(tip);
      var start = performance.now();
      (function tick(now) {
        var pr = Math.min((now - start) / 1000, 1);
        var off = parseFloat(getComputedStyle(el).strokeDashoffset);
        if (!isNaN(off)) {
          var pt = el.getPointAtLength(len - off);
          tip.setAttribute("cx", pt.x.toFixed(2));
          tip.setAttribute("cy", pt.y.toFixed(2));
        }
        if (pr < 1 && off > 0.5) requestAnimationFrame(tick);
        else tip.remove();
      })(start);
    }

    function drawOrbit(i) {
      var el = ORBITS[i].orbitEl;
      if (!el) return;
      svg.classList.add("s-o" + (i + 1));
      var len = el.getTotalLength();
      el.style.transition = "stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)";
      el.style.strokeDashoffset = "0";
      drawTip(el, len);
    }

    /* ---- 编排时间轴 ---- */
    var timers = [];
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }

    function finishIntro() {
      INTRO_CLASSES.forEach(function (c) { svg.classList.remove(c); });
      svg.classList.remove("intro");
      ORBITS.forEach(function (o) {
        if (o.orbitEl) {
          o.orbitEl.style.transition = "";
          o.orbitEl.style.strokeDasharray = "";
          o.orbitEl.style.strokeDashoffset = "";
        }
      });
    }

    function playIntro() {
      if (REDUCED) return;
      clearTimers();
      INTRO_CLASSES.forEach(function (c) { svg.classList.remove(c); });
      svg.classList.add("intro");
      ORBITS.forEach(function (o, i) {
        if (o.orbitEl) { o.orbitEl.style.transition = "none"; armOrbitStroke(i); }
      });
      void svg.getBoundingClientRect();
      var tl = [
        [0,    function () { svg.classList.add("s-stars"); }],
        [250,  function () { svg.classList.add("s-sun"); fireRipples(); }],
        [700,  function () { drawOrbit(0); }],
        [1100, function () { drawOrbit(1); }],
        [1500, function () { drawOrbit(2); }],
        [2000, function () { svg.classList.add("s-b1"); ORBITS[0].visible = true; }],
        [2350, function () { svg.classList.add("s-b2"); ORBITS[1].visible = true; }],
        [2700, function () { svg.classList.add("s-b3"); ORBITS[2].visible = true; }],
        [3200, function () { svg.classList.add("s-ap"); }],
        [3550, function () { svg.classList.add("s-fig"); }],
        [3950, function () { finishIntro(); }]
      ];
      tl.forEach(function (step) { timers.push(setTimeout(step[1], step[0])); });
    }

    var replayBtn = document.getElementById("replayBtn");
    if (replayBtn) replayBtn.addEventListener("click", playIntro);

    /* ---- 时间流速 ---- */
    var SPEED = 1;
    function bindSpeed() {
      var btns = document.querySelectorAll(".speed-btn");
      btns.forEach(function (b) {
        b.addEventListener("click", function () {
          SPEED = parseFloat(b.getAttribute("data-speed")) || 1;
          btns.forEach(function (x) {
            x.setAttribute("aria-pressed", x === b ? "true" : "false");
          });
        });
      });
    }

    /* ---- 交互 ---- */
    function bindInteractions() {
      ORBITS.forEach(function (o) {
        if (!o.el) return;
        var enter = function () { if (o.orbitEl) o.orbitEl.classList.add("hover"); };
        var leave = function () { if (o.orbitEl) o.orbitEl.classList.remove("hover"); };
        o.el.addEventListener("mouseenter", enter);
        o.el.addEventListener("mouseleave", leave);
        o.el.addEventListener("focus", enter);
        o.el.addEventListener("blur", leave);
        var go = function () {
          if (o.target) window.location.href = o.target;
        };
        o.el.addEventListener("click", go);
        o.el.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); }
        });
      });
    }

    /* ---- 主循环（仿真时间引擎） ---- */
    var running = true;
    var simTime = 0, lastNow = null;

    function frame(now) {
      if (!running) return;
      if (lastNow === null) lastNow = now;
      simTime += (now - lastNow) / 1000 * SPEED;
      lastNow = now;
      ORBITS.forEach(function (o) {
        var M = 2 * Math.PI * ((simTime / o.T + o.phase) % 1);
        var E = solveE(M, o.e);
        var p = position(o, E);
        place(o, p);
        updateTrail(o, p);
      });
      requestAnimationFrame(frame);
    }

    if (REDUCED) {
      ORBITS.forEach(function (o) { place(o, position(o, Math.PI)); });
    } else {
      if ("IntersectionObserver" in window) {
        var vis = new IntersectionObserver(function (entries) {
          var on = entries[0].isIntersecting;
          if (on && !running) { running = true; lastNow = null; requestAnimationFrame(frame); }
          else if (!on) { running = false; }
        }, { threshold: 0.05 });
        vis.observe(svg);
      }
      requestAnimationFrame(frame);
      playIntro();
    }

    bindInteractions();
    bindSpeed();
  }

  /* ============ boot ============ */
  applyLang(lang);
  bindLang();
  bindDropdowns();
  bindReveal();
  initOrbit();
})();
