/* ─────────────────────────────────────────────────────────────────────────────
   THE ONE — Interactive Website Logic
   ───────────────────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {

  // 1. Navigation Header Scroll Effect
  const header = document.getElementById('header');
  if (header) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        // Only remove if it's not a subpage layout where header is scrolled by default
        const isSubpage = document.querySelector('.compliance-layout, .support-layout');
        if (!isSubpage) {
          header.classList.remove('scrolled');
        }
      }
    });
  }

  // 2. Mobile Menu Toggle
  const menuToggle = document.getElementById('menu-toggle');
  const navLinks = document.getElementById('nav-links');
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
    });

    // Close mobile menu when clicking a link
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
      });
    });
  }

  // 3. Interactive Floor Sanctuary Switcher (Landing Page)
  const tabButtons = document.querySelectorAll('.tab-btn');
  const floorContents = document.querySelectorAll('.floor-content');

  if (tabButtons.length > 0 && floorContents.length > 0) {
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const floorId = btn.getAttribute('data-floor');
        
        // Remove active class from all buttons and sections
        tabButtons.forEach(b => b.classList.remove('active'));
        floorContents.forEach(content => {
          content.classList.remove('active');
        });

        // Activate selected elements
        btn.classList.add('active');
        const selectedFloor = document.getElementById(floorId);
        if (selectedFloor) {
          selectedFloor.classList.add('active');
        }
      });
    });
  }

  // 4. FAQ Accordion Collapse (Support Page)
  const faqButtons = document.querySelectorAll('.faq-question-btn');
  if (faqButtons.length > 0) {
    faqButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const faqItem = btn.closest('.faq-item');
        const faqAnswer = faqItem.querySelector('.faq-answer');
        
        const isActive = faqItem.classList.contains('active');

        // Close other accordions
        document.querySelectorAll('.faq-item').forEach(item => {
          item.classList.remove('active');
          const answer = item.querySelector('.faq-answer');
          if (answer) answer.style.maxHeight = null;
        });

        // If it wasn't active, open it
        if (!isActive) {
          faqItem.classList.add('active');
          faqAnswer.style.maxHeight = faqAnswer.scrollHeight + 'px';
        }
      });
    });
  }

  // 5. Contact Form Simulation (Support Page)
  const supportForm = document.getElementById('support-contact-form');
  const contactFormWrapper = document.getElementById('contact-form-wrapper');
  const contactSuccess = document.getElementById('contact-success-message');

  if (supportForm && contactFormWrapper && contactSuccess) {
    supportForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      // Simulate API submit latency
      const btn = supportForm.querySelector('button');
      btn.innerText = 'Sending Message...';
      btn.disabled = true;

      setTimeout(() => {
        contactFormWrapper.style.display = 'none';
        contactSuccess.classList.add('visible');
      }, 1000);
    });
  }

  // 6. Account Deletion Request Simulation (Support Page)
  const deletionForm = document.getElementById('account-deletion-form');
  const deletionFormWrapper = document.getElementById('deletion-form-wrapper');
  const deletionSuccess = document.getElementById('deletion-success-message');

  if (deletionForm && deletionFormWrapper && deletionSuccess) {
    deletionForm.addEventListener('submit', (e) => {
      e.preventDefault();

      // Confirm user input safety
      const confirmationCheckbox = document.getElementById('delete-confirm');
      if (confirmationCheckbox && !confirmationCheckbox.checked) {
        alert('Please review and check the confirmation box.');
        return;
      }

      // Simulate deletion schedule submission latency
      const btn = deletionForm.querySelector('button');
      btn.innerText = 'Scheduling Deletion...';
      btn.disabled = true;

      setTimeout(() => {
        deletionFormWrapper.style.display = 'none';
        deletionSuccess.classList.add('visible');
      }, 1200);
    });
  }

  // 7. Scroll Reveal Animation using Intersection Observer
  const revealElements = document.querySelectorAll('.reveal');
  if (revealElements.length > 0) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animated');
          observer.unobserve(entry.target); // Reveal once
        }
      });
    }, {
      root: null,
      threshold: 0.15,
      rootMargin: "0px 0px -50px 0px"
    });

    revealElements.forEach(el => revealObserver.observe(el));
  }

});
