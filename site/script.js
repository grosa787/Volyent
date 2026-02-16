/* ============================================================
   Volyent Landing — Interactions & 3D Effects
   ============================================================ */

// ─── Navbar scroll effect ────────────────────────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
});

// ─── 3D Card Mouse Tracking ─────────────────────────────────
const card = document.getElementById('floatingCard');
if (card) {
    const wrapper = card.closest('.hero-3d-wrapper');
    wrapper.addEventListener('mousemove', (e) => {
        const rect = wrapper.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.animation = 'none';
        card.style.transform = `rotateY(${x * 20}deg) rotateX(${-y * 20}deg)`;
    });
    wrapper.addEventListener('mouseleave', () => {
        card.style.animation = '';
        card.style.transform = '';
    });
}

// ─── Scroll Reveal ───────────────────────────────────────────
function initReveal() {
    const elements = document.querySelectorAll(
        '.feature-card, .step-card, .price-card, .download-card, .section-header'
    );
    elements.forEach(el => el.classList.add('reveal'));

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                // Stagger the animations
                setTimeout(() => {
                    entry.target.classList.add('visible');
                }, i * 80);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    elements.forEach(el => observer.observe(el));
}

// ─── Smooth scroll for anchor links ─────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// ─── Speed bars animation on scroll ─────────────────────────
function initSpeedBars() {
    const bars = document.querySelectorAll('.speed-fill');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animation = 'fillIn 1.2s ease-out forwards';
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });
    bars.forEach(bar => observer.observe(bar));
}

// ─── Parallax orbs on mouse ──────────────────────────────────
document.addEventListener('mousemove', (e) => {
    const mx = e.clientX / window.innerWidth - 0.5;
    const my = e.clientY / window.innerHeight - 0.5;
    document.querySelectorAll('.orb').forEach((orb, i) => {
        const speed = (i + 1) * 12;
        orb.style.transform = `translate(${mx * speed}px, ${my * speed}px)`;
    });
});

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initReveal();
    initSpeedBars();
});
