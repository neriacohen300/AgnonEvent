let currentMode = 'single';
let currentLang = 'he'; // שפת ברירת מחדל
let cachedHebrewDates = {}; 
let currentEditingId = null;

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
        updateSavedLecturesList();
    } else {
        document.getElementById('error-message').style.display = 'block';
    }
}

if (sessionStorage.getItem('authenticated') === 'true') {
    document.getElementById('lock-screen').style.display = 'none';
    window.addEventListener('DOMContentLoaded', () => {
        loadDraft();
        updateSavedLecturesList();
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
    
    // הפיכת הכיווניות של כל ממשק המשתמש
    document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
    
    // אם תרצה לתרגם את תוויות הממשק עצמן, תוכל לקרוא כאן לפונקציית תרגום (ראה סעיף 3 למטה)
    // updateUILabels();
    
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

    // פונקציית עזר להמרת שעה לפורמט AM/PM באנגלית
    function formatTimeEnglish(timeStr) {
        if (!timeStr || timeStr === "--:--" || !timeStr.includes(':')) return "--:--";
        const parts = timeStr.split(':');
        let hours = parseInt(parts[0], 10);
        let minutes = parts[1];
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // הפיכת 0 ל-12 עבור חצות
        
        // אם הדקות הן 00, נציג למשל 6 PM, אחרת נציג 6:30 PM
        return minutes === '00' ? `${hours} ${ampm}` : `${hours}:${minutes} ${ampm}`;
    }

    let dayOfWeek = currentLang === 'he' ? "[יום]" : "[Day]";
    let formattedDate = currentLang === 'he' ? "[תאריך]" : "[Date]";
    let hebrewDate = "";
    let isTomorrow = false; 

    if (dateVal) {
        const dateObj = new Date(dateVal);
        
        // חישוב התאריך של מחר
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        
        // בדיקה אם תאריך ההרצאה שווה לתאריך של מחר
        if (dateObj.getFullYear() === tomorrow.getFullYear() &&
            dateObj.getMonth() === tomorrow.getMonth() &&
            dateObj.getDate() === tomorrow.getDate()) {
            isTomorrow = true;
        }
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

    let message = `${boldHeader}\n`;
    
    if (isTomorrow) {
        message += currentLang === 'he' 
            ? `*מחר!!!*\n\n`
            : `*Tomorrow!!!*\n\n`;
    }

    if (description) message += `${description}\n\n`;

    // בדיקה אם מדובר באירוע בזום (ריק, או מכיל מילות מפתח)
    const isZoom = !locationVal || locationVal.toLowerCase().includes('zoom') || locationVal.includes('זום') || locationVal.includes('מקוון');

    if (currentLang === 'he') {
        // מבנה עברית
        if (currentMode === 'single') {
            const priceVal = document.getElementById('price').value.trim();
            let priceLine = (!priceVal || priceVal == "0") ? "• *עלות:* ההשתתפות בהרצאה חופשית, בהרשמה מראש." : `• *עלות:* ${priceVal}₪`;

            message += `📅 *מתי ואיפה?*\n`;
            message += `• *תאריך:* יום ${dayOfWeek}${hebrewDate ? ', ' + hebrewDate : ''}, ${formattedDate}\n`;
            message += `• *שעה:* ${timeVal}\n`;
            
            if (isZoom) {
                message += `• *מיקום:* בזום\n`;
            } else {
                message += `• *מיקום:* ${locationVal}\n`;
            }
            
            message += `${priceLine}\n\n`;
        } else {
            // סדרת הרצאות בעברית
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
            message += `• *תאריך תחילת האירוע:* ${dayOfWeek}${hebrewDate ? ', ' + hebrewDate : ''}, ${formattedDate}\n`;
            message += `• *יום בשבוע:* ההרצאה תתרחש בכל יום ${dayOfWeek}\n`;
            message += `• *שעה:* ${timeVal}\n`;
            
            if (isZoom) {
                message += `• *מיקום:* בזום\n`;
            } else {
                message += `• *מיקום:* ${locationVal}\n`;
            }
            
            message += `• *עלות:* ${priceContent}\n`;
            message += `\n`;
        }
        message += `*לפרטים נוספים והרשמה👇*\n`;
    } else {
        // מבנה אנגלי (LTR)
        const englishTime = formatTimeEnglish(timeVal);

        if (currentMode === 'single') {
            const priceVal = document.getElementById('price').value.trim();
            let priceLine = (!priceVal || priceVal == "0") ? "• *Admission:* Free admission, registration required." : `• *Price:* ${priceVal} NIS`;

            message += `📅 *When and Where?*\n`;
            message += `• *Date:* ${dayOfWeek}, ${formattedDate}\n`;
            message += `• *Time:* ${englishTime}\n`; // שימוש בשעה המומרת
            
            if (isZoom) {
                message += `• *Where:* Online via Zoom\n`;
            } else {
                message += `• *Location:* ${locationVal}\n`;
            }
            
            message += `${priceLine}\n\n`;
        } else {
            // סדרת הרצאות באנגלית
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
            message += `• *Time:* ${englishTime}\n`; // שימוש בשעה המומרת
            
            if (isZoom) {
                message += `• *Where:* Online via Zoom\n`;
            } else {
                message += `• *Location:* ${locationVal}\n`;
            }
            
            message += `• *Price:* ${priceContent}\n`;
            message += `\n`;
        }
        message += `For more details and registration👇\n`;
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
        alert("הטקסט הועתק בהצלחה לוואטסאפ!");
    }).catch(() => { alert("שגיאה בהעתקה"); });
}

function openWhatsAppDirect() {
    buildMessage().then(msg => {
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

    currentEditingId = null;
    updateSaveButtonText();
    updateSavedLecturesList();
}

// שמירה או עדכון של ההרצאה הנוכחית במאגר
function saveCurrentLectureToList() {
    const eventName = document.getElementById('eventName').value.trim() || "הרצאה ללא שם";
    const lectureItems = [];
    document.querySelectorAll('.lecture-item').forEach(i => lectureItems.push(i.value));
    
    let savedLectures = JSON.parse(localStorage.getItem('whatsapp_saved_lectures') || "[]");
    
    const lectureData = {
        id: currentEditingId || Date.now().toString(), // אם אנחנו בעריכה שומרים על ה-ID, אם חדש מייצרים אחד
        title: eventName,
        updatedAt: new Date().toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) + ' ' + new Date().toLocaleDateString('he-IL'),
        currentMode, 
        currentLang,
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

    if (currentEditingId) {
        // עדכון הרצאה קיימת במאגר
        const index = savedLectures.findIndex(l => l.id === currentEditingId);
        if (index !== -1) {
            savedLectures[index] = lectureData;
            alert("ההרצאה עודכנה בהצלחה במאגר!");
        } else {
            savedLectures.unshift(lectureData);
            alert("ההרצאה נשמרה כחדשה!");
        }
    } else {
        // שמירת הרצאה חדשה לגמרי
        savedLectures.unshift(lectureData);
        currentEditingId = lectureData.id; // מעכשיו הטופס נמצא במצב עריכה שלה
        alert("ההרצאה נשמרה בהצלחה במאגר!");
    }

    localStorage.setItem('whatsapp_saved_lectures', JSON.stringify(savedLectures));
    updateSavedLecturesList();
    updateSaveButtonText();
}



// טעינת הרצאה מהמאגר חזרה אל שדות הטופס
function loadLectureFromList(id) {
    const savedLectures = JSON.parse(localStorage.getItem('whatsapp_saved_lectures') || "[]");
    const lecture = savedLectures.find(l => l.id === id);
    if (!lecture) return;

    currentEditingId = lecture.id;

    // מילוי השדות
    document.getElementById('eventName').value = lecture.eventName || "";
    document.getElementById('eventType').value = lecture.eventType || "";
    document.getElementById('speaker').value = lecture.speaker || "";
    document.getElementById('description').value = lecture.description || "";
    document.getElementById('gregorianDate').value = lecture.gregorianDate || "";
    document.getElementById('eventTime').value = lecture.eventTime || "";
    document.getElementById('location').value = lecture.location || "";
    document.getElementById('price').value = lecture.price || "";
    document.getElementById('pricePerLecture').value = lecture.pricePerLecture || "";
    document.getElementById('pricePerSeries').value = lecture.pricePerSeries || "";
    document.getElementById('regLink').value = lecture.regLink || "";

    // טעינת רשימת הרצאות דינמית לסדרה במידה וקיימת
    if (lecture.lectureItems && lecture.lectureItems.length > 0) {
        const container = document.getElementById('lectures-container');
        container.innerHTML = "";
        lecture.lectureItems.forEach(val => addLectureInput(val));
    }
    
    if (lecture.currentMode) setMode(lecture.currentMode);
    if (lecture.currentLang) setLanguage(lecture.currentLang);

    saveDraft();
    updateLivePreview();
    updateSaveButtonText();
    updateSavedLecturesList(); // רינדור מחדש כדי להציג סימון ויזואלי לפריט האקטיבי
    
    window.scrollTo({ top: 0, behavior: 'smooth' }); // גלילה חלקה לראש העמוד לתחילת עבודה
}

// מחיקת הרצאה מהמאגר
function deleteLectureFromList(id, event) {
    if (event) event.stopPropagation(); // מניעת הפעלת אירוע הלחיצה על השורה כולה (טעינה)
    if (!confirm("האם אתה בטוח שברצונך למחוק הרצאה זו מהמאגר?")) return;

    let savedLectures = JSON.parse(localStorage.getItem('whatsapp_saved_lectures') || "[]");
    savedLectures = savedLectures.filter(l => l.id !== id);
    localStorage.setItem('whatsapp_saved_lectures', JSON.stringify(savedLectures));

    if (currentEditingId === id) {
        currentEditingId = null;
        updateSaveButtonText();
    }

    updateSavedLecturesList();
}


// הצגת רשימת ההרצאות השמורות בממשק
function updateSavedLecturesList() {
    const savedLectures = JSON.parse(localStorage.getItem('whatsapp_saved_lectures') || "[]");
    const container = document.getElementById('history-list');
    const section = document.getElementById('history-section');
    
    if (savedLectures.length === 0) { 
        section.style.display = 'none'; 
        return; 
    }
    
    section.style.display = 'block';
    container.innerHTML = "";
    
    savedLectures.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        
        // סימון בולט להרצאה שכרגע טעונה ונערכת בטופס
        if (currentEditingId === item.id) {
            div.style.border = "2px solid #007aff";
            div.style.background = "#eef7ff";
        }
        
        div.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="font-weight: bold; color: #1e293b;">${item.title}</span>
                <span style="font-size: 11px; color: #64748b;">עודכן: ${item.updatedAt}</span>
            </div>
            <div style="display: flex; gap: 12px; align-items: center;">
                <strong style="color: #007aff; font-size: 12px;">✏️ ערוך</strong>
                <button type="button" onclick="deleteLectureFromList('${item.id}', event)" 
                    style="width: 28px !important; height: 28px !important; padding: 0 !important; margin: 0 !important; background: #ff3b30 !important; border-radius: 6px !important; display: flex !important; justify-content: center !important; align-items: center !important; font-size: 12px !important; min-width: 28px !important;">✕</button>
            </div>
        `;
        div.onclick = () => loadLectureFromList(item.id);
        container.appendChild(div);
    });
}


function updateSaveButtonText() {
    const btn = document.getElementById('btn-save-lecture');
    if (!btn) return;
    if (currentEditingId) {
        btn.innerHTML = "💾 עדכן הרצאה שמורה";
        btn.style.background = "#007aff"; // שינוי צבע לכחול המאותת על מצב עריכה/עדכון
    } else {
        btn.innerHTML = "💾 שמור הרצאה למאגר";
        btn.style.background = "var(--accent)";
    }
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