chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "FILL_LAB_DATA") {
        runDynamicAutofill(request.data)
            .then((result) => sendResponse({ status: "success", details: result }))
            .catch(err => {
                console.error(err);
                sendResponse({ status: "error", message: err.message });
            });
        return true; 
    }
});

async function runDynamicAutofill(pdfText) {
    console.log("Starting Dynamic 'Screen-Driven' AutoFill...");
    
    // results is an array of objects: { label, value, status, reason }
    // status: 'filled' | 'missed'
    // reason: plain English explanation
    const results = [];
    const normalizedPdfText = pdfText.toLowerCase();

    const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"], input:not([type]), input[type="tel"]'));
    
    for (const input of inputs) {
        let labelText = null;
        
        // Only process inputs that are inside a table row
        const row = input.closest('tr');
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

        const cleanLabelLower = cleanLabel.toLowerCase();
        const safeLabel = cleanLabelLower.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regexFull = new RegExp(safeLabel + '[^0-9]*?([0-9]+(?:[,.][0-9]+)?)', 'i');
        
        let match = null;
        let matchReason = '';

        // Attempt 1: Exact label match
        match = normalizedPdfText.match(regexFull);
        if (match) {
            matchReason = 'exact name';
        }

        // Attempt 2: Strip parentheses
        if (!match && cleanLabelLower.includes('(')) {
            const shortLabel = cleanLabelLower.split('(')[0].trim();
            if (shortLabel.length > 3) {
                const safeShortLabel = shortLabel.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const regexShort = new RegExp(safeShortLabel + '[^0-9]*?([0-9]+(?:[,.][0-9]+)?)', 'i');
                match = normalizedPdfText.match(regexShort);
                if (match) matchReason = 'shortened name';
            }
        }

        // Attempt 3: Medical synonyms
        if (!match) {
            const commonAliases = [
                ['sgpt', 'alt', 'alanine'],
                ['sgot', 'ast', 'aspartate'],
                ['wbc', 'leucocyte', 'leukocyte', 'white blood cell'],
                ['rbc', 'erythrocyte', 'red blood cell'],
                ['hba1c', 'glycosylated hemoglobin', 'glycated hemoglobin'],
                ['ldl', 'cholesterol-ldl'],
                ['hdl', 'cholesterol-hdl'],
                ['vldl', 'cholesterol-vldl', 'cholesterol vldl'],
                ['hb', 'hemoglobin']
            ];

            for (const aliasGroup of commonAliases) {
                if (aliasGroup.some(alias => cleanLabelLower.includes(alias))) {
                    for (const alias of aliasGroup) {
                        const safeAlias = alias.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                        const regexAlias = new RegExp(safeAlias + '[^0-9]*?([0-9]+(?:[,.][0-9]+)?)', 'i');
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

        if (match && match[1]) {
            const value = match[1];

            // Range validation — if value is outside a plausible range, warn
            const rangeWarning = checkRange(cleanLabelLower, parseFloat(value.replace(',', '')));
            
            // Fill the input
            input.focus();
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(input, value);
            } else {
                input.value = value;
            }
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            input.blur();

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
    
    return results;
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
