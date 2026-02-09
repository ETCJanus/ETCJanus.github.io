document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. GLOBAL SCROLL REVEAL ---
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // Animate Skill Bars
                const bars = entry.target.querySelectorAll('.bar-fill');
                bars.forEach(bar => {
                    const targetWidth = bar.style.width;
                    bar.style.width = '0%';
                    setTimeout(() => { bar.style.width = targetWidth; }, 100);
                });
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.step, .project-card, .timeline-item, .glass-card, .about-hero')
            .forEach(el => observer.observe(el));


    // --- 2. CANVAS MANAGER ---
    const heroCanvas = document.getElementById('hero-canvas');
    const projectCanvas = document.getElementById('project-canvas');
    const aboutCanvas = document.getElementById('about-canvas');

    if (heroCanvas) initHeroEffect(heroCanvas);
    if (projectCanvas) initProjectEffect(projectCanvas);
    if (aboutCanvas) initAboutEffect(aboutCanvas);
    
    // Initialize the glitch effect
    initHolographicTilt(); // <-- New
});

// --- EFFECT 1: HERO (Constellations) ---
function initHeroEffect(canvas) {
    const ctx = canvas.getContext('2d');
    let width, height, particles = [];
    const mouse = { x: null, y: null, radius: 150 };

    window.addEventListener('mousemove', e => { mouse.x = e.x; mouse.y = e.y; });
    
    const resize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        particles = [];
        const count = (width * height) / 9000;
        for(let i=0; i<count; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 2 + 1
            });
        }
    };
    window.addEventListener('resize', resize);
    resize();

    function animate() {
        ctx.clearRect(0, 0, width, height);
        particles.forEach(p => {
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0 || p.x > width) p.vx *= -1;
            if (p.y < 0 || p.y > height) p.vy *= -1;

            let dx = mouse.x - p.x;
            let dy = mouse.y - p.y;
            let distance = Math.sqrt(dx*dx + dy*dy);
            if (distance < mouse.radius) {
                 const force = (mouse.radius - distance) / mouse.radius;
                 p.x -= (dx/distance) * force * 2;
                 p.y -= (dy/distance) * force * 2;
            }

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(167, 139, 250, 0.5)';
            ctx.fill();
        });
        
        particles.forEach((p1, i) => {
            for (let j = i; j < particles.length; j++) {
                const p2 = particles[j];
                const d = Math.sqrt((p1.x-p2.x)**2 + (p1.y-p2.y)**2);
                if (d < 100) {
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(167, 139, 250, ${1 - d/100})`;
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            }
        });
        requestAnimationFrame(animate);
    }
    animate();
}

// --- EFFECT 2: PROJECTS (Structured Blueprint Grid) ---
function initProjectEffect(canvas) {
    const ctx = canvas.getContext('2d');
    let width, height, dots = [];
    const mouse = { x: null, y: null };
    const spacing = 50; // Grid spacing

    window.addEventListener('mousemove', e => { mouse.x = e.x; mouse.y = e.y; });
    
    const resize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        dots = [];
        for (let x = 0; x < width; x += spacing) {
            for (let y = 0; y < height; y += spacing) {
                dots.push({ x, y, baseX: x, baseY: y });
            }
        }
    };
    window.addEventListener('resize', resize);
    resize();

    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        dots.forEach(dot => {
            const dx = mouse.x - dot.x;
            const dy = mouse.y - dot.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const maxDist = 150;

            if (dist < maxDist) {
                const alpha = 1 - (dist / maxDist);
                ctx.beginPath();
                ctx.fillStyle = `rgba(0, 255, 136, ${alpha})`;
                ctx.arc(dot.x, dot.y, 2 + alpha*1.5, 0, Math.PI*2);
                ctx.fill();

                ctx.beginPath();
                ctx.strokeStyle = `rgba(0, 255, 136, ${alpha * 0.5})`;
                ctx.moveTo(dot.x, dot.y);
                ctx.lineTo(mouse.x, mouse.y);
                ctx.stroke();
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.fillRect(dot.x, dot.y, 1, 1);
            }
        });
        requestAnimationFrame(animate);
    }
    animate();
}

// --- EFFECT 3: ABOUT (Floating Flow Stream) ---
function initAboutEffect(canvas) {
    const ctx = canvas.getContext('2d');
    let width, height, symbols = [];
    const chars = ['{ }', '</>', '01', '♫', '⚡', '✎', 'cube', '●']; 

    const resize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        symbols = [];
        const count = 30;
        for(let i=0; i<count; i++) {
            symbols.push({
                x: Math.random() * width,
                y: Math.random() * height,
                text: chars[Math.floor(Math.random() * chars.length)],
                size: Math.random() * 10 + 10,
                speed: Math.random() * 0.5 + 0.2,
                opacity: Math.random() * 0.5
            });
        }
    };
    window.addEventListener('resize', resize);
    resize();

    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        symbols.forEach(s => {
            s.y -= s.speed;
            s.opacity += (Math.random() - 0.5) * 0.01;
            if(s.opacity < 0) s.opacity = 0;
            if(s.opacity > 0.5) s.opacity = 0.5;

            if (s.y < -50) {
                s.y = height + 50;
                s.x = Math.random() * width;
            }

            ctx.font = `${s.size}px monospace`;
            ctx.fillStyle = `rgba(167, 139, 250, ${s.opacity})`;
            ctx.fillText(s.text, s.x, s.y);
        });
        requestAnimationFrame(animate);
    }
    animate();
}

// --- EFFECT 4: HOLOGRAPHIC TILT (Interactive) ---
function initHolographicTilt() {
    const wrapper = document.getElementById('glitch-wrapper');
    if (!wrapper) return;

    const mainImg = wrapper.querySelector('.main-img');
    const cyan = wrapper.querySelector('.cyan');
    const magenta = wrapper.querySelector('.magenta');

    const maxTilt = 25; // Increased for exaggeration

    // Tracking the window instead of just the wrapper
    window.addEventListener('mousemove', (e) => {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        // Calculate distance from center (-1 to 1)
        const x = (e.clientX - centerX) / centerX;
        const y = (e.clientY - centerY) / centerY;

        const rotateY = x * maxTilt;
        const rotateX = -y * maxTilt;

        // Update the main image with a deeper Z-translation
        mainImg.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(50px)`;

        // Push the color layers further back for a more "exploded" view
        cyan.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(-40px) translateX(${-x * 60}px) translateY(${-y * 60}px)`;
        magenta.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(-20px) translateX(${-x * 30}px) translateY(${-y * 30}px)`;
        
        // Add a dynamic glare/brightness based on mouse position
        mainImg.style.filter = `brightness(${1 + Math.abs(x) * 0.3}) contrast(1.1)`;
    });
}