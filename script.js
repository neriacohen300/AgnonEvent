let currentMode = 'single';
let currentLang = 'he'; 
let cachedHebrewDates = {}; 
let currentEditingId = null;
let userPlainTextPassword = ""; // שמירת הסיסמה המקורית עבור מפתח ההצפנה

// 🛑 !!! הדבק כאן את כתובת ה-URL שהעתקת מ-Firebase !!! 🛑
const FIREBASE_DB_URL = "https://agnon-reminders-default-rtdb.firebaseio.com/"; 

// המרת סיסמה ל-SHA256 לצורך בדיקת הכניסה למסך הנעילה
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// מנגנון ייצור מפתח הצפנה סימטרי מבוסס סיסמת המשתמש (AES-GCM 256)
async function getCryptoKey(password) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode("AgnonHouseSecureSalt2026!"), // סולט קבוע מראש
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

// פונקציית הצפנת טקסט לשרת
async function encryptData(text, password) {
    try {
        const cryptoKey = await getCryptoKey(password);
        const enc = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12)); // וקטור אתחול
        const encrypted = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            cryptoKey,
            enc.encode(text)
        );
        
        // שילוב ה-IV והתוכן המוצפן למחרוזת בסיס אחת
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encrypted), iv.length);
        
        return btoa(String.fromCharCode.apply(null, combined));
    } catch(e) {
        console.error("Encryption error", e);
        return "";
    }
}

// פונקציית פענוח טקסט מהשרת
async function decryptData(cipherTextBase64, password) {
    try {
        const cryptoKey = await getCryptoKey(password);
        const combined = new Uint8Array(atob(cipherTextBase64).split("").map(c => c.charCodeAt(0)));
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);
        
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            cryptoKey,
            data
        );
        return new TextDecoder().decode(decrypted);
    } catch(e) {
        // אם הסיסמה שונתה או שגויה, הפענוח ייכשל
        return "[מידע נעול או סיסמה לא תקינה]";
    }
}

const CORRECT_PASSWORD_HASH = "fd573849d78eb68e5bced78f7d88ffabeef179942d2b3f62c5996c43b0e14191";

async function checkPassword() {
    const input = document.getElementById('password-input').value;
    const hashedInput = await sha256(input);
    
    if (hashedInput === CORRECT_PASSWORD_HASH) {
        userPlainTextPassword = input; // שמירת הסיסמה לפענוח והצפנה בענן
        document.getElementById('lock-screen').style.display = 'none';
        sessionStorage.setItem('authenticated', 'true');
        sessionStorage.setItem('user_token', input); // שמירה זמנית לטאב הנוכחי
        loadDraft(); 
        syncWithFirebase(); // משיכה ראשונית של המאגר מהענן
    } else {
        document.getElementById('error-message').style.display = 'block';
    }
}

// בדיקת התחברות קיימת
if (sessionStorage.getItem('authenticated') === 'true') {
    userPlainTextPassword = sessionStorage.getItem('user_token');
    if(document.getElementById('lock-screen')) {
        document.getElementById('lock-screen').style.display = 'none';
    }
    window.addEventListener('DOMContentLoaded', () => {
        loadDraft();
        syncWithFirebase();
    });
}

document.getElementById('password-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') checkPassword();
});

// התאמת הרחבה אוטומטית לתיבות טקסט (Dynamic Textareas לאייפון)
function initAutoExpand() {
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(textarea => {
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });
        // הפעלה ראשונית אם קיים תוכן
        if(textarea.value) {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        }
    });
}

// ניהול שפות ומצבים
function setLanguage(lang) {
    currentLang = lang;
    document.getElementById('btn-lang-he').classList.toggle('active', lang === 'he');
    document.getElementById('btn-lang-en').classList.toggle('active', lang === 'en');
    document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
    saveDraft();
    updateLivePreview();
}

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

