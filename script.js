let currentMode = 'single';

// המרת סיסמה ל-SHA256
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// הגדרת ה-Hash של הסיסמה ("1234")
const CORRECT_PASSWORD_HASH = "fd573849d78eb68e5bced78f7d88ffabeef179942d2b3f62c5996c43b0e14191";

async function checkPassword() {
    const input = document.getElementById('password-input').value;
    const hashedInput = await sha256(input);
    
    if (hashedInput === CORRECT_PASSWORD_HASH) {
        document.getElementById('lock-screen').style.display = 'none';
        sessionStorage.setItem('authenticated', 'true');
    } else {
        document.getElementById('error-message').style.display = 'block';
    }
}

if (sessionStorage.getItem('authenticated') === 'true') {
    document.getElementById('lock-screen').style.display = 'none';
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
    
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.innerText = '✕';
    removeBtn.onclick = function() {
        row.remove();
        reindexLectures();
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

// פונקציית חילוץ מותאמת אישית וחכמה
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

    // שורה 1: תמיד שם ההרצאה / הסדרה
    document.getElementById('eventName').value = lines[0];

    // בדיקה ראשונית אם מדובר בסדרה לפי השורות הראשונות
    let isSeries = rawText.includes("סדרת הרצאות") || rawText.includes("סדרת מפגשים") || rawText.includes("סדרה חדשה");
    setMode(isSeries ? 'series' : 'single');

    // שורה 2: סוג ההרצאה, ואם יש "עם" -> חילוץ מרצה
    const line2 = lines[1];
    let eventType = line2;
    let speaker = "";

    if (line2.includes(" עם ")) {
        const parts = line2.split(" עם ");
        eventType = parts[0].trim();
        speaker = parts[1].trim();
    } else if (line2.includes("עם ")) {
        const parts = line2.split("עם ");
        if(parts[0].trim() !== "") {
            eventType = parts[0].trim();
        }
        speaker = parts[1].trim();
    }

    document.getElementById('eventType').value = eventType;
    document.getElementById('speaker').value = speaker;

    // שורה 3: תאריך, שעה ומיקום
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

    // זיהוי מיקום בשורה 3
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

    // שורה 4 והלאה: תיאור ומחירים
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
            if (line.length > 15 && !line.includes("מחיר") && !line.includes("ש\"ח") && !line.includes("http")) {
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

    alert("הפרטים חולצו בדיוק לפי הכללים החדשים! אנא ודא שהכל מדויק בשדות.");
}

// קבלת תאריך עברי
async function getHebrewDate(dateStr) {
    if (!dateStr) return "";
    try {
        const [year, month, day] = dateStr.split('-');
        const response = await fetch(`https://www.hebcal.com/converter?cfg=json&gy=${year}&gm=${month}&gd=${day}&g2h=1`);
        const data = await response.json();
        
        let hebParts = data.hebrew.split(' ');
        if (hebParts.length > 1) {
            hebParts.pop();
        }
        
        let hebrewDate = hebParts.join(' ');
        hebrewDate = hebrewDate.replace(/[\u0591-\u05C7]/g, '');
        return hebrewDate.replace(/׳/g, "'");
    } catch (e) {
        console.error("שגיאה בהבאת תאריך עברי", e);
        return "";
    }
}

// יצירה והעתקה של הודעת הוואטסאפ המעוצבת
async function generateAndCopy() {
    const eventName = document.getElementById('eventName').value;
    const eventType = document.getElementById('eventType').value;
    const speakerVal = document.getElementById('speaker').value.trim();
    const description = document.getElementById('description').value;
    const dateVal = document.getElementById('gregorianDate').value;
    const timeVal = document.getElementById('eventTime').value;
    const locationVal = document.getElementById('location').value.trim();
    const regLink = document.getElementById('regLink').value.trim();

    if (!dateVal) {
        alert("חובה לבחור תאריך");
        return;
    }

    const dateObj = new Date(dateVal);
    const daysOfWeek = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
    const dayOfWeek = daysOfWeek[dateObj.getDay()];
    
    const dayOfMonth = dateObj.getDate();
    const monthOfYear = dateObj.getMonth() + 1;
    const formattedCurrentDate = `${dayOfMonth}.${monthOfYear}`;

    const hebrewDate = await getHebrewDate(dateVal);

    // בניית גוש כותרת מודגש לחלוטין (שם, סוג, מרצה)
    let speakerText = speakerVal;
    if (currentMode === 'series' && speakerVal.includes(',')) {
        speakerText = speakerVal.split(',').map(s => s.trim()).filter(s => s).join(' & ');
    }
    
    let boldHeader = `*${eventName} | ${eventType}`;
    if (speakerText) {
        boldHeader += ` עם ${speakerText}`;
    }
    boldHeader += `*`; // סגירת ההדגשה לכל הגוש

    if (currentMode === 'single') {
        const priceVal = document.getElementById('price').value.trim();
        let locationLine = locationVal ? `• *מיקום:* ${locationVal}\n` : "";
        let priceLine = (!priceVal || priceVal == "0") ? "• *עלות:* ההשתתפות בהרצאה חופשית, בהרשמה מראש." : `• *עלות:* ${priceVal}₪`;

        let message = `${boldHeader}\n\n`;
        if (description) message += `${description}\n\n`;
        message += `📅 *מתי ואיפה?*\n`;
        message += `• *יום:* יום ${dayOfWeek}, ${hebrewDate}, ${formattedCurrentDate}\n`;
        message += `• *שעה:* ${timeVal}\n`;
        if (locationLine) message += locationLine;
        message += `${priceLine}\n\n`;
        message += `*לפרטים נוספים והרשמה👇*\n`;
        message += `${regLink}`;

        copyToClipboard(message);
    } else {
        const priceLecture = document.getElementById('pricePerLecture').value.trim();
        const priceSeries = document.getElementById('pricePerSeries').value.trim();
        
        let priceContent = "";
        if ((!priceLecture || priceLecture == "0") && (!priceSeries || priceSeries == "0")) {
            priceContent = "ההשתתפות חופשית, בהרשמה מראש.";
        } else {
            priceContent = `${priceLecture} ש"ח להרצאה בודדת / ${priceSeries} ש"ח לכל הסדרה`;
        }

        let message = `${boldHeader}\n\n`;
        if (description) message += `${description}\n\n`;

        message += `📖 *הרצאות הכלולות בסדרה:*\n`;
        const lectureInputs = document.querySelectorAll('.lecture-item');
        lectureInputs.forEach(input => {
            const val = input.value.trim();
            if (val) message += `- ${val}\n`;
        });
        message += `\n`;

        message += `📅 *פרטי המפגשים:*\n`;
        message += `• *תאריך תחילת האירוע:* יום ${dayOfWeek}, ${hebrewDate}, ${formattedCurrentDate}\n`;
        message += `• *יום בשבוע:* ההרצאה תתרחש בכל יום ${dayOfWeek}\n`;
        message += `• *שעה:* ${timeVal}\n`;
        message += `• *מחיר:* ${priceContent}\n`;
        if (locationVal) {
            message += `• *מיקום:* ${locationVal}\n`;
        }
        message += `\n`;
        message += `*לפרטים נוספים והרשמה👇*\n`;
        message += `${regLink}`;

        copyToClipboard(message);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert("הטקסט הועתק בהצלחה לוואטסאפ!");
    }).catch(err => {
        alert("שגיאה בהעתקה, נסה שוב");
    });
}

document.getElementById('gregorianDate').valueAsDate = new Date();