const fs = require('fs');
const path = 'c:/Users/etcja/OneDrive/Desktop/Uni/portfolios/portfolio-2026/projects/habit-optimization/script.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Replace sleepScoreEl class text sizes
content = content.replace(
    /sleepScoreEl\.className = \bsolute top-\[2px\] right-\[4px\] text-\[9px\] md:text-\[10px\] (.*?)\;/,
    'sleepScoreEl.className = bsolute top-[2px] right-[3px] text-[10px] md:text-[11.5px] ;'
);

// 2. Replace moodEl replacement in grid
const oldMoodGridStr =                     if (moodLog && moodLog.metadata && moodLog.metadata.level) {\\n                        const moodEl = document.createElement('div');\\n                        moodEl.className = 'absolute top-[2px] left-[3px] text-[8px] md:text-[9px] font-bold text-yellow-400 pointer-events-none drop-shadow-[0_1px_1px_rgba(0,0,0,1)] z-10 opacity-90';\\n                        moodEl.textContent = moodLog.metadata.level;\\n                        moodEl.title = 'Mood: ' + moodLog.metadata.level;\\n                        cell.appendChild(moodEl);\\n                    };

const newTaskScoreStr =                     const dayTasks = tasksCache.filter(t => t.completed && (t.completed_date === dateKey || (t.target_date === dateKey && !t.completed_date)));\n                    if (dayTasks.length > 0) {\n                        const taskScoreEl = document.createElement('div');\n                        taskScoreEl.className = 'absolute top-[2px] left-[3px] text-[10px] md:text-[11.5px] font-bold text-yellow-400 pointer-events-none drop-shadow-[0_1px_1px_rgba(0,0,0,1)] z-10 opacity-90';\n                        taskScoreEl.textContent = dayTasks.length;\n                        taskScoreEl.title = 'Tasks Completed: ' + dayTasks.length;\n                        cell.appendChild(taskScoreEl);\n                    };

const regexMoodGrid = /                    if \(moodLog && moodLog\.metadata && moodLog\.metadata\.level\) {\n                        const moodEl = document\.createElement\('div'\);\n                        moodEl\.className = 'absolute top-\[2px\] left-\[3px\] text-\[8px\] md:text-\[9px\] font-bold text-yellow-400 pointer-events-none drop-shadow-\[0_1px_1px_rgba\(0,0,0,1\)\] z-10 opacity-90';\n                        moodEl\.textContent = moodLog\.metadata\.level;\n                        moodEl\.title = 'Mood: ' \+ moodLog\.metadata\.level;\n                        cell\.appendChild\(moodEl\);\n                    }/;

if (!regexMoodGrid.test(content)) {
    console.log("Could not find moodEl grid block");
} else {
    content = content.replace(regexMoodGrid, newTaskScoreStr);
    console.log("Replaced moodEl with checklist indicator.");
}

fs.writeFileSync(path, content, 'utf8');
