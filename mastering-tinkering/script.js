/* =========================================
   1. CAROUSEL LOGIC
   ========================================= */
let slideIndex = 1;

// Only run carousel logic if the carousel actually exists on the page
if (document.getElementsByClassName("carousel-slide").length > 0) {
    showSlides(slideIndex);
}

function plusSlides(n) {
    showSlides(slideIndex += n);
}

function showSlides(n) {
    let i;
    let slides = document.getElementsByClassName("carousel-slide");
    if (!slides || slides.length === 0) return;

    if (n > slides.length) {slideIndex = 1}
    if (n < 1) {slideIndex = slides.length}

    for (i = 0; i < slides.length; i++) {
        slides[i].style.display = "none";
        slides[i].classList.remove("active");
    }

    slides[slideIndex-1].style.display = "flex";
    slides[slideIndex-1].classList.add("active");
}

/* =========================================
   2. INTERACTIVE BACKGROUND (Momentum Physics)
   ========================================= */

document.addEventListener("DOMContentLoaded", function() {
    const canvas = document.getElementById('tinker-canvas');
    if (canvas) {
        initTinkerEffect(canvas);
    }
});

function initTinkerEffect(canvas) {
    const ctx = canvas.getContext('2d');
    let width, height, shapes = [];
    
    // MOUSE TRACKING
    let mouse = { x: -1000, y: -1000 };
    window.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    });

    // SCROLL TRACKING
    let scrollY = 0;
    window.addEventListener('scroll', () => {
        scrollY = window.scrollY;
    });

    const shapeTypes = [3, 4, 6]; 
    const colors = ['rgba(167, 139, 250, 0.25)', 'rgba(45, 212, 191, 0.25)']; 

    const resize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        initShapes();
    };
    
    function initShapes() {
        shapes = [];
        for(let i=0; i<25; i++) {
            shapes.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.3, 
                vy: (Math.random() - 0.5) * 0.3, 
                size: Math.random() * 20 + 15,
                baseSize: Math.random() * 20 + 15,
                sides: shapeTypes[Math.floor(Math.random() * shapeTypes.length)],
                angle: Math.random() * Math.PI * 2,
                
                // PROPERTIES FOR SPIN MOMENTUM
                // baseSpin: very slow "idle" rotation
                baseSpin: (Math.random() - 0.5) * 0.005, 
                // currentSpin: starts at base, changes with mouse
                currentSpin: 0, 
                color: colors[Math.floor(Math.random() * colors.length)]
            });
            // Initialize current spin to base spin
            shapes[i].currentSpin = shapes[i].baseSpin;
        }
    }

    window.addEventListener('resize', resize);
    resize();

    function drawPolygon(ctx, x, y, radius, sides, angle) {
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const theta = angle + i * 2 * Math.PI / sides;
            const px = x + radius * Math.cos(theta);
            const py = y + radius * Math.sin(theta);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    }

    // Linear Interpolation helper for smooth speed changes
    function lerp(start, end, amt) {
        return (1 - amt) * start + amt * end;
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        shapes.forEach(s => {
            // 1. STANDARD MOVEMENT
            s.x += s.vx;
            s.y += s.vy;

            // 2. MOUSE INTERACTION (Spin Up)
            const dx = s.x - mouse.x;
            const dy = s.y - mouse.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const interactRadius = 200;

            // Target Speed: 0.1 rad/frame is approx 1 rotation per second at 60fps
            const maxSpeed = 0.1; 

            if (dist < interactRadius) {
                // If mouse is near, smoothly accelerate to maxSpeed
                s.currentSpin = lerp(s.currentSpin, maxSpeed, 0.05);
                
                // Gentle push away (magnetic field)
                const force = (interactRadius - dist) / interactRadius;
                s.x += (dx / dist) * force * 1.5; 
                s.y += (dy / dist) * force * 1.5;
                
                // Gentle grow
                s.size = lerp(s.size, s.baseSize + 10, 0.1);
            } else {
                // If mouse is far, smoothly decelerate back to idle drift
                s.currentSpin = lerp(s.currentSpin, s.baseSpin, 0.02);
                s.size = lerp(s.size, s.baseSize, 0.05);
            }

            // Apply the spin
            s.angle += s.currentSpin;

            // 3. SCROLL INTERACTION (The Gear Effect)
            // Adds a direct rotation based on scroll position so it feels connected
            const renderAngle = s.angle + (scrollY * 0.002);

            // 4. SCREEN WRAPPING
            if (s.x < -50) s.x = width + 50;
            if (s.x > width + 50) s.x = -50;
            if (s.y < -50) s.y = height + 50;
            if (s.y > height + 50) s.y = -50;

            // DRAW
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 1.5; 
            drawPolygon(ctx, s.x, s.y, s.size, s.sides, renderAngle);
            ctx.stroke();
            
            // Draw Center Dot
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(s.x, s.y, 2, 0, Math.PI*2);
            ctx.fill();
        });
        
        requestAnimationFrame(animate);
    }
    animate();
}