// פונקציית חילוץ טקסט מהמייל
function parseMailContent() {
    const rawText = document.getElementById('rawMailInput').value.trim();
    if (!rawText) { alert("אנא הדבק טקסט בתיבה תחילה."); return; }

    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 3) { alert("הטקסט קצר מדי."); return; }

    const isEnglishText = /[a-zA-Z]/.test(lines[0]);
    setLanguage(isEnglishText ? 'en' : 'he');

    document.getElementById('eventName').value = lines[0];
    const line2 = lines[1];
    let eventType = line2;
    let speaker = "";
    const splitWords = currentLang === 'en' ? [" with ", "by "] : [" עם ", "עם "];

    for (let word of splitWords) {
        if (line2.toLowerCase().includes(word)) {
            const parts = line2.split(new RegExp(word, "i"));
            eventType = parts[0].trim();
            speaker = parts[1].trim();
            break;
        }
    }
    document.getElementById('eventType').value = eventType;
    document.getElementById('speaker').value = speaker;

    const line3 = lines[2];
    const timeRegex = /(\d{1,2}:\d{2})\s*(?:AM|PM|am|pm)?/;
    const foundTime = line3.match(timeRegex);
    if (foundTime) {
        if (currentLang === 'en' && line3.includes("Israel time")) {
            const israelTimeMatch = line3.match(/(\d{1,2}:\d{2})\s*(?:PM|AM)?\s*Israel/i);
            document.getElementById('eventTime').value = israelTimeMatch ? israelTimeMatch[1] : foundTime[1];
        } else {
            document.getElementById('eventTime').value = foundTime[1];
        }
    }

    if (currentLang === 'he') {
        const dateRegex = /(\d{1,2}\.\d{1,2})/;
        const foundDate = line3.match(dateRegex);
        if (foundDate) {
            const parts = foundDate[1].split('.');
            const currentYear = new Date().getFullYear();
            document.getElementById('gregorianDate').value = `${currentYear}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
    } else {
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        let foundDateStr = "";
        for (let m of months) {
            if (line3.includes(m)) {
                const match = line3.match(new RegExp(`${m}\\s+\\d{1,2},\\s*\\d{4}`, "i"));
                if (match) { foundDateStr = match[0]; break; }
            }
        }
        if (foundDateStr) {
            const d = new Date(foundDateStr);
            if (!isNaN(d.getTime())) document.getElementById('gregorianDate').value = d.toISOString().split('T')[0];
        }
    }

    if (line3.toLowerCase().includes("zoom") || line3.includes("זום") || line3.includes("מקוון")) {
        document.getElementById('location').value = ""; 
    } else {
        let locationCandidate = "";
        if (currentLang === 'he' && line3.includes("בשעה")) {
            const afterTime = line3.split(/בשעה \d{1,2}:\d{2}/);
            if (afterTime.length > 1) locationCandidate = afterTime[1].replace(/[,ב]/g, "").trim();
        } else if (line3.toLowerCase().includes("at ")) {
            const parts = line3.split(/at /i);
            locationCandidate = parts[parts.length - 1].trim();
        }
        document.getElementById('location').value = locationCandidate;
    }

    let descriptionLines = [];
    let isFree = false;
    let price1 = "";

    for (let i = 3; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes("free") || line.includes("חופשית") || line.includes("חופשי")) isFree = true;
        if (line.includes("מחיר") || line.includes("עלות") || line.includes("ש\"ח") || line.toLowerCase().includes("price") || line.toLowerCase().includes("nis")) {
            const numbers = line.match(/\d+/g);
            if (numbers) price1 = numbers[0];
        }
        if (line.length > 15 && !line.includes("http") && !line.toLowerCase().includes("price") && !line.includes("מחיר")) {
            descriptionLines.push(line);
        }
    }

    document.getElementById('price').value = isFree ? "0" : (price1 || "");
    if (descriptionLines.length > 0) document.getElementById('description').value = descriptionLines.join('\n\n');

    saveDraft();
    updateLivePreview();
    setTimeout(initAutoExpand, 100); // רענון גבהים לאחר הכנסת הטקסט המאולץ
    alert("הפרטים חולצו בהצלחה!");
}

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

async function buildMessage() {
    const eventName = document.getElementById('eventName').value || (currentLang === 'he' ? "[שם האירוע]" : "[Event Name]");
    const eventType = document.getElementById('eventType').value || (currentLang === 'he' ? "[סוג האירוע]" : "[Event Type]");
    const speakerVal = document.getElementById('speaker').value.trim();
    const description = document.getElementById('description').value;
    const dateVal = document.getElementById('gregorianDate').value;
    const timeVal = document.getElementById('eventTime').value || "--:--";
    const locationVal = document.getElementById('location').value.trim();
    const regLink = document.getElementById('regLink').value || "[Link]";

    function formatTimeEnglish(timeStr) {
        if (!timeStr || timeStr === "--:--" || !timeStr.includes(':')) return "--:--";
        const parts = timeStr.split(':');
        let hours = parseInt(parts[0], 10);
        let minutes = parts[1];
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        return minutes === '00' ? `${hours} ${ampm}` : `${hours}:${minutes} ${ampm}`;
    }

    let dayOfWeek = currentLang === 'he' ? "[יום]" : "[Day]";
    let formattedDate = currentLang === 'he' ? "[תאריך]" : "[Date]";
    let hebrewDate = "";
    let isTomorrow = false; 

    if (dateVal) {
        const dateObj = new Date(dateVal);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        
        if (dateObj.getFullYear() === tomorrow.getFullYear() && dateObj.getMonth() === tomorrow.getMonth() && dateObj.getDate() === tomorrow.getDate()) {
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

    let boldHeader = `> *${eventName} | ${eventType}`;
    if (speakerVal) boldHeader += (currentLang === 'he' ? " עם " : " with ") + speakerVal;
    boldHeader += `*`;

    let message = `${boldHeader}\n`;
    if (isTomorrow) message += currentLang === 'he' ? `*מחר!!!*\n\n` : `*Tomorrow!!!*\n\n`;
    if (description) message += `${description}\n\n`;

    const isZoom = !locationVal || locationVal.toLowerCase().includes('zoom') || locationVal.includes('זום') || locationVal.includes('מקוון');

    if (currentLang === 'he') {
        if (currentMode === 'single') {
            const priceVal = document.getElementById('price').value.trim();
            let priceLine = (!priceVal || priceVal == "0") ? "• *עלות:* ההשתתפות בהרצאה חופשית, בהרשמה מראש." : `• *עלות:* ${priceVal}₪`;
            message += `📅 *מתי ואיפה?*\n• *תאריך:* יום ${dayOfWeek}${hebrewDate ? ', ' + hebrewDate : ''}, ${formattedDate}\n• *שעה:* ${timeVal}\n• *מיקום:* ${isZoom ? 'בזום' : locationVal}\n${priceLine}\n\n`;
        } else {
            const priceLecture = document.getElementById('pricePerLecture').value.trim();
            const priceSeries = document.getElementById('pricePerSeries').value.trim();
            let priceContent = (!priceLecture || priceLecture == "0") && (!priceSeries || priceSeries == "0") ? "ההשתתפות חופשית, בהרשמה מראש." : `${priceLecture} ש"ח להרצאה בודדת / ${priceSeries} ש"ח לכל הסדרה`;
            message += `📖 *הרצאות הכלולות בסדרה:*\n`;
            let hasLectures = false;
            document.querySelectorAll('.lecture-item').forEach(input => {
                const val = input.value.trim();
                if (val) { message += `- ${val}\n`; hasLectures = true; }
            });
            if (!hasLectures) message += "- [רשימת הרצאות]\n";
            message += `\n📅 *פרטי המפגשים:*\n• *תאריך תחילת האירוע:* יום ${dayOfWeek}${hebrewDate ? ', ' + hebrewDate : ''}, ${formattedDate}\n• *יום בשבוע:* בכל יום ${dayOfWeek}\n• *שעה:* ${timeVal}\n• *מיקום:* ${isZoom ? 'בזום' : locationVal}\n• *עלות:* ${priceContent}\n\n`;
        }
        message += `*לפרטים נוספים והרשמה👇*\n`;
    } else {
        const englishTime = formatTimeEnglish(timeVal);
        if (currentMode === 'single') {
            const priceVal = document.getElementById('price').value.trim();
            let priceLine = (!priceVal || priceVal == "0") ? "• *Admission:* Free admission, registration required." : `• *Price:* ${priceVal} NIS`;
            message += `📅 *When and Where?*\n• *Date:* ${dayOfWeek}, ${formattedDate}\n• *Time:* ${englishTime}\n• *Where:* ${isZoom ? 'Online via Zoom' : locationVal}\n${priceLine}\n\n`;
        } else {
            const priceLecture = document.getElementById('pricePerLecture').value.trim();
            const priceSeries = document.getElementById('pricePerSeries').value.trim();
            let priceContent = (!priceLecture || priceLecture == "0") && (!priceSeries || priceSeries == "0") ? "Free admission, registration required." : `${priceLecture} NIS per lecture / ${priceSeries} NIS for the entire series`;
            message += `📖 *Lectures in the Series:*\n`;
            let hasLectures = false;
            document.querySelectorAll('.lecture-item').forEach(input => {
                const val = input.value.trim();
                if (val) { message += `- ${val}\n`; hasLectures = true; }
            });
            if (!hasLectures) message += "- [List of lectures]\n";
            message += `\n📅 *Event Details:*\n• *Start Date:* ${dayOfWeek}, ${formattedDate}\n• *Schedule:* Every ${dayOfWeek}\n• *Time:* ${englishTime}\n• *Where:* ${isZoom ? 'Online via Zoom' : locationVal}\n• *Price:* ${priceContent}\n\n`;
        }
        message += `For more details and registration👇\n`;
    }
    message += `${regLink}`;
    return message;
}

async function updateLivePreview() {
    const previewContent = await buildMessage();
    const previewDiv = document.getElementById('live-preview-content');
    
    if (currentLang === 'en') previewDiv.classList.add('preview-en');
    else previewDiv.classList.remove('preview-en');

    const borderSide = currentLang === 'en' ? 'border-left' : 'border-right';
    const paddingSide = currentLang === 'en' ? 'padding-left' : 'padding-right';
    const clearSide = currentLang === 'en' ? 'border-right: none; padding-right: 0;' : 'border-left: none; padding-left: 0;';

    let htmlPreview = previewContent
        .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
        .replace(/^>\s*(.*)$/gm, `<div style='${borderSide}: 3.5px solid #8696a0; ${paddingSide}: 10px; ${clearSide} margin: 6px 0; color: #aebac1; font-style: normal;'>$1</div>`)
        .replace(/\n/g, "<br>");
        
    previewDiv.innerHTML = htmlPreview;
}

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

// 📅 מערכת ניהול יומן מתקדמת - יוצרת התרעה יום לפני ויומיים לפני
function downloadCalendarFile() {
    const eventName = document.getElementById('eventName').value.trim() || "הרצאה חדשה";
    const dateVal = document.getElementById('gregorianDate').value;
    const timeVal = document.getElementById('eventTime').value || "19:00";
    const locationVal = document.getElementById('location').value.trim() || "זום / מקוון";
    const description = document.getElementById('description').value || "";
    const regLink = document.getElementById('regLink').value || "";

    if (!dateVal) {
        alert("אנא בחר תאריך תחילה על מנת לייצר תזכורת ביומן.");
        return;
    }

    // פורמט תאריך ליומן: YYYYMMDD
    const datePart = dateVal.replace(/-/g, "");
    // פורמט שעה ליומן: HHMMSS
    const timePart = timeVal.replace(/:/g, "") + "00";
    
    const startIso = `${datePart}T${timePart}`;
    
    // סיום האירוע כברירת מחדל שעה לאחר מכן
    let endHours = parseInt(timeVal.split(":")[0]) + 1;
    if (endHours > 23) endHours = 23;
    const endIso = `${datePart}T${String(endHours).padStart(2, '0')}${timeVal.split(":")[1]}00`;

    // בניית מבנה ה-ICS המלא כולל ה-VALARMs הנדרשים לאייפון
    const icsLines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Agnon House Reminders//HE",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        `UID:${Date.now()}@agnonhouse`,
        `DTSTAMP:${datePart}T000000`,
        `DTSTART:${startIso}`,
        `DTEND:${endIso}`,
        `SUMMARY:${eventName}`,
        `LOCATION:${locationVal}`,
        `DESCRIPTION:${description.replace(/\n/g, '\\n')} | הרשמה: ${regLink}`,
        
        // התראה 1: יום אחד לפני האירוע (P1D)
        "BEGIN:VALARM",
        "TRIGGER:-P1D",
        "ACTION:DISPLAY",
        `DESCRIPTION:תזכורת: שליחת נוסח וואטסאפ מחר לאירוע ${eventName}`,
        "END:VALARM",
        
        // התראה 2: יומיים לפני האירוע (P2D)
        "BEGIN:VALARM",
        "TRIGGER:-P2D",
        "ACTION:DISPLAY",
        `DESCRIPTION:תזכורת: שליחת נוסח וואטסאפ בעוד יומיים לאירוע ${eventName}`,
        "END:VALARM",
        
        "END:VEVENT",
        "END:VCALENDAR"
    ];

    const icsContent = icsLines.join("\r\n");
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${eventName.replace(/\s+/g, '_')}_reminder.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ☁️ סנכרון ישיר מול Firebase באמצעות REST API והצפנה מקומית
async function syncWithFirebase() {
    if (!FIREBASE_DB_URL || FIREBASE_DB_URL.includes("YOUR-PROJECT-ID")) return;
    try {
        const response = await fetch(`${FIREBASE_DB_URL}/lectures.json`);
        const data = await response.json();
        
        let savedLectures = [];
        if (data) {
            // הפיכת אובייקט ה-Firebase למערך ופענוח הנתונים המוצפנים שלו
            for (let key in data) {
                let item = data[key];
                // אם המידע מוצפן, נפענח אותו
                if (item.isEncrypted) {
                    const decryptedRaw = await decryptData(item.payload, userPlainTextPassword);
                    try {
                        let parsed = JSON.parse(decryptedRaw);
                        parsed.firebaseKey = key; // שמירת המפתח למחיקות/עדכונים
                        savedLectures.push(parsed);
                    } catch(err) {
                        // מקרה שבו הנתונים שייכים לפענוח סיסמה ישנה או לא מתאימה
                        savedLectures.push({
                            id: item.id || key,
                            title: "[מידע מאובטח נעול]",
                            updatedAt: "שגיאת פענוח",
                            isLocked: true
                        });
                    }
                } else {
                    item.firebaseKey = key;
                    savedLectures.push(item);
                }
            }
        }
        
        // שמירה לוקאלית זמנית כדי לא להעמיס פניות
        localStorage.setItem('whatsapp_saved_lectures', JSON.stringify(savedLectures));
        updateSavedLecturesList(savedLectures);
    } catch(e) {
        console.error("Firebase fetch error, loading from cache", e);
        const cached = JSON.parse(localStorage.getItem('whatsapp_saved_lectures') || "[]");
        updateSavedLecturesList(cached);
    }
}

async function saveCurrentLectureToList() {
    if (!FIREBASE_DB_URL || FIREBASE_DB_URL.includes("YOUR-PROJECT-ID")) {
        alert("שגיאה: הגדר קודם את כתובת ה-Firebase DB בראש קובץ ה-script.js");
        return;
    }

    const eventName = document.getElementById('eventName').value.trim() || "הרצאה ללא שם";
    const lectureItems = [];
    document.querySelectorAll('.lecture-item').forEach(i => lectureItems.push(i.value));
    
    const targetId = currentEditingId || Date.now().toString();
    
    const lectureData = {
        id: targetId,
        title: eventName,
        updatedAt: new Date().toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) + ' ' + new Date().toLocaleDateString('he-IL'),
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

    // הצפנת תוכן ההרצאה המלא לפני העלאתו לענן
    const jsonString = JSON.stringify(lectureData);
    const encryptedPayload = await encryptData(jsonString, userPlainTextPassword);
    
    const envelope = {
        id: targetId,
        isEncrypted: true,
        payload: encryptedPayload
    };

    try {
        let savedLectures = JSON.parse(localStorage.getItem('whatsapp_saved_lectures') || "[]");
        const existingItem = savedLectures.find(l => l.id === targetId);

        if (existingItem && existingItem.firebaseKey) {
            // עדכון רשומה קיימת בענן באמצעות PUT
            await fetch(`${FIREBASE_DB_URL}/lectures/${existingItem.firebaseKey}.json`, {
                method: 'PUT',
                body: JSON.stringify(envelope)
            });
        } else {
            // יצירת רשומה חדשה בענן באמצעות POST
            await fetch(`${FIREBASE_DB_URL}/lectures.json`, {
                method: 'POST',
                body: JSON.stringify(envelope)
            });
        }
        
        currentEditingId = targetId;
        alert("ההרצאה סונכרנה ונשמרה בהצלחה בענן המאובטח!");
        await syncWithFirebase(); // רענון
        updateSaveButtonText();
    } catch (e) {
        alert("שגיאה בסנכרון מול השרת");
    }
}

async function deleteLectureFromList(id, event) {
    if (event) event.stopPropagation();
    if (!confirm("האם אתה בטוח שברצונך למחוק הרצאה זו לצמיתות מהענן?")) return;

    let savedLectures = JSON.parse(localStorage.getItem('whatsapp_saved_lectures') || "[]");
    const item = savedLectures.find(l => l.id === id);

    if (item && item.firebaseKey) {
        try {
            // מחיקה מהענן באמצעות DELETE
            await fetch(`${FIREBASE_DB_URL}/lectures/${item.firebaseKey}.json`, {
                method: 'DELETE'
            });
            if (currentEditingId === id) {
                currentEditingId = null;
                updateSaveButtonText();
            }
            alert("ההרצאה נמחקה מהענן.");
            await syncWithFirebase();
        } catch(e) {
            alert("שגיאה במחיקה מהשרת");
        }
    }
}

function loadLectureFromList(id) {
    const savedLectures = JSON.parse(localStorage.getItem('whatsapp_saved_lectures') || "[]");
    const lecture = savedLectures.find(l => l.id === id);
    if (!lecture || lecture.isLocked) return;

    currentEditingId = lecture.id;

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
    syncWithFirebase();
    setTimeout(initAutoExpand, 100); // חישוב גבהים מחדש
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateSavedLecturesList(savedLectures = []) {
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
        
        if (currentEditingId === item.id) {
            div.style.border = "1.5px solid var(--accent)";
            div.style.background = "#1f2c34";
        }
        
        div.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="font-weight: bold; color: var(--text);">${item.title}</span>
                <span style="font-size: 11px; color: var(--text-muted);">${item.isLocked ? 'נעול' : 'עודכן: ' + item.updatedAt}</span>
            </div>
            <div style="display: flex; gap: 12px; align-items: center;">
                ${item.isLocked ? '🔒' : '<strong style="color: var(--accent); font-size: 12px;">✏️ ערוך</strong>'}
                <button type="button" onclick="deleteLectureFromList('${item.id}', event)" 
                    style="width: 28px !important; height: 28px !important; padding: 0 !important; margin: 0 !important; background: #ff453a !important; border-radius: 6px !important; display: flex !important; justify-content: center !important; align-items: center !important; font-size: 12px !important; min-width: 28px !important;">✕</button>
            </div>
        `;
        if(!item.isLocked) {
            div.onclick = () => loadLectureFromList(item.id);
        }
        container.appendChild(div);
    });
}

