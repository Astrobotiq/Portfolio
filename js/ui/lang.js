(function() {
  let currentLang = localStorage.getItem('ek_lang') || 'en';
  const langBtn = document.getElementById('langToggle');

  function applyLang() {
    if (!window.TRANSLATIONS) return;
    const t = window.TRANSLATIONS[currentLang];
    if (!t) return;
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (t[key] !== undefined) {
        el.innerHTML = t[key];
      }
    });
    
    document.documentElement.lang = currentLang;
    if (langBtn) {
      langBtn.textContent = currentLang === 'en' ? 'TR' : 'EN';
      langBtn.classList.toggle('active', currentLang === 'tr');
    }
    localStorage.setItem('ek_lang', currentLang);

    if (typeof window.onLanguageChanged === 'function') {
      window.onLanguageChanged(currentLang);
    }
  }

  window.toggleLang = function() {
    currentLang = currentLang === 'en' ? 'tr' : 'en';
    applyLang();
  };

  applyLang();
})();
