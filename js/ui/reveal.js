(function() {
  const revealEls = document.querySelectorAll('.reveal, .tl-entry');
  if (revealEls.length === 0) return;
  
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { 
      if (e.isIntersecting) { 
        e.target.classList.add('visible'); 
        obs.unobserve(e.target); 
      } 
    });
  }, { threshold: 0.08 });
  
  revealEls.forEach(el => obs.observe(el));
})();
