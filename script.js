let currentMode = 'single';
let currentLang = 'he'; // שפת ברירת מחדל
let cachedHebrewDates = {}; 

// המרת סיסמה ל-SHA256
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const CORRECT_PASSWORD_HASH = "fd573849d78eb68e5bced78f7d88ffabeef179942d2b3f62c5996c43b0e14191";

async function checkPassword() {
    const input = document.getElementById('password-input').value;
    const hashedInput = await sha256(input);
    
    if (hashedInput === CORRECT_PASSWORD_HASH) {
        document.getElementById('lock-screen').style.display = 'none';
        sessionStorage.setItem('authenticated', 'true');
        loadDraft(); 
        updateHistoryList();
    } else {
        document.getElementById('error-message').style.display = 'block';
    }
}

if (sessionStorage.getItem('authenticated') === 'true') {
    document.getElementById('lock-screen').style.display = 'none';
    window.addEventListener('DOMContentLoaded', () => {
        loadDraft();
        updateHistoryList();
    });
}

document.getElementById('password-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') checkPassword();
});

// ניהול שפות
function setLanguage(lang) {
    currentLang = lang;
    document.getElementById('btn-lang-he').classList.toggle('active', lang === 'he');
    document.getElementById('btn-lang-en').classList.toggle('active', lang === 'en');
    
    // שינוי כיוון תיבת הטקסט של המייל בהתאם לשפה שנבחרה
    document.getElementById('rawMailInput').style.direction = lang === 'en' ? 'ltr' : 'rtl';
    
    saveDraft();
    updateLivePreview();
}

// ניהול מצבים
function setMode(mode) {
    currentMode = mode;
    document.getElementById('btn-single').classList.toggle('active', mode === 'single');
    document.getElementById('btn-series').classList.toggle('active', mode === 'series');
    
    document.getElementById('lbl-eventName').innerText = mode === 'single' ? 'שם ההרצאה' : 'שם הסדרה';
    document.getElementById('lbl-eventType').innerText = mode === 'single' ? 'סוג ההרצאה' : 'סוג הסדרה';
    document.getElementById('lbl-speaker').innerText = mode === 'single' ? 'מרצה' : 'מרצה(/ים) (הפרד בפסיקים)';
    document.getElementById('lbl-description').innerText = mode === 'single' ? 'תיאור קצר (ניתן להשתמש ב-*להדגשה*)' : 'תיאור קצר של הסדרה (ניתן להשתמש ב-*להדגשה*)';
    document.getElementById('lbl-gregorianDate').innerText = mode === 'single' ? 'תאריך לועזי' : 'תאריך תחילת האירוע';
    
    document.getElementById('single-price-group').style.display = mode === 'single' ? 'block' : 'none';
    document.getElementById('series-prices-group').style.display = mode === 'series' ? 'grid' : 'none';
    document.getElementById('series-lectures-group').style.display = mode === 'series' ? 'block' : 'none';
    
    if (mode === 'series') {
        const container = document.getElementById('lectures-container');
        if (container.children.length === 0) {
            addLectureInput();
            addLectureInput();
        }
    }
    saveDraft();
    updateLivePreview();
}

function quickFill(fieldId, value) {
    document.getElementById(fieldId).value = value;
    saveDraft();
    updateLivePreview();
}

function addLectureInput(value = '') {
    const container = document.getElementById('lectures-container');
    const count = container.children.length + 1;
    
    const row = document.createElement('div');
    row.className = 'lecture-input-row';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'lecture-item';
    input.placeholder = `הרצאה מס' ${count}`;
    input.value = value;
    input.oninput = () => { saveDraft(); updateLivePreview(); };
    
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.innerText = '✕';
    removeBtn.onclick = function() {
        row.remove();
        reindexLectures();
        saveDraft();
        updateLivePreview();
    };
    
    row.appendChild(input);
    row.appendChild(removeBtn);
    container.appendChild(row);
}

function reindexLectures() {
    const inputs = document.querySelectorAll('.lecture-item');
    inputs.forEach((input, index) => {
        input.placeholder = `הרצאה מס' ${index + 1}`;
    });
}

