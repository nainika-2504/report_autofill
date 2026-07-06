chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "FILL_LAB_DATA") {
        runDynamicAutofill(request.data, false)
            .then((result) => sendResponse({ status: "success", details: result }))
            .catch(err => {
                console.error(err);
                sendResponse({ status: "error", message: err.message });
            });
        return true; 
    }
});

async function runDynamicAutofill(pdfText, silent = false) {
    if (!silent) {
        console.log("Starting Explicit Dynamic 'Screen-Driven' AutoFill...");
    }
    
    const results = [];
    const normalizedPdfText = pdfText.toLowerCase();

    // Query both input fields and select dropdowns
    const fields = Array.from(document.querySelectorAll(
        'input[type="text"], input[type="number"], input:not([type]), input[type="tel"], select'
    ));
    
    // If not silent (explicit user trigger), clear all previous attempted/filled flags 
    // so we can re-attempt filling everything
    if (!silent) {
        for (const field of fields) {
            field.removeAttribute('data-autofill-attempted');
            field.removeAttribute('data-autofilled');
        }
    }

    let processedCount = 0;
    
    for (const field of fields) {
        // Skip fields that aren't empty (don't overwrite user changes or already filled data)
        if (!isFieldEmpty(field)) {
            continue;
        }

        // Skip fields we've already attempted in this page session to avoid infinite retries
        if (field.getAttribute('data-autofill-attempted') === 'true') {
            continue;
        }

        let labelText = null;
        
        // Only process fields that are inside a table row (test forms layout)
        const row = field.closest('tr');
        if (row) {
            const firstTd = row.querySelector('td, th');
            if (firstTd && firstTd.textContent) {
                labelText = firstTd.textContent;
            }
        } else {
            continue; 
        }
        
        if (!labelText) continue;

        let cleanLabel = labelText.trim();
        cleanLabel = cleanLabel.split('\n')[0].trim();
        
        if (cleanLabel.length < 2 || cleanLabel.length > 80) continue;

        let cleanLabelLower = cleanLabel.toLowerCase();
        // Clean spaces in spaced-out abbreviations like "l d l" -> "ldl" or "v l d l" -> "vldl"
        cleanLabelLower = cleanLabelLower.replace(/(?<=\b[a-z])\s+(?=[a-z]\b)/gi, '');
        // Clean spaces around slashes like "albumin / globulin" -> "albumin/globulin"
        cleanLabelLower = cleanLabelLower.replace(/\s*\/\s*/g, '/');

        const safeLabel = cleanLabelLower
            .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
            .replace(/\\\//g, '\\s*\\/\\s*'); // allow optional spaces around slash
        
        // Mark as attempted so we don't evaluate it again
        field.setAttribute('data-autofill-attempted', 'true');

        let match = null;
        let matchReason = '';

        // Attempt 1: Exact label match
        const regexFull = new RegExp(safeLabel + '[^0-9a-z]*?([0-9]+(?:[,.][0-9]+)?)', 'i');
        match = normalizedPdfText.match(regexFull);
        if (match) {
            matchReason = 'exact name';
        }

        // Attempt 2: Strip parentheses
        if (!match && cleanLabelLower.includes('(')) {
            const shortLabel = cleanLabelLower.split('(')[0].trim();
            if (shortLabel.length > 3) {
                const safeShortLabel = shortLabel.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const regexShort = new RegExp(safeShortLabel + '[^0-9a-z]*?([0-9]+(?:[,.][0-9]+)?)', 'i');
                match = normalizedPdfText.match(regexShort);
                if (match) matchReason = 'shortened name';
            }
        }

        // Attempt 3: Medical synonyms
        if (!match) {
            const commonAliases = [
                ['sgpt', 'alt', 'alanine'],
                ['sgot', 'ast', 'aspartate'],
                ['wbc', 'leucocyte', 'leukocyte', 'white blood cell', 'total leucocytes count'],
                ['rbc', 'erythrocyte', 'red blood cell', 'erythrocyte count'],
                ['hba1c', 'glycosylated hemoglobin', 'glycated hemoglobin'],
                ['ldl', 'cholesterol-ldl', 'ldl cholesterol', 'cholesterol-l d l', 'l d l'],
                ['hdl', 'cholesterol-hdl', 'hdl cholesterol'],
                ['vldl', 'cholesterol-vldl', 'cholesterol vldl', 'vldl cholesterol', 'cholesterol- v l d l', 'v l d l'],
                ['hb', 'hemoglobin'],
                ['direct bilirubin', 'conjugated', 'd. bilirubin', 'd.bilirubin'],
                ['indirect bilirubin', 'unconjugated', 'i.d. bilirubin', 'i.d.bilirubin'],
                ['albumin/globulin ratio', 'albumin / globulin ratio', 'a/g ratio', 'a / g ratio']
            ];

            for (const aliasGroup of commonAliases) {
                if (aliasGroup.some(alias => cleanLabelLower.includes(alias))) {
                    for (const alias of aliasGroup) {
                        const safeAlias = alias.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                        const regexAlias = new RegExp(safeAlias + '[^0-9a-z]*?([0-9]+(?:[,.][0-9]+)?)', 'i');
                        match = normalizedPdfText.match(regexAlias);
                        if (match) {
                            matchReason = `alternate name "${alias}"`;
                            break;
                        }
                    }
                }
                if (match) break;
            }
        }

        const isSelect = field.tagName.toLowerCase() === 'select';

        if (isSelect) {
            // ── DROPDOWN SELECT LOGIC ──
            const options = Array.from(field.options).filter(opt => opt.value !== "");
            let bestOption = null;
            let selectMatchReason = '';

            const labelPos = normalizedPdfText.indexOf(cleanLabelLower);
            if (labelPos !== -1) {
                // Examine text following the test name in the PDF
                const textAfterLabel = normalizedPdfText.substring(labelPos + cleanLabelLower.length, labelPos + cleanLabelLower.length + 150);
                
                let maxOverlap = 0;
                for (const option of options) {
                    const optionTextLower = option.textContent.trim().toLowerCase();
                    const optionValueLower = option.value.trim().toLowerCase();

                    if (textAfterLabel.includes(optionTextLower) && optionTextLower.length > maxOverlap) {
                        bestOption = option;
                        maxOverlap = optionTextLower.length;
                        selectMatchReason = `exact match "${option.textContent}"`;
                    } else if (optionValueLower && textAfterLabel.includes(optionValueLower) && optionValueLower.length > maxOverlap) {
                        bestOption = option;
                        maxOverlap = optionValueLower.length;
                        selectMatchReason = `value match "${option.value}"`;
                    }
                }

                // Fallback word matching
                if (!bestOption) {
                    for (const option of options) {
                        const words = option.textContent.trim().toLowerCase().split(/\s+/).filter(w => w.length > 3);
                        if (words.length > 0 && words.every(word => textAfterLabel.includes(word))) {
                            bestOption = option;
                            selectMatchReason = `fuzzy match "${option.textContent}"`;
                            break;
                        }
                    }
                }
            }

            if (bestOption) {
                field.value = bestOption.value;
                field.dispatchEvent(new Event('change', { bubbles: true }));
                field.setAttribute('data-autofilled', 'true');
                processedCount++;

                results.push({
                    label: cleanLabel,
                    value: bestOption.textContent,
                    status: 'filled',
                    reason: `Selected dropdown via ${selectMatchReason}`
                });
                console.log(`[AutoFill] ✅ '${cleanLabel}' → Selected: '${bestOption.textContent}'`);
            } else {
                results.push({
                    label: cleanLabel,
                    value: null,
                    status: 'missed',
                    reason: 'Could not match dropdown options'
                });
            }
        } else {
            // ── TEXT / NUMBER INPUT LOGIC ──
            if (match && match[1]) {
                const value = match[1];

                // Range validation — if value is outside a plausible range, warn
                const rangeWarning = checkRange(cleanLabelLower, parseFloat(value.replace(',', '')));
                
                // Fill the input
                field.focus();
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                if (nativeInputValueSetter) {
                    nativeInputValueSetter.call(field, value);
                } else {
                    field.value = value;
                }
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
                field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                field.blur();
                field.setAttribute('data-autofilled', 'true');
                processedCount++;

                if (rangeWarning) {
                    results.push({ 
                        label: cleanLabel, 
                        value, 
                        status: 'warning', 
                        reason: `Filled as "${value}" — but please double-check, value seems unusual` 
                    });
                } else {
                    results.push({ 
                        label: cleanLabel, 
                        value, 
                        status: 'filled', 
                        reason: `Found using ${matchReason}` 
                    });
                }

                console.log(`[AutoFill] ✅ '${cleanLabel}' → ${value} (via ${matchReason})`);
            } else {
                results.push({ 
                    label: cleanLabel, 
                    value: null, 
                    status: 'missed', 
                    reason: 'Not found in the PDF' 
                });
                console.log(`[AutoFill] ❌ Could not fill: '${cleanLabel}'`);
            }
        }
    }
    
    return results;
}

// Check if a field is empty
function isFieldEmpty(field) {
    if (field.tagName.toLowerCase() === 'select') {
        return field.value === "" || field.selectedIndex <= 0;
    }
    return field.value === "";
}

// Range check — returns a warning string if value is outside expected medical range
function checkRange(labelLower, num) {
    if (isNaN(num)) return null;
    const ranges = {
        'hemoglobin': [4, 20],
        'cholesterol': [50, 450],
        'triglycerides': [30, 2000],
        'glucose': [20, 700],
        'creatinine': [0.1, 20],
        'urea': [5, 300],
        'sodium': [100, 180],
        'potassium': [1, 10],
        'bilirubin': [0, 30],
        'albumin': [1, 6],
        'platelet': [10, 2000]
    };
    for (const [key, [min, max]] of Object.entries(ranges)) {
        if (labelLower.includes(key)) {
            if (num < min || num > max) return `${num} is outside normal range [${min}–${max}]`;
        }
    }
    return null;
}

// ── BACKGROUND AUTO-REFILL SESSIONS ────────────────────────────────────────

function verifyPatientSession(patientInfo) {
    if (!patientInfo) return false;
    
    const pageText = document.body.innerText.toLowerCase();
    
    // Check barcodes
    if (patientInfo.barcodes && patientInfo.barcodes.length > 0) {
        for (const barcode of patientInfo.barcodes) {
            if (pageText.includes(barcode.toLowerCase())) {
                return true;
            }
        }
    }
    
    // Check patient name parts
    if (patientInfo.name) {
        const nameParts = patientInfo.name.toLowerCase()
            .replace(/^(mr|mrs|ms|dr|master|baby)\.?\s+/g, '') // remove prefixes
            .split(/[\s.]+/)
            .filter(part => part.length > 2); // only parts longer than 2 characters
            
        for (const part of nameParts) {
            if (pageText.includes(part)) {
                return true;
            }
        }
    }
    
    return false;
}

let autofillInterval = null;

function startAutofillMonitor() {
    if (autofillInterval) clearInterval(autofillInterval);
    
    autofillInterval = setInterval(() => {
        chrome.storage.local.get(['sessionPdfText', 'sessionPatientInfo'], (result) => {
            if (result.sessionPdfText && result.sessionPatientInfo) {
                if (verifyPatientSession(result.sessionPatientInfo)) {
                    runDynamicAutofill(result.sessionPdfText, true);
                } else {
                    console.log("[AutoFill] Patient mismatch or page changed. Clearing background session.");
                    chrome.storage.local.remove(['sessionPdfText', 'sessionPatientInfo']);
                    clearInterval(autofillInterval);
                }
            } else {
                clearInterval(autofillInterval);
            }
        });
    }, 1500);
}

// Start monitoring the page automatically
startAutofillMonitor();
