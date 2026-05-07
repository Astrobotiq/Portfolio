(function() {
  const root = document.documentElement;
  const btn  = document.getElementById('themeToggle');
  let isDark = localStorage.getItem('ek_theme') !== 'light';

  function applyTheme() {
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    if (btn) {
      btn.textContent = isDark ? '☀ / ☾' : '☾ / ☀';
      btn.classList.toggle('active', !isDark);
    }
    localStorage.setItem('ek_theme', isDark ? 'dark' : 'light');
  }

  window.toggleTheme = function() {
    isDark = !isDark;
    applyTheme();
  };

  applyTheme();
})();
