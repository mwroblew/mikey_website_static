document.documentElement.classList.add('js');
const toggle = document.querySelector('.menu-toggle');
const nav = document.getElementById('site-navigation');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Close' : 'Menu';
    nav.classList.toggle('is-open', expanded);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      toggle.click(); toggle.focus();
    }
  });
}
document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
