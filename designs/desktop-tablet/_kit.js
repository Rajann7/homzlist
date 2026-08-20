/* HomzList desktop/tablet design set — shared chrome.
   Injects the icon sprite and renders the shared parts, so all 20+ files show
   exactly the same header, sidebar, footer and bottom nav.

   Usage inside a frame's template:
     <div data-part="header" data-active="Buy"></div>       public header (signed in)
     <div data-part="header" data-guest="1"></div>          public header (guest)
     <div data-part="sidebar" data-active="Dashboard"></div> console sidebar
     <div data-part="footer"></div>
     <div data-part="bnav" data-active="home"></div>        mobile bottom nav (hidden ≥768)
*/
(function () {

  /* ---------------- icon sprite ---------------- */
  var SPRITE = [
    ['home','<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-6h5v6"/>'],
    ['search','<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>'],
    ['plus','<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8.5v7M8.5 12h7"/>'],
    ['plus-b','<path d="M12 5v14M5 12h14"/>'],
    ['leads','<path d="M4 6h16M7 12h10M10 18h4"/>'],
    ['user','<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'],
    ['bell','<path d="M18 15V10a6 6 0 1 0-12 0v5l-1.5 2.5h15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'],
    ['heart','<path d="M12 20s-7-4.5-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.5-7 9-7 9z"/>'],
    ['grid','<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'],
    ['pin','<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>'],
    ['file','<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/>'],
    ['send','<path d="m21 3-9 18-2.2-7.8L2 11z"/>'],
    ['card','<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/>'],
    ['receipt','<path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21z"/><path d="M9 8h6M9 12h6"/>'],
    ['rocket','<path d="M14 4c3.5 0 6 2.5 6 6 0 4.5-5 8-8 10-2-3-5.5-8-5.5-10 0-3.5 2.5-6 6-6z"/><circle cx="13" cy="10" r="2"/>'],
    ['bookmark','<path d="M6 3h12v18l-6-4-6 4z"/>'],
    ['clock','<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.2 2"/>'],
    ['help','<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4A2.5 2.5 0 0 1 14.5 10c0 1.7-2.5 2-2.5 3.6"/><path d="M12 17h.01"/>'],
    ['settings','<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>'],
    ['archive','<rect x="3" y="4" width="18" height="4" rx="1.5"/><path d="M5 8v12h14V8"/><path d="M10 12h4"/>'],
    ['chevron','<path d="m8 10 4 4 4-4"/>'],
    ['left','<path d="m14 6-6 6 6 6"/>'],
    ['right','<path d="m10 6 6 6-6 6"/>'],
    ['up','<path d="m6 14 6-6 6 6"/>'],
    ['close','<path d="m6 6 12 12M18 6 6 18"/>'],
    ['menu','<path d="M4 7h16M4 12h16M4 17h16"/>'],
    ['shield','<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="m9 12 2 2 4-4"/>'],
    ['briefcase','<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M9 7V5h6v2"/>'],
    ['building','<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/>'],
    ['filter','<path d="M4 6h16M7 12h10M10 18h4"/>'],
    ['sort','<path d="M4 7h16M7 12h10M10 17h4"/>'],
    ['share','<circle cx="18" cy="6" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="m8.4 10.8 7.2-3.6M8.4 13.2l7.2 3.6"/>'],
    ['phone','<path d="M6 3h4l2 5-2.5 1.5a12 12 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/>'],
    ['check','<path d="m5 12.5 4.5 4.5L19 7.5"/>'],
    ['eye','<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'],
    ['image','<rect x="3" y="4.5" width="18" height="15" rx="3"/><circle cx="8.5" cy="10" r="1.6"/><path d="m4 17 5-5 4.5 4.5L16.5 14l3.5 3.5"/>'],
    ['star','<path d="m12 4 2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8z"/>'],
    ['alert','<path d="M12 4 3 20h18z"/><path d="M12 10v4M12 17h.01"/>'],
    ['trash','<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>'],
    ['edit','<path d="M4 20h4L20 8l-4-4L4 16z"/>'],
    ['download','<path d="M12 4v10m0 0 4-4m-4 4-4-4"/><path d="M4 19h16"/>']
  ];

  function sprite() {
    if (document.getElementById('hz-sprite')) return;
    var svg = '<svg id="hz-sprite" style="display:none" aria-hidden="true">';
    SPRITE.forEach(function (s) {
      svg += '<symbol id="i-' + s[0] + '" viewBox="0 0 24 24">' + s[1] + '</symbol>';
    });
    document.body.insertAdjacentHTML('afterbegin', svg + '</svg>');
  }

  function ic(name, cls) { return '<svg class="i ' + (cls || '') + '"><use href="#i-' + name + '"/></svg>'; }

  /* ---------------- the public header (ported from Header.tsx) ---------------- */
  var TOP_NAV = ['Buy', 'Rent', 'Projects', 'Commercial', 'Plots', 'PG', 'Requirements'];

  function header(el) {
    var guest = el.dataset.guest === '1';
    var active = el.dataset.active || '';
    var nav = TOP_NAV.map(function (n) {
      return '<a href="#"' + (n === active ? ' aria-current="page"' : '') + '>' + n + '</a>';
    }).join('');

    var right = guest
      ? '<a class="hlogin" href="#">Log in</a>' +
        '<a class="hpost" href="#">' + ic('plus-b', 's16') + '<span class="lbl">Post Property</span><span class="free">FREE*</span></a>'
      : '<a class="hdash" href="#">' + ic('grid', 's16') + 'Dashboard</a>' +
        '<a class="hicon" href="#" aria-label="Notifications">' + ic('bell', 's24') + '<span class="badge">3</span></a>' +
        '<a class="hicon" href="#" aria-label="Saved">' + ic('heart', 's24') + '<span class="badge">7</span></a>' +
        '<button class="hprofile"><span class="avatar" style="background:var(--avatar-2)">R</span>' + ic('chevron', 's16') + '</button>' +
        '<a class="hpost" href="#">' + ic('plus-b', 's16') + '<span class="lbl">Post Property</span></a>';

    el.outerHTML =
      '<header class="phead"><div class="container">' +
        '<div class="hleft">' +
          '<a class="wordmark" href="#">Homz<i>List</i></a>' +
          '<span class="hcity">' + ic('pin', 's16') + 'Surat' + ic('chevron', 's16') + '</span>' +
        '</div>' +
        '<nav class="hnav">' + nav + '</nav>' +
        '<div class="hright">' + right + '<button class="hburger">' + ic('menu', 's24') + '</button></div>' +
      '</div></header>';
  }

  /* ---------------- console sidebar (the 9 hub items + profile-sheet rows) ---------------- */
  var SIDE = [
    { g: '', items: [['home', 'Home'], ['search', 'Search']] },
    { g: 'Inventory', items: [['grid', 'Dashboard'], ['home', 'My Listings', '12', 'soft'], ['filter', 'Leads', '3']] },
    { g: 'Requirements', items: [['search', 'Browse requirements', '24', 'soft'], ['file', 'My requirements', '2', 'soft'], ['send', 'My proposals', '5', 'soft'], ['pin', 'My visits', '1']] },
    { g: 'Billing & growth', items: [['card', 'My plan'], ['receipt', 'Payments'], ['rocket', 'Boosts', '2', 'soft']] },
    { g: 'You', items: [['bookmark', 'Saved'], ['clock', 'Your activity'], ['file', 'Drafts', '1', 'soft'], ['archive', 'Archived'], ['help', 'Help'], ['settings', 'Settings']] }
  ];

  function sidebar(el) {
    var active = el.dataset.active || 'Dashboard';
    var groups = SIDE.map(function (grp) {
      var rows = grp.items.map(function (it) {
        var cnt = it[2] ? '<span class="cnt ' + (it[3] || '') + '">' + it[2] + '</span>' : '';
        return '<a href="#"' + (it[1] === active ? ' aria-current="page"' : '') + '>' +
          '<span class="ic">' + ic(it[0]) + '</span><span class="lbl">' + it[1] + '</span>' + cnt + '</a>';
      }).join('');
      return '<div class="side-group">' + (grp.g ? '<h4>' + grp.g + '</h4>' : '') + rows + '</div>';
    }).join('');

    el.outerHTML =
      '<aside class="side">' +
        '<div class="side-top"><span class="wordmark">Homz<i>List</i></span></div>' +
        '<div class="side-nav">' + groups + '</div>' +
        '<div class="side-foot"><a class="side-user" href="#">' +
          '<span class="avatar" style="background:var(--avatar-2)">R</span>' +
          '<span style="min-width:0"><span class="nm">Rajan Patel</span><br><span class="rl">Owner · Verified</span></span>' +
        '</a></div>' +
      '</aside>';
  }

  function footer(el) {
    el.outerHTML =
      '<footer class="foot"><div class="container">' +
        '<div class="footcols">' +
          '<div><span class="wordmark">Homz<i>List</i></span>' +
          '<p class="muted" style="margin:10px 0 0;max-width:340px">Flats, plots and projects from owners, brokers and builders — photos and text only, no spam calls.</p></div>' +
          '<div><h5>Explore</h5><ul><li>Buy</li><li>Rent</li><li>Projects</li><li>Requirements</li></ul></div>' +
          '<div><h5>Sell</h5><ul><li>Post Property</li><li>Plans</li><li>Boost</li><li>Leads</li></ul></div>' +
          '<div><h5>Company</h5><ul><li>About</li><li>Blog</li><li>Help centre</li><li>Terms &amp; Privacy</li></ul></div>' +
        '</div>' +
        '<div class="base">© 2026 HomzList · India</div>' +
      '</div></footer>';
  }

  function bnav(el) {
    var a = el.dataset.active || 'home';
    var items = [['home', 'home'], ['search', 'search'], ['plus', 'create'], ['leads', 'leads'], ['user', 'profile']];
    el.outerHTML = '<div class="bnav">' + items.map(function (i) {
      return '<a' + (i[1] === a ? ' aria-current="page"' : '') + '>' + ic(i[0], 's26') +
        (i[1] === 'leads' ? '<span class="badge">3</span>' : '') + '</a>';
    }).join('') + '</div>';
  }

  /* ---------------- frame scaling + dark toggle ---------------- */
  function fit() {
    var stage = document.querySelector('.stage');
    if (!stage) return;
    var avail = stage.clientWidth - 32;
    document.querySelectorAll('.scaler').forEach(function (s) {
      var frame = s.querySelector('.frame');
      if (!frame) return;
      var w = parseInt(frame.dataset.w || frame.style.width, 10);
      var k = Math.min(1, avail / w);
      s.style.transform = 'scale(' + k + ')';
      s.style.height = s.firstElementChild.offsetHeight * k + 'px';
    });
  }

  function dark(on) {
    document.body.classList.toggle('dark', on);
    document.querySelectorAll('.frame').forEach(function (f) { f.classList.toggle('dark', on); });
    var b = document.querySelector('[data-dark]');
    if (b) b.setAttribute('aria-pressed', String(on));
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-dark]');
    if (b) dark(b.getAttribute('aria-pressed') !== 'true');
  });

  function build() {
    sprite();
    // clone every template into its frame first
    document.querySelectorAll('[data-tpl]').forEach(function (f) {
      if (f.dataset.built) return;
      var t = document.getElementById('tpl-' + f.dataset.tpl);
      if (t) { f.appendChild(t.content.cloneNode(true)); f.dataset.built = '1'; }
    });
    document.querySelectorAll('[data-part="header"]').forEach(header);
    document.querySelectorAll('[data-part="sidebar"]').forEach(sidebar);
    document.querySelectorAll('[data-part="footer"]').forEach(footer);
    document.querySelectorAll('[data-part="bnav"]').forEach(bnav);
    fit();
  }

  window.addEventListener('resize', fit);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
  setTimeout(fit, 80);
})();