function updateSaveButtonText() {
    const btn = document.getElementById('btn-save-lecture');
    if (!btn) return;
    if (currentEditingId) {
        btn.innerHTML = "💾 עדכן אירוע בענן";
        btn.style.background = "var(--accent)"; 
    } else {
        btn.innerHTML = "💾 שמור אירוע בענן";
        btn.style.background = "#5856d6";
    }
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

function clearAllFields() {
    if (!confirm("האם אתה בטוח שברצונך למחוק את כל הנתונים בטופס?")) return;

    const fields = ['rawMailInput', 'eventName', 'eventType', 'speaker', 'description', 'location', 'price', 'pricePerLecture', 'pricePerSeries', 'regLink'];
    fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });

    document.getElementById('gregorianDate').valueAsDate = new Date();
    document.getElementById('eventTime').value = "";

    const container = document.getElementById('lectures-container');
    if (container) {
        container.innerHTML = "";
        if (currentMode === 'series') { addLectureInput(); addLectureInput(); }
    }

    localStorage.removeItem('whatsapp_preset_draft');
    updateLivePreview();
    currentEditingId = null;
    updateSaveButtonText();
    syncWithFirebase();
    setTimeout(initAutoExpand, 100);
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
    initAutoExpand(); // אתחול הרחבה אוטומטית לתיבות הטקסט
});