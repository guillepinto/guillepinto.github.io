const comparison = document.querySelector('[data-comparison]');
const comparisonSlider = document.querySelector('[data-comparison-slider]');

if (comparison && comparisonSlider) {
  comparisonSlider.addEventListener('input', (event) => {
    comparison.style.setProperty('--position', `${event.target.value}%`);
  });
}

const header = document.querySelector('[data-header]');
const setHeaderState = () => header?.classList.toggle('is-scrolled', window.scrollY > 20);
setHeaderState();
window.addEventListener('scroll', setHeaderState, { passive: true });

const navToggle = document.querySelector('[data-nav-toggle]');
const nav = document.querySelector('[data-nav]');

navToggle?.addEventListener('click', () => {
  const isOpen = document.body.classList.toggle('nav-open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
  navToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
});

nav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    document.body.classList.remove('nav-open');
    navToggle?.setAttribute('aria-expanded', 'false');
    navToggle?.setAttribute('aria-label', 'Open navigation');
  });
});

document.documentElement.classList.add('animations');

const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -30px' });

document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const target = document.getElementById(button.dataset.copyTarget);
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.innerText);
      const originalLabel = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = originalLabel; }, 1500);
    } catch {
      button.textContent = 'Select text';
    }
  });
});
