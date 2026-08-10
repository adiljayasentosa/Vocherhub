// VoucherHub — Landing page interactions (mobile nav + FAQ accordion)

function setupMobileMenu() {
  const btn = document.getElementById('mobileMenuBtn');
  const panel = document.getElementById('mobileMenuPanel');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => panel.classList.toggle('hidden'));
  panel.querySelectorAll('a').forEach(a => a.addEventListener('click', () => panel.classList.add('hidden')));
}

function setupFaqAccordion() {
  const items = document.querySelectorAll('.vh-faq-item');
  items.forEach(item => {
    const question = item.querySelector('.vh-faq-q');
    const answer = item.querySelector('.vh-faq-a');
    question.addEventListener('click', () => {
      const isOpen = item.getAttribute('data-open') === 'true';

      items.forEach(other => {
        other.setAttribute('data-open', 'false');
        other.querySelector('.vh-faq-a').style.maxHeight = null;
        other.querySelector('.vh-faq-q').setAttribute('aria-expanded', 'false');
      });

      if (!isOpen) {
        item.setAttribute('data-open', 'true');
        question.setAttribute('aria-expanded', 'true');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });
}

lucide.createIcons();
setupMobileMenu();
setupFaqAccordion();
