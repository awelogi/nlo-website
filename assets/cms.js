/*
 * Loader konten publik NLO.
 * Membaca teks, foto pengganti, dan galeri dari Supabase (hanya baca, kunci anon)
 * lalu menerapkannya ke elemen bertanda data-cms / data-cms-img / data-cms-gallery.
 * Jika Supabase belum diatur atau gagal, halaman tetap memakai konten bawaan.
 */
(function () {
  "use strict";
  var cfg = window.NLO_CONFIG || {};
  var base = (cfg.supabaseUrl || "").replace(/\/+$/, "");
  var key = cfg.supabaseAnonKey || "";
  window.NLO = window.NLO || {};
  if (!base || !key || !/^https:\/\//.test(base)) return;

  var page = document.body.getAttribute("data-page") || "";
  // Kunci lama ("anon", berbentuk JWT) juga dikirim sebagai Bearer; kunci baru ("sb_publishable_...") cukup di header apikey.
  var headers = { apikey: key };
  if (/^eyJ/.test(key)) headers.Authorization = "Bearer " + key;

  function get(path) {
    var ctrl = "AbortController" in window ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
    return fetch(base + "/rest/v1/" + path, { headers: headers, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(t); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  function isSafeUrl(u) { return typeof u === "string" && /^https:\/\//.test(u); }
  function digits(s) {
    var d = String(s || "").replace(/[^\d+]/g, "");
    if (d.charAt(0) === "+") d = d.slice(1);
    if (d.charAt(0) === "0") d = "62" + d.slice(1);
    return d.replace(/\D/g, "");
  }

  function applyText(map) {
    document.querySelectorAll("[data-cms]").forEach(function (el) {
      var k = el.getAttribute("data-cms");
      if (Object.prototype.hasOwnProperty.call(map, k) && map[k].trim() !== "") el.textContent = map[k];
    });
    // kontak: perbarui tautan dari nilai yang tersimpan
    if (map["kontak.telepon"]) {
      var num = digits(map["kontak.telepon"]);
      if (num.length >= 8) {
        window.NLO.wa = num;
        document.querySelectorAll("a[data-cms-tel]").forEach(function (a) { a.href = "tel:+" + num; });
        document.querySelectorAll("a[data-cms-wa]").forEach(function (a) {
          var q = a.href.indexOf("?") >= 0 ? a.href.slice(a.href.indexOf("?")) : "";
          a.href = "https://wa.me/" + num + q;
        });
      }
    }
    if (map["kontak.email"] && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(map["kontak.email"].trim())) {
      document.querySelectorAll("a[data-cms-mail]").forEach(function (a) { a.href = "mailto:" + map["kontak.email"].trim(); });
    }
    if (map["kontak.instagram"]) {
      var ig = map["kontak.instagram"].trim().replace(/^@/, "").replace(/[^A-Za-z0-9._]/g, "");
      if (ig) document.querySelectorAll("a[data-cms-ig]").forEach(function (a) { a.href = "https://instagram.com/" + ig; });
    }
  }

  function applyImages(map) {
    document.querySelectorAll("img[data-cms-img]").forEach(function (img) {
      var u = map[img.getAttribute("data-cms-img")];
      if (isSafeUrl(u)) { ["srcset", "sizes", "width", "height"].forEach(function (a) { img.removeAttribute(a); }); img.src = u; }
    });
  }

  function lightbox() {
    var d = document.getElementById("nlo-lightbox");
    if (d) return d;
    d = document.createElement("dialog");
    d.id = "nlo-lightbox"; d.className = "lightbox";
    d.innerHTML = '<button type="button">Tutup</button><img alt=""><p></p>';
    d.querySelector("button").addEventListener("click", function () { d.close(); });
    d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
    document.body.appendChild(d);
    return d;
  }

  function renderGallery(items) {
    var sec = document.querySelector('[data-cms-gallery="' + page + '"]');
    if (!sec) return;
    var grid = sec.querySelector(".gal-grid");
    var list = items.filter(function (it) { return isSafeUrl(it.image_url); });
    if (!list.length) return;
    grid.textContent = "";
    list.forEach(function (it) {
      var fig = document.createElement("figure"); fig.className = "gal-item"; fig.tabIndex = 0;
      var img = document.createElement("img");
      img.src = it.image_url; img.loading = "lazy"; img.decoding = "async"; img.alt = it.caption || "Foto kegiatan NLO";
      var cap = document.createElement("figcaption"); cap.textContent = it.caption || "";
      fig.appendChild(img); fig.appendChild(cap); grid.appendChild(fig);
      function open() {
        var d = lightbox();
        if (typeof d.showModal !== "function") { window.open(it.image_url, "_blank", "noopener"); return; }
        d.querySelector("img").src = it.image_url; d.querySelector("img").alt = img.alt;
        d.querySelector("p").textContent = it.caption || "";
        d.showModal();
      }
      fig.addEventListener("click", open);
      fig.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    sec.hidden = false;
    var nav = document.querySelector('.subnav a[href="#galeri"]');
    if (nav) nav.hidden = false;
  }

  get("site_content?select=key,kind,value").then(function (rows) {
    var text = {}, img = {};
    (rows || []).forEach(function (r) { if (r.kind === "image") img[r.key] = r.value; else text[r.key] = r.value; });
    applyText(text); applyImages(img);
  }).catch(function () { /* tetap pakai konten bawaan */ });

  if (document.querySelector("[data-cms-gallery]")) {
    get("gallery?select=image_url,caption,sort&page=eq." + encodeURIComponent(page) + "&order=sort.asc,created_at.asc")
      .then(renderGallery).catch(function () {});
  }
})();
