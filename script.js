let currentMode = 'single';
let cachedHebrewDates = {}; // מטמון מקומי לחסכון בפניות ל-API בתצוגה המקדימה החיה

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
        loadDraft(); // טעינת טיוטה אחרונה אם קיימת
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

// כפתורי בחירה מהירה
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

// פונקציית חילוץ מותאמת אישית וחכמה (ללא נגיעה בשדה הקישור)
function parseMailContent() {
    const rawText = document.getElementById('rawMailInput').value.trim();
    if (!rawText) {
        alert("אנא הדבק טקסט בתיבה תחילה.");
        return;
    }

    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 3) {
        alert("הטקסט קצר מדי. המבנה דורש לפחות 3 שורות (שם, סוג, ופרטי זמן).");
        return;
    }

    // שורה 1: שם
    document.getElementById('eventName').value = lines[0];

    // זיהוי סדרה
    let isSeries = rawText.includes("סדרת הרצאות") || rawText.includes("סדרת מפגשים") || rawText.includes("סדרה חדשה") || rawText.includes("מועדון הקריאה");
    setMode(isSeries ? 'series' : 'single');

    // שורה 2: סוג ומרצה
    const line2 = lines[1];
    let eventType = line2;
    let speaker = "";

    if (line2.includes(" עם ")) {
        const parts = line2.split(" עם ");
        eventType = parts[0].trim();
        speaker = parts[1].trim();
    } else if (line2.includes("עם ")) {
        const parts = line2.split("עם ");
        if(parts[0].trim() !== "") eventType = parts[0].trim();
        speaker = parts[1].trim();
    }

    document.getElementById('eventType').value = eventType;
    document.getElementById('speaker').value = speaker;

    // שורה 3: זמן ומיקום
    const line3 = lines[2];
    
    const timeRegex = /(\d{1,2}:\d{2})/;
    const foundTime = line3.match(timeRegex);
    if (foundTime) {
        document.getElementById('eventTime').value = foundTime[1];
    }

    const dateRegex = /(\d{1,2}\.\d{1,2})/;
    const foundDate = line3.match(dateRegex);
    if (foundDate) {
        const parts = foundDate[1].split('.');
        const currentYear = new Date().getFullYear();
        const formattedMonth = parts[1].padStart(2, '0');
        const formattedDay = parts[0].padStart(2, '0');
        document.getElementById('gregorianDate').value = `${currentYear}-${formattedMonth}-${formattedDay}`;
    }

    // מיקום
    if (line3.toLowerCase().includes("zoom") || line3.includes("זום") || line3.includes("מקוון")) {
        document.getElementById('location').value = ""; 
    } else {
        let locationCandidate = "";
        if (line3.includes("בשעה")) {
            const afterTime = line3.split(/בשעה \d{1,2}:\d{2}/);
            if (afterTime.length > 1) locationCandidate = afterTime[1].replace(/[,ב]/g, "").trim();
        }
        if (!locationCandidate && line3.includes(",")) {
            const commaParts = line3.split(",");
            locationCandidate = commaParts[commaParts.length - 1].trim();
        }
        document.getElementById('location').value = locationCandidate;
    }

    // תיאור ומחירים
    let descriptionLines = [];
    let foundLectures = [];
    let startCollectingLectures = false;
    let isFree = false;
    let price1 = "";
    let price2 = "";

    for (let i = 3; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes("ההשתתפות בהרצאה חופשית") || line.includes("בהרשמה מראש") || line.includes("חופשית")) {
            isFree = true;
        }

        if (line.includes("מחיר") || line.includes("עלות") || line.includes("ש\"ח")) {
            const numbers = line.match(/\d+/g);
            if (numbers && numbers.length >= 2) {
                price1 = numbers[0];
                price2 = numbers[1];
            } else if (numbers && numbers.length == 1) {
                price1 = numbers[0];
            }
        }

        if (line.includes("הרצאות הסדרה:") || line.includes("תכנית הסדרה:") || line.includes("המפגשים:")) {
            startCollectingLectures = true;
            continue;
        }

        if (startCollectingLectures) {
            if (line.includes("מחיר") || line.includes("להרשמה") || line.includes("http")) {
                startCollectingLectures = false;
            } else {
                foundLectures.push(line);
            }
        } else {
            if (line.length > 12 && !line.includes("מחיר") && !line.includes("ש\"ח") && !line.includes("http")) {
                descriptionLines.push(line);
            }
        }
    }

    if (isFree) {
        if (isSeries) {
            document.getElementById('pricePerLecture').value = "0";
            document.getElementById('pricePerSeries').value = "0";
        } else {
            document.getElementById('price').value = "0";
        }
    } else {
        if (isSeries) {
            document.getElementById('pricePerLecture').value = price1 || "30";
            document.getElementById('pricePerSeries').value = price2 || "100";
        } else {
            document.getElementById('price').value = price1 || "";
        }
    }

    if (descriptionLines.length > 0) {
        document.getElementById('description').value = descriptionLines.join('\n\n');
    }

    if (isSeries && foundLectures.length > 0) {
        const container = document.getElementById('lectures-container');
        container.innerHTML = "";
        foundLectures.forEach(lectureText => {
            addLectureInput(lectureText);
        });
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
    } catch (e) {
        return "";
    }
}

