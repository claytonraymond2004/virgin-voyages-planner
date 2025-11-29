
export function initTooltips() {
    const tooltip = document.getElementById('toolbar-tooltip');
    if (!tooltip) return;

    const buttons = document.querySelectorAll('[data-tooltip]');

    buttons.forEach(btn => {
        btn.addEventListener('mouseenter', (e) => {
            const text = btn.getAttribute('data-tooltip');
            if (!text) return;

            tooltip.textContent = text;
            tooltip.style.display = 'block';

            // Position logic
            const rect = btn.getBoundingClientRect();
            const tipRect = tooltip.getBoundingClientRect();

            // Center horizontally relative to button
            let left = rect.left + (rect.width / 2) - (tipRect.width / 2);

            // Position below button
            let top = rect.bottom + 8; // 8px gap

            // Boundary checks
            if (left < 10) left = 10;
            if (left + tipRect.width > window.innerWidth - 10) {
                left = window.innerWidth - tipRect.width - 10;
            }

            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
            tooltip.classList.add('visible');
        });

        btn.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
            tooltip.classList.remove('visible');
        });

        // Hide on click to avoid obstruction
        btn.addEventListener('click', () => {
            tooltip.style.display = 'none';
            tooltip.classList.remove('visible');
        });
    });
}
