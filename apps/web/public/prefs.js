// Runs before first paint: apply saved appearance preferences without a flash.
(function () {
  try {
    var p = JSON.parse(localStorage.getItem('fray:prefs') || '{}');
    var d = document.documentElement;
    var t = p.theme === 'light' || p.theme === 'dark' ? p.theme : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    d.dataset.theme = t;
    if (p.reduceTransparency) d.dataset.transparency = 'reduce';
    if (p.reduceMotion) d.dataset.motion = 'reduce';
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
