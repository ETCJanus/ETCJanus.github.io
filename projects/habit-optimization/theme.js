(function() {
    const themeName = localStorage.getItem('habit_theme') || 'dark';
    if(themeName === 'dark') return;

    const themes = {
        light: {
            bg: '#f6f8fa',
            bgLight: '#ffffff',
            bgDarken: '#e1e4e8',
            border: '#d0d7de',
            text: '#24292f',
            textDim: '#57606a',
            primary: '#0969da'
        },
        blue: {
            bg: '#0a0f1e',
            bgLight: '#1a1f35',
            bgDarken: '#050a15',
            border: '#3d4563',
            text: '#e6f0ff',
            textDim: '#a8b8d8',
            primary: '#58a6ff'
        }
    };

    const theme = themes[themeName];
    if(!theme) return;

    const style = document.createElement('style');
    style.innerHTML = `
        body { background-color: ${theme.bg} !important; color: ${theme.text} !important; }
        
        .bg-\\[\\#0d1117\\] { background-color: ${theme.bg} !important; }
        .bg-\\[\\#161b22\\] { background-color: ${theme.bgLight} !important; }
        .bg-\\[\\#21262d\\] { background-color: ${theme.bgDarken} !important; }
        
        .border-\\[\\#30363d\\] { border-color: ${theme.border} !important; }
        
        .text-white { color: ${theme.text} !important; }
        .text-\\[\\#c9d1d9\\] { color: ${theme.text} !important; }
        .text-gray-500, .text-gray-400 { color: ${theme.textDim} !important; }
        
        input, select, textarea, button.view-btn { 
            background-color: ${theme.bgDarken} !important; 
            border-color: ${theme.border} !important; 
            color: ${theme.text} !important; 
        }

        /* Specific overrides */
        .tab-btn { color: ${theme.textDim} !important; }
        .tab-btn:hover, .tab-btn.active { color: ${theme.text} !important; }
        .tab-btn.active { border-bottom-color: ${theme.primary} !important; }
        
        .day-cell.inactive { background-color: ${theme.bgDarken} !important; opacity: 0.5; }
    `;
    document.head.appendChild(style);
})();
// Instant preloader for buttery navigation
(function(){ const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@hotwired/turbo@8.0.4/+esm'; s.type = 'module'; s.defer = true; document.head.appendChild(s); })();