// פונקציית חילוץ מותאמת אישית וחכמה (תומכת בעברית ואנגלית)
function parseMailContent() {
    const rawText = document.getElementById('rawMailInput').value.trim();
    if (!rawText) {
        alert("אנא הדבק טקסט בתיבה תחילה.");
        return;
    }

    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 3) {
        alert("הטקסט קצר מדי.");
        return;
    }

    // זיהוי שפה אוטומטי זמני לפי תכולת הטקסט בשורה הראשונה
    const isEnglishText = /[a-zA-Z]/.test(lines[0]);
    if (isEnglishText) {
        setLanguage('en');
    } else {
        setLanguage('he');
    }

    // שורה 1: שם האירוע
    document.getElementById('eventName').value = lines[0];

    // שורה 2: סוג ומרצה
    const line2 = lines[1];
    let eventType = line2;
    let speaker = "";

    const splitWords = currentLang === 'en' ? [" with ", "by "] : [" עם ", "עם "];
    let splitFound = false;

    for (let word of splitWords) {
        if (line2.toLowerCase().includes(word)) {
            const parts = line2.split(new RegExp(word, "i"));
            eventType = parts[0].trim();
            speaker = parts[1].trim();
            splitFound = true;
            break;
        }
    }
    
    document.getElementById('eventType').value = eventType;
    document.getElementById('speaker').value = speaker;

    // שורה 3: זמן, תאריך ומיקום
    const line3 = lines[2];
    
    // חילוץ שעה (תואם לפורמטים 18:00 או 1:00 PM / 8:00 PM)
    const timeRegex = /(\d{1,2}:\d{2})\s*(?:AM|PM|am|pm)?/;
    const foundTime = line3.match(timeRegex);
    if (foundTime) {
        // אם זה באנגלית ויש PM/Israel time, נעדיף לקחת את השעה הישראלית אם קיימת
        if (currentLang === 'en' && line3.includes("Israel time")) {
            const israelTimeMatch = line3.match(/(\d{1,2}:\d{2})\s*(?:PM|AM)?\s*Israel/i);
            document.getElementById('eventTime').value = israelTimeMatch ? israelTimeMatch[1] : foundTime[1];
        } else {
            document.getElementById('eventTime').value = foundTime[1];
        }
    }

    // חילוץ תאריך
    if (currentLang === 'he') {
        const dateRegex = /(\d{1,2}\.\d{1,2})/;
        const foundDate = line3.match(dateRegex);
        if (foundDate) {
            const parts = foundDate[1].split('.');
            const currentYear = new Date().getFullYear();
            document.getElementById('gregorianDate').value = `${currentYear}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
    } else {
        // אנגלית: חילוץ פורמט כמו Sunday, July 5, 2026
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        let foundDateStr = "";
        for (let m of months) {
            if (line3.includes(m)) {
                const regex = new RegExp(`${m}\\s+\\d{1,2},\\s*\\d{4}`, "i");
                const match = line3.match(regex);
                if (match) {
                    foundDateStr = match[0];
                    break;
                }
            }
        }
        if (foundDateStr) {
            const d = new Date(foundDateStr);
            if (!isNaN(d.getTime())) {
                document.getElementById('gregorianDate').value = d.toISOString().split('T')[0];
            }
        }
    }

    // מיקום
    if (line3.toLowerCase().includes("zoom") || line3.includes("זום") || line3.includes("מקוון")) {
        document.getElementById('location').value = ""; 
    } else {
        let locationCandidate = "";
        if (currentLang === 'he') {
            if (line3.includes("בשעה")) {
                const afterTime = line3.split(/בשעה \d{1,2}:\d{2}/);
                if (afterTime.length > 1) locationCandidate = afterTime[1].replace(/[,ב]/g, "").trim();
            }
        } else {
            if (line3.toLowerCase().includes("at ")) {
                const parts = line3.split(/at /i);
                locationCandidate = parts[parts.length - 1].trim();
            }
        }
        document.getElementById('location').value = locationCandidate;
    }

    // תיאור ומחירים
    let descriptionLines = [];
    let isFree = false;
    let price1 = "";

    for (let i = 3; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes("free") || line.includes("חופשית") || line.includes("חופשי")) {
            isFree = true;
        }
        if (line.includes("מחיר") || line.includes("עלות") || line.includes("ש\"ח") || line.toLowerCase().includes("price") || line.toLowerCase().includes("nis")) {
            const numbers = line.match(/\d+/g);
            if (numbers) price1 = numbers[0];
        }
        if (line.length > 15 && !line.includes("http") && !line.toLowerCase().includes("price") && !line.includes("מחיר")) {
            descriptionLines.push(line);
        }
    }

    document.getElementById('price').value = isFree ? "0" : (price1 || "");
    if (descriptionLines.length > 0) {
        document.getElementById('description').value = descriptionLines.join('\n\n');
    }

    saveDraft();
    updateLivePreview();
    alert("הפרטים חולצו בהצלחה!");
}

// קבלת תאריך עברי
async function getHebrewDate(dateStr) {
    if (!dateStr) return "";
    if (cachedHebrewDates[dateStr]) return cachedHebrewDates[dateStr];
    try {
        const [year, month, day] = dateStr.split('-');
        const response = await fetch(`https://www.hebcal.com/converter?cfg=json&gy=${year}&gm=${month}&gd=${day}&g2h=1`);
        const data = await response.json();
        let hebParts = data.hebrew.split(' ');
        if (hebParts.length > 1) hebParts.pop();
        let hebrewDate = hebParts.join(' ');
        hebrewDate = hebrewDate.replace(/[\u0591-\u05C7]/g, '').replace(/׳/g, "'");
        cachedHebrewDates[dateStr] = hebrewDate;
        return hebrewDate;
    } catch (e) { return ""; }
}

