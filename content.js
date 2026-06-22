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
    const logs = [];
    const normalizedPdfText = pdfText.toLowerCase();

    // In the new dynamic mode, we read the labels ON THE SCREEN right now,
    // and then search the PDF text for those labels. This prevents "overfitting"
    // and makes it work for ANY new test or ANY new PDF format!
    
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"], input:not([type]), input[type="tel"]'));
    let processedCount = 0;
    
    for (const input of inputs) {
        let labelText = null;
        
        // Only process inputs that are inside a table row to avoid accidentally 
        // interacting with search bars or hidden inputs in the website's header/navigation.
        const row = input.closest('tr');
        if (row) {
            const firstTd = row.querySelector('td, th');
            if (firstTd && firstTd.textContent) {
                labelText = firstTd.textContent;
            }
        } else {
            // If the input isn't in a table row, it's probably not a lab test field.
            // Skip it so we don't accidentally click or fill navigation buttons.
            continue; 
        }
        
        if (labelText) {
            let cleanLabel = labelText.trim().toLowerCase();
            cleanLabel = cleanLabel.split('\n')[0].trim();
            
            if (cleanLabel.length < 2 || cleanLabel.length > 80) continue;

            const safeLabel = cleanLabel.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            // Regex: Search the PDF for the exact label shown on screen, skip non-digits, and grab the number
            const regexFull = new RegExp(safeLabel + '[^0-9]*?([0-9]+(?:[,.][0-9]+)?)', 'i');
            
            let match = normalizedPdfText.match(regexFull);
            
            // Smart Fallback 1: Remove parentheses (e.g. "Glycosylated Hemoglobin (GHb/HbA1c)" -> "Glycosylated Hemoglobin")
            if (!match && cleanLabel.includes('(')) {
                const shortLabel = cleanLabel.split('(')[0].trim();
                if (shortLabel.length > 3) {
                    const safeShortLabel = shortLabel.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const regexShort = new RegExp(safeShortLabel + '[^0-9]*?([0-9]+(?:[,.][0-9]+)?)', 'i');
                    match = normalizedPdfText.match(regexShort);
                }
            }

            // Smart Fallback 2: Synonyms and Aliases
            // If the website says one thing but the PDF says another (e.g. WBC vs Leucocyte)
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
                    // If the screen label matches any word in a group...
                    if (aliasGroup.some(alias => cleanLabel.includes(alias))) {
                        // ...search the PDF for ALL other words in that group
                        for (const alias of aliasGroup) {
                            const safeAlias = alias.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                            const regexAlias = new RegExp(safeAlias + '[^0-9]*?([0-9]+(?:[,.][0-9]+)?)', 'i');
                            match = normalizedPdfText.match(regexAlias);
                            if (match) break;
                        }
                    }
                    if (match) break;
                }
            }

            if (match && match[1]) {
                const value = match[1];
                logs.push(`✅ Filled: '${cleanLabel}' -> ${value}`);
                
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
                processedCount++;
            } else {
                logs.push(`❌ Missed: '${cleanLabel}' (Not found in PDF)`);
            }
        }
    }
    
    if (processedCount === 0) {
        logs.push(`⚠️ Found no matching data for the fields on this screen.`);
    }
    
    return logs;
}
