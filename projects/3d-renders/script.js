// Files discovered from assets/images/Renders (2022 & 2023)
const files = [
    '../../assets/images/Renders/2023/spacecomposited.png',
    '../../assets/images/Renders/2023/NatureComposited.png',
    '../../assets/images/Renders/2023/natureanimation.png',
    '../../assets/images/Renders/2023/Nature2Composited.png',
    '../../assets/images/Renders/2023/v20021.png',
    '../../assets/images/Renders/2023/LetMeDoItForYou.mp4',
    '../../assets/images/Renders/2023/Headphones200%25.png',
    '../../assets/images/Renders/2023/Box3.mp4',
    '../../assets/images/Renders/2023/Bird3.png',
    '../../assets/images/Renders/2023/4.2.png',
    '../../assets/images/Renders/2022/Windows.png',
    '../../assets/images/Renders/2022/Mechenical%20Spider.mov',
    '../../assets/images/Renders/2022/Masked%20Lady.png',
    '../../assets/images/Renders/2022/LOTR.jpg',
    '../../assets/images/Renders/2022/Highrise.png',
    '../../assets/images/Renders/2022/Grass%20creature.png',
    '../../assets/images/Renders/2022/Dino2.png',
    '../../assets/images/Renders/2022/Dino1.png',
    '../../assets/images/Renders/2022/Deer.png',
    '../../assets/images/Renders/2022/Angel.mp4'
];

const gallery = document.getElementById('gallery');
const lightbox = document.getElementById('lightbox');
const lbMedia = document.getElementById('lb-media');
const lbClose = document.getElementById('lb-close');

function isVideo(path){
    return /\.(mp4|mov|webm|ogg)$/i.test(path);
}

function filenameFromPath(p){
    try{ return decodeURIComponent(p.split('/').pop()); }catch(e){ return p.split('/').pop(); }
}

files.forEach(p => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.setAttribute('tabindex','0');

    if(isVideo(p)){
        const vid = document.createElement('video');
        vid.src = p;
        vid.muted = true;
        vid.autoplay = true;
        vid.loop = true;
        vid.playsInline = true;
        vid.style.width = '100%';
        vid.style.height = '100%';
        vid.style.objectFit = 'cover';
        item.appendChild(vid);
        const play = document.createElement('div');
        play.className = 'caption';
        play.textContent = filenameFromPath(p).replace(/\.(mp4|mov|webm|ogg)$/i,'');
        item.appendChild(play);
        item.addEventListener('click', ()=> openLightboxVideo(p));
        item.addEventListener('keypress', (e)=>{ if(e.key==='Enter') openLightboxVideo(p); });
    } else {
        const img = document.createElement('img');
        img.src = p;
        img.alt = filenameFromPath(p).replace(/[-_\.]/g,' ');
        item.appendChild(img);
        const cap = document.createElement('div');
        cap.className = 'caption';
        cap.textContent = filenameFromPath(p).replace(/\.(png|jpg|jpeg|gif|webp)$/i,'');
        item.appendChild(cap);
        item.addEventListener('click', ()=> openLightboxImage(p));
        item.addEventListener('keypress', (e)=>{ if(e.key==='Enter') openLightboxImage(p); });
    }

    gallery.appendChild(item);
});

function openLightboxImage(src){
    lbMedia.innerHTML = '';
    const img = document.createElement('img');
    img.src = src;
    img.style.maxWidth = '95%';
    img.style.maxHeight = '90%';
    img.alt = filenameFromPath(src);
    lbMedia.appendChild(img);
    lightbox.classList.add('visible');
    lightbox.setAttribute('aria-hidden','false');
}

function openLightboxVideo(src){
    lbMedia.innerHTML = '';
    const v = document.createElement('video');
    v.src = src;
    v.controls = true;
    v.autoplay = true;
    v.style.maxWidth = '95%';
    v.style.maxHeight = '90%';
    v.playsInline = true;
    lbMedia.appendChild(v);
    lightbox.classList.add('visible');
    lightbox.setAttribute('aria-hidden','false');
}

function closeLightbox(){
    lightbox.classList.remove('visible');
    lightbox.setAttribute('aria-hidden','true');
    lbMedia.innerHTML = '';
}

lbClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e)=>{ if(e.target===lightbox) closeLightbox(); });
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeLightbox(); });