// בניית גוף ההודעה הגנרי (עברית ואנגלית)
async function buildMessage() {
    const eventName = document.getElementById('eventName').value || (currentLang === 'he' ? "[שם האירוע]" : "[Event Name]");
    const eventType = document.getElementById('eventType').value || (currentLang === 'he' ? "[סוג האירוע]" : "[Event Type]");
    const speakerVal = document.getElementById('speaker').value.trim();
    const description = document.getElementById('description').value;
    const dateVal = document.getElementById('gregorianDate').value;
    const timeVal = document.getElementById('eventTime').value || "--:--";
    const locationVal = document.getElementById('location').value.trim();
    const regLink = document.getElementById('regLink').value || "[Link]";

    let dayOfWeek = currentLang === 'he' ? "[יום]" : "[Day]";
    let formattedDate = currentLang === 'he' ? "[תאריך]" : "[Date]";
    let hebrewDate = "";

    if (dateVal) {
        const dateObj = new Date(dateVal);
        if (currentLang === 'he') {
            const days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
            dayOfWeek = days[dateObj.getDay()];
            formattedDate = `${dateObj.getDate()}.${dateObj.getMonth() + 1}`;
            hebrewDate = await getHebrewDate(dateVal);
        } else {
            const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            dayOfWeek = days[dateObj.getDay()];
            formattedDate = `${months[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()}`;
        }
    }

    // בניית כותרת מובנית כציטוט
    let boldHeader = `> *${eventName} | ${eventType}`;
    if (speakerVal) {
        const connector = currentLang === 'he' ? " עם " : " with ";
        boldHeader += `${connector}${speakerVal}`;
    }
    boldHeader += `*`;

    let message = `${boldHeader}\n\n`;
    if (description) message += `${description}\n\n`;

    if (currentLang === 'he') {
        // מבנה עברית (קיים)
        if (currentMode === 'single') {
            const priceVal = document.getElementById('price').value.trim();
            let locationLine = locationVal ? `• *מיקום:* ${locationVal}\n` : "";
            let priceLine = (!priceVal || priceVal == "0") ? "• *עלות:* ההשתתפות בהרצאה חופשית, בהרשמה מראש." : `• *עלות:* ${priceVal}₪`;

            message += `📅 *מתי ואיפה?*\n`;
            message += `• *יום:* תאריך ${dayOfWeek}${hebrewDate ? ', ' + hebrewDate : ''}, ${formattedDate}\n`;
            message += `• *שעה:* ${timeVal}\n`;
            if (locationLine) message += locationLine;
            message += `${priceLine}\n\n`;
        } else {
            // סדרת הרצאות בעברית...
            const priceLecture = document.getElementById('pricePerLecture').value.trim();
            const priceSeries = document.getElementById('pricePerSeries').value.trim();
            let priceContent = (!priceLecture || priceLecture == "0") && (!priceSeries || priceSeries == "0")
                ? "ההשתתפות חופשית, בהרשמה מראש."
                : `${priceLecture} ש"ח להרצאה בודדת / ${priceSeries} ש"ח לכל הסדרה`;

            message += `📖 *הרצאות הכלולות בסדרה:*\n`;
            const lectureInputs = document.querySelectorAll('.lecture-item');
            let hasLectures = false;
            lectureInputs.forEach(input => {
                const val = input.value.trim();
                if (val) { message += `- ${val}\n`; hasLectures = true; }
            });
            if (!hasLectures) message += "- [רשימת הרצאות]\n";
            message += `\n`;

            message += `📅 *פרטי המפגשים:*\n`;
            message += `• *תאריך תחילת האירוע:* יום ${dayOfWeek}${hebrewDate ? ', ' + hebrewDate : ''}, ${formattedDate}\n`;
            message += `• *יום בשבוע:* ההרצאה תתרחש בכל יום ${dayOfWeek}\n`;
            message += `• *שעה:* ${timeVal}\n`;
            message += `• *מחיר:* ${priceContent}\n`;
            if (locationVal) message += `• *מיקום:* ${locationVal}\n`;
            message += `\n`;
        }
        message += `*לפרטים נוספים והרשמה👇*\n`;
    } else {
        // מבנה אנגלי חדש (LTR)
        if (currentMode === 'single') {
            const priceVal = document.getElementById('price').value.trim();
            let locationLine = locationVal ? `• *Location:* ${locationVal}\n` : "";
            let priceLine = (!priceVal || priceVal == "0") ? "• *Admission:* Free admission, registration required." : `• *Price:* ${priceVal} NIS`;

            message += `📅 *When and Where?*\n`;
            message += `• *Date:* ${dayOfWeek}, ${formattedDate}\n`;
            message += `• *Time:* ${timeVal}\n`;
            if (locationLine) message += locationLine;
            message += `${priceLine}\n\n`;
        } else {
            const priceLecture = document.getElementById('pricePerLecture').value.trim();
            const priceSeries = document.getElementById('pricePerSeries').value.trim();
            let priceContent = (!priceLecture || priceLecture == "0") && (!priceSeries || priceSeries == "0")
                ? "Free admission, registration required."
                : `${priceLecture} NIS per lecture / ${priceSeries} NIS for the entire series`;

            message += `📖 *Lectures in the Series:*\n`;
            const lectureInputs = document.querySelectorAll('.lecture-item');
            let hasLectures = false;
            lectureInputs.forEach(input => {
                const val = input.value.trim();
                if (val) { message += `- ${val}\n`; hasLectures = true; }
            });
            if (!hasLectures) message += "- [List of lectures]\n";
            message += `\n`;

            message += `📅 *Event Details:*\n`;
            message += `• *Start Date:* ${dayOfWeek}, ${formattedDate}\n`;
            message += `• *Schedule:* Every ${dayOfWeek}\n`;
            message += `• *Time:* ${timeVal}\n`;
            message += `• *Price:* ${priceContent}\n`;
            if (locationVal) message += `• *Location:* ${locationVal}\n`;
            message += `\n`;
        }
        message += `*For details and registration👇*\n`;
    }

    message += `${regLink}`;
    return message;
}

