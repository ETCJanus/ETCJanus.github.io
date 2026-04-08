const fs = require('fs');
const path = require('path');

const files = [
    'c:/Users/etcja/OneDrive/Desktop/Uni/portfolios/portfolio-2026/projects/habit-optimization/checklist.html',
    'c:/Users/etcja/OneDrive/Desktop/Uni/portfolios/portfolio-2026/projects/habit-optimization/insights.html',
    'c:/Users/etcja/OneDrive/Desktop/Uni/portfolios/portfolio-2026/projects/habit-optimization/settings.html'
];

const svgTracker = '<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>';
const svgChecklist = '<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>';
const svgInsights = '<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>';
const svgSettings = '<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    const fileName = path.basename(file);
    
    let navClass = "w-full flex justify-center items-center gap-10 mt-4 opacity-80 hover:opacity-100 transition-opacity text-gray-500 absolute top-0 py-6 text-xl lg:text-2xl";
    if (fileName === "checklist.html" || fileName === "insights.html") {
        navClass = "w-full flex justify-center items-center gap-10 mb-6 text-gray-500 mt-4 opacity-80 hover:opacity-100 transition-opacity";
    }

    let links = [];
    if (fileName !== 'index.html') { links.push(        <a href="index.html" title="Tracker" class="hover:text-white hover:scale-110 transition-all"></a>); }
    if (fileName !== 'checklist.html') { links.push(        <a href="checklist.html" title="Checklist" class="hover:text-white hover:scale-110 transition-all"></a>); }
    if (fileName !== 'insights.html') { links.push(        <a href="insights.html" title="Insights" class="hover:text-white hover:scale-110 transition-all"></a>); }
    if (fileName !== 'settings.html') { links.push(        <a href="settings.html" title="Settings" class="hover:text-white hover:scale-110 transition-all"></a>); }
    
    const newNav =     <nav class="">\n\n    </nav>;
    
    content = content.replace(/\s*<nav[^>]*>[\s\S]*?<\/nav>/, '\n' + newNav);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated', file);
});