// בניית גוף ההודעה הגנרי
async function buildMessage() {
    const eventName = document.getElementById('eventName').value || "[שם האירוע]";
    const eventType = document.getElementById('eventType').value || "[סוג האירוע]";
    const speakerVal = document.getElementById('speaker').value.trim();
    const description = document.getElementById('description').value;
    const dateVal = document.getElementById('gregorianDate').value;
    const timeVal = document.getElementById('eventTime').value || "--:--";
    const locationVal = document.getElementById('location').value.trim();
    const regLink = document.getElementById('regLink').value || "[קישור]";

    let dayOfWeek = "[יום]";
    let formattedCurrentDate = "[תאריך]";
    let hebrewDate = "";

    if (dateVal) {
        const dateObj = new Date(dateVal);
        const daysOfWeek = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
        dayOfWeek = daysOfWeek[dateObj.getDay()];
        formattedCurrentDate = `${dateObj.getDate()}.${dateObj.getMonth() + 1}`;
        hebrewDate = await getHebrewDate(dateVal);
    }

    // כותרת מעוצבת כציטוט (עם > בתחילה) ושומרת על ההדגשה
    let boldHeader = `> *${eventName} | ${eventType}`;
    if (speakerVal) {
        let speakerText = currentMode === 'series' && speakerVal.includes(',') 
            ? speakerVal.split(',').map(s => s.trim()).filter(s => s).join(' & ') 
            : speakerVal;
        boldHeader += ` עם ${speakerText}`;
    }
    boldHeader += `*`;

    let message = `${boldHeader}\n\n`;
    if (description) message += `${description}\n\n`;

    if (currentMode === 'single') {
        const priceVal = document.getElementById('price').value.trim();
        let locationLine = locationVal ? `• *מיקום:* ${locationVal}\n` : "";
        let priceLine = (!priceVal || priceVal == "0") ? "• *עלות:* ההשתתפות בהרצאה חופשית, בהרשמה מראש." : `• *עלות:* ${priceVal}₪`;

        message += `📅 *מתי ואיפה?*\n`;
        message += `• *יום:* יום ${dayOfWeek}${hebrewDate ? ', ' + hebrewDate : ''}, ${formattedCurrentDate}\n`;
        message += `• *שעה:* ${timeVal}\n`;
        if (locationLine) message += locationLine;
        message += `${priceLine}\n\n`;
    } else {
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
        message += `• *תאריך תחילת האירוע:* יום ${dayOfWeek}${hebrewDate ? ', ' + hebrewDate : ''}, ${formattedCurrentDate}\n`;
        message += `• *יום בשבוע:* ההרצאה תתרחש בכל יום ${dayOfWeek}\n`;
        message += `• *שעה:* ${timeVal}\n`;
        message += `• *מחיר:* ${priceContent}\n`;
        if (locationVal) message += `• *מיקום:* ${locationVal}\n`;
        message += `\n`;
    }

    message += `*לפרטים נוספים והרשמה👇*\n`;
    message += `${regLink}`;
    return message;
}

// עדכון תצוגה מקדימה חיה
async function updateLivePreview() {
    const previewContent = await buildMessage();
    let htmlPreview = previewContent
        .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
        // הפיכת ה-> לעיצוב ויזואלי של פס אפור ימני כמו ב-IMG_3379.jpg
        .replace(/^>\s*(.*)$/gm, "<div style='border-right: 3.5px solid #8696a0; padding-right: 10px; margin: 6px 0; color: #e9edef; font-style: normal;'>$1</div>")
        .replace(/\n/g, "<br>");
    document.getElementById('live-preview-content').innerHTML = htmlPreview;
}

// שמירה והעתקה + הכנסה להיסטוריה
async function generateAndCopy() {
    const msg = await buildMessage();
    navigator.clipboard.writeText(msg).then(() => {
        saveToHistory(msg);
        alert("הטקסט הועתק בהצלחה לוואטסאפ!");
    }).catch(() => { alert("שגיאה בהעתקה"); });
}

// פתיחה ישירה בוואטסאפ
async function openWhatsAppDirect() {
    const msg = await buildMessage();
    saveToHistory(msg);
    const encoded = encodeURIComponent(msg);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
}

// שמירת טיוטה (Draft) ב-localStorage
function saveDraft() {
    const lectureItems = [];
    document.querySelectorAll('.lecture-item').forEach(i => lectureItems.push(i.value));

    const draft = {
        currentMode,
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
}

// ניהול היסטוריית הודעות
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
    
    if (history.length === 0) {
        section.style.display = 'none';
        return;
    }
    
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

// האזנה לשינויים לשמירה אוטומטית
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