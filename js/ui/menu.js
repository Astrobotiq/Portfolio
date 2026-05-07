(function() {
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  
  if (!hamburger || !mobileMenu) return;

  window.closeMobileMenu = function() {
    hamburger.classList.remove('open'); 
    mobileMenu.classList.remove('open');
    hamburger.setAttribute('aria-expanded','false'); 
    document.body.style.overflow = '';
  };

  hamburger.addEventListener('click', () => {
    const open = mobileMenu.classList.toggle('open');
    hamburger.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  });
})();