// עדכון תצוגה מקדימה חיה
async function updateLivePreview() {
    const previewContent = await buildMessage();
    const previewDiv = document.getElementById('live-preview-content');
    
    // ניהול כיווניות של הקופסה בהתאם לשפה
    if (currentLang === 'en') {
        previewDiv.classList.add('preview-en');
    } else {
        previewDiv.classList.remove('preview-en');
    }

    // קביעת עיצוב הציטוט בהתאם לשפה (קו ימין לעברית, קו שמאל לאנגלית)
    const borderSide = currentLang === 'en' ? 'border-left' : 'border-right';
    const paddingSide = currentLang === 'en' ? 'padding-left' : 'padding-right';
    const clearSide = currentLang === 'en' ? 'border-right: none; padding-right: 0;' : 'border-left: none; padding-left: 0;';

    let htmlPreview = previewContent
        .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
        .replace(/^>\s*(.*)$/gm, `<div style='${borderSide}: 3.5px solid #8696a0; ${paddingSide}: 10px; ${clearSide} margin: 6px 0; color: #4a4a4a; font-style: normal;'>$1</div>`)
        .replace(/\n/g, "<br>");
        
    previewDiv.innerHTML = htmlPreview;
}

// שמירה והעתקה
async function generateAndCopy() {
    const msg = await buildMessage();
    navigator.clipboard.writeText(msg).then(() => {
        saveToHistory(msg);
        alert("הטקסט הועתק בהצלחה לוואטסאפ!");
    }).catch(() => { alert("שגיאה בהעתקה"); });
}

function openWhatsAppDirect() {
    buildMessage().then(msg => {
        saveToHistory(msg);
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
    });
}

