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
    // 1. Start Background Animation
    const canvas = document.getElementById('tinker-canvas');
    if (canvas) {
        initTinkerEffect(canvas);
    }

    // 2. Generate Navigation Menu
    generateTOC();
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
                baseSpin: (Math.random() - 0.5) * 0.005, 
                currentSpin: 0, 
                color: colors[Math.floor(Math.random() * colors.length)]
            });
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

    function lerp(start, end, amt) {
        return (1 - amt) * start + amt * end;
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        shapes.forEach(s => {
            s.x += s.vx;
            s.y += s.vy;

            const dx = s.x - mouse.x;
            const dy = s.y - mouse.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const interactRadius = 200;
            const maxSpeed = 0.1; 

            if (dist < interactRadius) {
                s.currentSpin = lerp(s.currentSpin, maxSpeed, 0.05);
                const force = (interactRadius - dist) / interactRadius;
                s.x += (dx / dist) * force * 1.5; 
                s.y += (dy / dist) * force * 1.5;
                s.size = lerp(s.size, s.baseSize + 10, 0.1);
            } else {
                s.currentSpin = lerp(s.currentSpin, s.baseSpin, 0.02);
                s.size = lerp(s.size, s.baseSize, 0.05);
            }

            s.angle += s.currentSpin;
            const renderAngle = s.angle + (scrollY * 0.002);

            if (s.x < -50) s.x = width + 50;
            if (s.x > width + 50) s.x = -50;
            if (s.y < -50) s.y = height + 50;
            if (s.y > height + 50) s.y = -50;

            ctx.strokeStyle = s.color;
            ctx.lineWidth = 1.5; 
            drawPolygon(ctx, s.x, s.y, s.size, s.sides, renderAngle);
            ctx.stroke();
            
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(s.x, s.y, 2, 0, Math.PI*2);
            ctx.fill();
        });
        
        requestAnimationFrame(animate);
    }
    animate();
}

/* =========================================
   3. AUTOMATIC TOC GENERATOR (UPDATED)
   ========================================= */
function generateTOC() {
    const toc = document.querySelector('.toc');
    if (!toc) return;

    // 1. Reset the menu
    toc.innerHTML = '<span>Jump to:</span>';

    // 2. Find ONLY the tags that are marked "Completed"
    const completedTags = document.querySelectorAll('.status-completed');

    completedTags.forEach(tag => {
        // Find the Article that holds this tag
        const assignment = tag.closest('.assignment');
        
        if (assignment) {
            const id = assignment.id; // e.g., "a0-1"
            const titleElement = assignment.querySelector('h2'); 

            if (id && titleElement) {
                // Create clean ID: "a0-1" -> "0.1"
                const shortId = id.replace('a', '').replace('-', '.');
                
                // Create link
                const link = document.createElement('a');
                link.href = `#${id}`;
                
                // Clean Title (remove everything after a colon if it's too long)
                let titleText = titleElement.innerText;
                if (titleText.includes(":")) {
                    titleText = titleText.split(":")[0];
                }
                
                link.innerText = `${shortId} ${titleText}`;
                toc.appendChild(link);
            }
        }
    });
}