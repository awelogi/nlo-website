/* Admin NLO: login, edit teks, ganti foto, kelola galeri, ganti kata sandi. */
(function () {
  "use strict";
  var cfg = window.NLO_CONFIG || {};
  var BUCKET = "site-media";
  var $ = function (id) { return document.getElementById(id); };
  var views = ["v-setup", "v-login", "v-recover", "v-denied", "v-app"];
  function show(id) { views.forEach(function (v) { $(v).hidden = v !== id; }); }

  function toast(text, bad) {
    var t = $("toast");
    t.textContent = text; t.classList.toggle("bad", !!bad); t.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("on"); }, 3200);
  }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function errText(e) {
    var m = (e && (e.message || e.error_description)) || String(e);
    if (/Invalid login credentials/i.test(m)) return "Email atau kata sandi salah.";
    if (/Email not confirmed/i.test(m)) return "Email ini belum dikonfirmasi.";
    if (/row-level security|permission denied|Unauthorized|not authorized/i.test(m)) return "Akun ini tidak punya izin admin.";
    if (/Failed to fetch|NetworkError|network/i.test(m)) return "Tidak bisa terhubung ke server. Periksa koneksi internet.";
    if (/Password should be/i.test(m)) return "Kata sandi terlalu lemah. Gunakan minimal 8 karakter.";
    return m;
  }

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) { show("v-setup"); return; }
  var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  // ----------------------------------------------------------------- state
  var manifest = { text: [], images: [] };
  var content = {};          // key -> {kind, value}
  var edits = {};            // key -> new text value (belum disimpan)
  var textFilter = "home", galPage = "gathering";
  var recovering = false;

  // ----------------------------------------------------------------- auth
  $("f-login").addEventListener("submit", function (e) {
    e.preventDefault();
    var m = $("login-msg"); m.hidden = true;
    var email = $("l-email").value.trim(), pass = $("l-pass").value;
    if (!email || !pass) { m.textContent = "Isi email dan kata sandi."; m.hidden = false; return; }
    var btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
    sb.auth.signInWithPassword({ email: email, password: pass }).then(function (r) {
      btn.disabled = false;
      if (r.error) { m.textContent = errText(r.error); m.hidden = false; return; }
      enter(r.data.session);
    });
  });
  $("forgot").addEventListener("click", function () {
    var m = $("login-msg"), email = $("l-email").value.trim();
    if (!email) { m.className = "msg err"; m.textContent = "Isi email Anda dulu, lalu tekan Lupa kata sandi lagi."; m.hidden = false; return; }
    sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] }).then(function (r) {
      m.className = r.error ? "msg err" : "msg ok";
      m.textContent = r.error ? errText(r.error) : "Tautan untuk membuat kata sandi baru sudah dikirim ke email tersebut.";
      m.hidden = false;
    });
  });
  $("f-recover").addEventListener("submit", function (e) {
    e.preventDefault();
    var p = $("r-pass").value, m = $("recover-msg"); m.hidden = true;
    if (p.length < 8) { m.textContent = "Kata sandi minimal 8 karakter."; m.hidden = false; return; }
    sb.auth.updateUser({ password: p }).then(function (r) {
      if (r.error) { m.textContent = errText(r.error); m.hidden = false; return; }
      recovering = false; toast("Kata sandi baru tersimpan.");
      sb.auth.getSession().then(function (s) { enter(s.data.session); });
    });
  });
  $("logout").addEventListener("click", function () {
    if (Object.keys(edits).length && !confirm("Ada perubahan teks yang belum disimpan. Tetap keluar?")) return;
    sb.auth.signOut().then(function () { location.reload(); });
  });

  sb.auth.onAuthStateChange(function (event) {
    if (event === "PASSWORD_RECOVERY") { recovering = true; show("v-recover"); }
  });

  function enter(session) {
    if (recovering) return;
    if (!session) { $("logout").hidden = true; $("who").textContent = ""; show("v-login"); return; }
    $("logout").hidden = false; $("who").textContent = session.user.email || "";
    sb.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle().then(function (r) {
      if (r.error || !r.data) { show("v-denied"); return; }
      show("v-app"); loadAll();
    });
  }

  // ----------------------------------------------------------------- data
  function loadAll() {
    Promise.all([
      fetch("slots.json", { cache: "no-cache" }).then(function (r) { return r.json(); }),
      sb.from("site_content").select("key,kind,value")
    ]).then(function (res) {
      manifest = res[0];
      content = {};
      if (res[1].error) throw res[1].error;
      (res[1].data || []).forEach(function (row) { content[row.key] = row; });
      renderText(); renderImages(); loadGallery();
    }).catch(function (e) { toast("Gagal memuat data: " + errText(e), true); });
  }

  // ----------------------------------------------------------------- tabs
  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.setAttribute("aria-selected", x === t ? "true" : "false"); });
      ["teks", "foto", "galeri", "akun"].forEach(function (n) { $("p-" + n).hidden = n !== t.dataset.tab; });
      $("savebar").hidden = t.dataset.tab !== "teks" || !Object.keys(edits).length;
    });
  });
  function segment(id, cb) {
    var box = $(id);
    box.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        box.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        cb(b.dataset.f);
      });
    });
  }
  segment("text-filter", function (f) { textFilter = f; renderText(); });
  segment("gal-filter", function (f) { galPage = f; loadGallery(); });

  // ----------------------------------------------------------------- teks
  function currentText(slot) {
    if (Object.prototype.hasOwnProperty.call(edits, slot.key)) return edits[slot.key];
    var row = content[slot.key];
    return row && row.kind === "text" ? row.value : slot.default;
  }
  function renderText() {
    var list = $("text-list"); list.textContent = "";
    var groups = {};
    manifest.text.filter(function (s) { return s.page === textFilter; }).forEach(function (s) {
      (groups[s.group] = groups[s.group] || []).push(s);
    });
    Object.keys(groups).forEach(function (g) {
      var box = el("div", { class: "group" }, [el("h3", { text: g })]);
      groups[g].forEach(function (s) {
        var id = "t-" + s.key.replace(/[^a-z0-9]/gi, "-");
        var custom = content[s.key] && content[s.key].kind === "text";
        var dirty = Object.prototype.hasOwnProperty.call(edits, s.key);
        var input = el(s.multiline ? "textarea" : "input", { id: id, class: "input", rows: s.multiline ? 3 : false });
        input.value = currentText(s);
        input.addEventListener("input", function () {
          var stored = content[s.key] && content[s.key].kind === "text" ? content[s.key].value : s.default;
          if (input.value === stored) delete edits[s.key]; else edits[s.key] = input.value;
          badge.className = edits.hasOwnProperty(s.key) ? "badge dirty" : "badge";
          badge.textContent = edits.hasOwnProperty(s.key) ? "Belum disimpan" : "Diubah";
          badge.hidden = !(edits.hasOwnProperty(s.key) || custom);
          updateSavebar();
        });
        var badge = el("span", { class: dirty ? "badge dirty" : "badge", text: dirty ? "Belum disimpan" : "Diubah", hidden: !(dirty || custom) });
        var reset = el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Kembalikan", onclick: function () {
          input.value = s.default; input.dispatchEvent(new Event("input"));
        } });
        var card = el("div", { class: "card slot" }, [
          el("div", { class: "slot-head" }, [el("label", { for: id, text: s.label }), badge]),
          input,
          el("div", { class: "slot-head", style: "margin:10px 0 0;" }, [el("p", { class: "def", text: "Bawaan: " + s.default }), reset])
        ]);
        box.appendChild(card);
      });
      list.appendChild(box);
    });
    updateSavebar();
  }
  function updateSavebar() {
    var n = Object.keys(edits).length;
    $("dirty-count").textContent = n + " perubahan belum disimpan";
    $("savebar").hidden = !n || $("p-teks").hidden;
  }
  $("discard").addEventListener("click", function () { edits = {}; renderText(); });
  $("save").addEventListener("click", function () {
    var btn = $("save"); btn.disabled = true;
    var keys = Object.keys(edits);
    var upserts = [], deletes = [];
    keys.forEach(function (k) {
      var slot = manifest.text.filter(function (s) { return s.key === k; })[0];
      var v = edits[k].trim();
      if (!v || (slot && v === slot.default)) deletes.push(k);
      else upserts.push({ key: k, kind: "text", value: v });
    });
    var jobs = [];
    if (upserts.length) jobs.push(sb.from("site_content").upsert(upserts));
    if (deletes.length) jobs.push(sb.from("site_content").delete().in("key", deletes));
    Promise.all(jobs).then(function (res) {
      btn.disabled = false;
      var bad = res.filter(function (r) { return r.error; })[0];
      if (bad) { toast("Gagal menyimpan: " + errText(bad.error), true); return; }
      upserts.forEach(function (r) { content[r.key] = r; });
      deletes.forEach(function (k) { delete content[k]; });
      edits = {}; renderText();
      toast(keys.length + " perubahan tersimpan. Situs memakai teks baru saat dimuat ulang.");
    });
  });
  window.addEventListener("beforeunload", function (e) { if (Object.keys(edits).length) { e.preventDefault(); e.returnValue = ""; } });

  // ----------------------------------------------------------------- foto
  function publicUrl(path) { return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl; }
  function pathFromUrl(url) {
    var marker = "/storage/v1/object/public/" + BUCKET + "/";
    var i = (url || "").indexOf(marker);
    return i >= 0 ? decodeURIComponent(url.slice(i + marker.length).split("?")[0]) : null;
  }
  function compress(file, maxSide) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { reject(new Error("Format harus JPG, PNG, atau WebP.")); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          if (b && b.type === "image/webp") resolve({ blob: b, ext: "webp", type: "image/webp" });
          else c.toBlob(function (j) { j ? resolve({ blob: j, ext: "jpg", type: "image/jpeg" }) : reject(new Error("Gagal memproses foto.")); }, "image/jpeg", 0.85);
        }, "image/webp", 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("File bukan foto yang valid.")); };
      img.src = url;
    });
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60); }
  function upload(file, folder, name) {
    return compress(file, 1800).then(function (c) {
      var path = folder + "/" + slug(name) + "-" + Date.now() + "." + c.ext;
      return sb.storage.from(BUCKET).upload(path, c.blob, { contentType: c.type, cacheControl: "31536000", upsert: false })
        .then(function (r) { if (r.error) throw r.error; return { path: path, url: publicUrl(path) }; });
    });
  }

  function renderImages() {
    var list = $("img-list"); list.textContent = "";
    manifest.images.forEach(function (s) {
      var row = content[s.key];
      var custom = row && row.kind === "image";
      var src = custom ? row.value : "../" + s.default;
      var input = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", "aria-label": "Pilih foto pengganti" });
      var pick = el("label", { class: "btn btn-solid btn-sm file-btn" }, [document.createTextNode("Ganti foto"), input]);
      var reset = el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Kembalikan bawaan", disabled: !custom });
      input.addEventListener("change", function () {
        var f = input.files[0]; if (!f) return;
        pick.classList.add("busy"); input.disabled = true; toast("Mengunggah foto...");
        var old = custom ? pathFromUrl(row.value) : null;
        upload(f, "slots", s.key).then(function (u) {
          return sb.from("site_content").upsert({ key: s.key, kind: "image", value: u.url }).then(function (r) {
            if (r.error) throw r.error;
            content[s.key] = { key: s.key, kind: "image", value: u.url };
            if (old) sb.storage.from(BUCKET).remove([old]);
            toast("Foto diganti."); renderImages();
          });
        }).catch(function (e) { input.disabled = false; toast("Gagal: " + errText(e), true); });
      });
      reset.addEventListener("click", function () {
        if (!confirm("Kembalikan foto bawaan untuk bagian ini?")) return;
        var old = pathFromUrl(row.value);
        sb.from("site_content").delete().eq("key", s.key).then(function (r) {
          if (r.error) { toast("Gagal: " + errText(r.error), true); return; }
          delete content[s.key]; if (old) sb.storage.from(BUCKET).remove([old]);
          toast("Foto bawaan dipakai lagi."); renderImages();
        });
      });
      var img = el("img", { src: src, alt: s.alt, loading: "lazy" });
      var badge = el("span", { class: "badge", text: "Diganti", hidden: !custom });
      list.appendChild(el("div", { class: "card img-card" }, [
        el("div", { class: "thumb" }, [img, badge]),
        el("div", { class: "body" }, [el("p", { text: s.alt }), el("div", { class: "row" }, [pick, reset])])
      ]));
    });
  }

  // ----------------------------------------------------------------- galeri
  var gallery = [];
  function loadGallery() {
    $("gal-list").textContent = "";
    sb.from("gallery").select("id,page,image_url,storage_path,caption,sort").eq("page", galPage).order("sort").order("created_at")
      .then(function (r) {
        if (r.error) { toast("Gagal memuat galeri: " + errText(r.error), true); return; }
        gallery = r.data || []; renderGallery();
      });
  }
  function renderGallery() {
    var list = $("gal-list"); list.textContent = "";
    if (!gallery.length) { list.appendChild(el("div", { class: "card empty", text: "Belum ada foto. Bagian Galeri di halaman ini tetap tersembunyi sampai Anda menambahkan foto." })); return; }
    gallery.forEach(function (it, i) {
      var cap = el("input", { class: "input", placeholder: "Keterangan foto (opsional)", "aria-label": "Keterangan foto", maxlength: "140" });
      cap.value = it.caption || "";
      cap.addEventListener("change", function () {
        sb.from("gallery").update({ caption: cap.value.trim() }).eq("id", it.id).then(function (r) {
          if (r.error) toast("Gagal: " + errText(r.error), true); else { it.caption = cap.value.trim(); toast("Keterangan tersimpan."); }
        });
      });
      var up = el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Naik", disabled: i === 0, "aria-label": "Pindahkan ke atas", onclick: function () { move(i, -1); } });
      var down = el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Turun", disabled: i === gallery.length - 1, "aria-label": "Pindahkan ke bawah", onclick: function () { move(i, 1); } });
      var del = el("button", { class: "btn btn-danger btn-sm", type: "button", text: "Hapus", onclick: function () {
        if (!confirm("Hapus foto ini dari galeri?")) return;
        sb.from("gallery").delete().eq("id", it.id).then(function (r) {
          if (r.error) { toast("Gagal: " + errText(r.error), true); return; }
          sb.storage.from(BUCKET).remove([it.storage_path]);
          gallery.splice(i, 1); renderGallery(); toast("Foto dihapus.");
        });
      } });
      list.appendChild(el("div", { class: "card gal-row" }, [
        el("img", { src: it.image_url, alt: it.caption || "Foto galeri", loading: "lazy" }),
        cap,
        el("div", { class: "ctrl" }, [up, down, del])
      ]));
    });
  }
  function move(i, dir) {
    var j = i + dir; if (j < 0 || j >= gallery.length) return;
    var a = gallery[i], b = gallery[j];
    gallery[i] = b; gallery[j] = a;
    var rows = gallery.map(function (it, idx) { return { id: it.id, sort: idx }; });
    Promise.all(rows.map(function (r) { return sb.from("gallery").update({ sort: r.sort }).eq("id", r.id); })).then(function (res) {
      var bad = res.filter(function (r) { return r.error; })[0];
      if (bad) { toast("Gagal mengurutkan: " + errText(bad.error), true); loadGallery(); return; }
      gallery.forEach(function (it, idx) { it.sort = idx; }); renderGallery();
    });
  }
  function addFiles(files) {
    files = [].slice.call(files || []).filter(function (f) { return /^image\//.test(f.type); });
    if (!files.length) return;
    var bar = $("gal-progress"), fill = bar.firstElementChild, done = 0, start = gallery.length;
    bar.hidden = false; fill.style.width = "0%";
    var chain = Promise.resolve(), failed = 0;
    files.forEach(function (f, k) {
      chain = chain.then(function () {
        return upload(f, "gallery/" + galPage, f.name.replace(/\.[^.]+$/, "")).then(function (u) {
          return sb.from("gallery").insert({ page: galPage, image_url: u.url, storage_path: u.path, caption: "", sort: start + k })
            .then(function (r) { if (r.error) { sb.storage.from(BUCKET).remove([u.path]); throw r.error; } });
        }).catch(function (e) { failed++; toast("Gagal mengunggah " + f.name + ": " + errText(e), true); })
          .then(function () { done++; fill.style.width = Math.round(done / files.length * 100) + "%"; });
      });
    });
    chain.then(function () {
      setTimeout(function () { bar.hidden = true; }, 600);
      if (files.length - failed) toast((files.length - failed) + " foto ditambahkan ke galeri.");
      $("gal-input").value = ""; loadGallery();
    });
  }
  $("gal-input").addEventListener("change", function (e) { addFiles(e.target.files); });
  var drop = $("drop");
  ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
  drop.addEventListener("drop", function (e) { addFiles(e.dataTransfer.files); });

  // ----------------------------------------------------------------- akun
  $("f-pass").addEventListener("submit", function (e) {
    e.preventDefault();
    var a = $("n-pass").value, b = $("n-pass2").value, m = $("pass-msg");
    m.hidden = false; m.className = "msg err";
    if (a.length < 8) { m.textContent = "Kata sandi minimal 8 karakter."; return; }
    if (a !== b) { m.textContent = "Kedua kata sandi tidak sama."; return; }
    sb.auth.updateUser({ password: a }).then(function (r) {
      if (r.error) { m.textContent = errText(r.error); return; }
      m.className = "msg ok"; m.textContent = "Kata sandi berhasil diganti."; e.target.reset();
    });
  });

  // ----------------------------------------------------------------- start
  sb.auth.getSession().then(function (r) {
    if (/type=recovery/.test(location.hash)) { recovering = true; show("v-recover"); return; }
    enter(r.data.session);
  });
})();