function saveDraft() {
    const lectureItems = [];
    document.querySelectorAll('.lecture-item').forEach(i => lectureItems.push(i.value));
    const draft = {
        currentMode, currentLang,
        eventName: document.getElementById('eventName').value,
        eventType: document.getElementById('eventType').value,
        speaker: document.getElementById('speaker').value,
        description: document.getElementById('description').value,
        gregorianDate: document.getElementById('gregorianDate').value,
        eventTime: document.getElementById('eventTime').value,
        location: document.getElementById('location').value,
        price: document.getElementById('price').value,
        pricePerLecture: document.getElementById('pricePerLecture').value,
        pricePerSeries: document.getElementById('pricePerSeries').value,
        regLink: document.getElementById('regLink').value,
        lectureItems
    };
    localStorage.setItem('whatsapp_preset_draft', JSON.stringify(draft));
}

function loadDraft() {
    const data = localStorage.getItem('whatsapp_preset_draft');
    if (!data) return;
    const draft = JSON.parse(data);

    document.getElementById('eventName').value = draft.eventName || "";
    document.getElementById('eventType').value = draft.eventType || "";
    document.getElementById('speaker').value = draft.speaker || "";
    document.getElementById('description').value = draft.description || "";
    document.getElementById('gregorianDate').value = draft.gregorianDate || "";
    document.getElementById('eventTime').value = draft.eventTime || "";
    document.getElementById('location').value = draft.location || "";
    document.getElementById('price').value = draft.price || "";
    document.getElementById('pricePerLecture').value = draft.pricePerLecture || "";
    document.getElementById('pricePerSeries').value = draft.pricePerSeries || "";
    document.getElementById('regLink').value = draft.regLink || "";

    if (draft.lectureItems && draft.lectureItems.length > 0) {
        const container = document.getElementById('lectures-container');
        container.innerHTML = "";
        draft.lectureItems.forEach(val => addLectureInput(val));
    }
    
    if (draft.currentMode) setMode(draft.currentMode);
    if (draft.currentLang) setLanguage(draft.currentLang);
}

function saveToHistory(messageText) {
    let history = JSON.parse(localStorage.getItem('whatsapp_history') || "[]");
    const title = document.getElementById('eventName').value || "אירוע ללא שם";
    const timeStamp = new Date().toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'});
    history.unshift({ title: `${title} (${timeStamp})`, text: messageText });
    if (history.length > 5) history.pop();
    localStorage.setItem('whatsapp_history', JSON.stringify(history));
    updateHistoryList();
}

function updateHistoryList() {
    const history = JSON.parse(localStorage.getItem('whatsapp_history') || "[]");
    const container = document.getElementById('history-list');
    const section = document.getElementById('history-section');
    if (history.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    container.innerHTML = "";
    history.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `<span>${item.title}</span> <strong>📋 לחץ להעתקה חוזרת</strong>`;
        div.onclick = () => {
            navigator.clipboard.writeText(item.text);
            alert(`הודעת "${item.title}" הועתקה שוב בהצלחה!`);
        };
        container.appendChild(div);
    });
}


// פונקציה לניקוי כל השדות והטיוטה
function clearAllFields() {
    if (!confirm("האם אתה בטוח שברצונך למחוק את כל הנתונים בטופס?")) {
        return; // ביטול הפעולה אם המשתמש התחרט
    }

    // רשימת כל השדות הפשוטים לניקוי
    const fields = [
        'rawMailInput', 'eventName', 'eventType', 'speaker', 
        'description', 'location', 'price', 
        'pricePerLecture', 'pricePerSeries', 'regLink'
    ];
    
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    // איפוס התאריך להיום
    const dateInput = document.getElementById('gregorianDate');
    if (dateInput) {
        dateInput.valueAsDate = new Date();
    }

    // איפוס השעה לברירת מחדל ריקה
    const timeInput = document.getElementById('eventTime');
    if (timeInput) timeInput.value = "";

    // אם אנחנו במצב סדרה, ננקה את רשימת ההרצאות ונחזיר 2 שדות ריקים
    const container = document.getElementById('lectures-container');
    if (container) {
        container.innerHTML = "";
        if (currentMode === 'series') {
            addLectureInput();
            addLectureInput();
        }
    }

    // מחיקת הטיוטה מהזיכרון המקומי
    localStorage.removeItem('whatsapp_preset_draft');

    // עדכון מיידי של התצוגה המקדימה החיה
    updateLivePreview();
}

window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('input, textarea').forEach(el => {
        if(el.id !== 'rawMailInput' && el.id !== 'password-input') {
            el.addEventListener('input', saveDraft);
        }
    });
    if (!document.getElementById('gregorianDate').value) {
        document.getElementById('gregorianDate').valueAsDate = new Date();
    }
    updateLivePreview();
});