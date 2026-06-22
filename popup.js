document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('pdf-upload');
    const fileNameDisplay = document.getElementById('file-name');
    const startBtn = document.getElementById('start-btn');
    const statusDiv = document.getElementById('status');
    const uploadArea = document.querySelector('.upload-area');
    
    const memoryState = document.getElementById('memory-state');
    const memoryFileName = document.getElementById('memory-file-name');
    const clearBtn = document.getElementById('clear-btn');

    let pdfTextToInject = null;

    // 1. Check if we already have a PDF saved in memory across page reloads
    chrome.storage.local.get(['savedPdfText', 'savedPdfName'], (result) => {
        if (result.savedPdfText && result.savedPdfName) {
            pdfTextToInject = result.savedPdfText;
            
            // Hide upload area, show memory state
            uploadArea.style.display = 'none';
            memoryState.style.display = 'block';
            memoryFileName.textContent = result.savedPdfName;
            
            // Enable the start button immediately
            startBtn.disabled = false;
            startBtn.classList.remove('disabled');
            statusDiv.textContent = 'PDF loaded from memory. Ready to Autofill!';
            statusDiv.className = 'status success';
        }
    });

    // 2. Allow user to clear memory and upload a new one
    clearBtn.addEventListener('click', () => {
        chrome.storage.local.remove(['savedPdfText', 'savedPdfName'], () => {
            pdfTextToInject = null;
            uploadArea.style.display = 'flex';
            memoryState.style.display = 'none';
            fileInput.value = '';
            fileNameDisplay.textContent = 'No file chosen';
            startBtn.disabled = true;
            startBtn.classList.add('disabled');
            statusDiv.textContent = '';
            statusDiv.className = 'status';
        });
    });

    // 3. Handle new file selection
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.type !== 'application/pdf') {
                statusDiv.textContent = 'Please select a valid PDF file.';
                statusDiv.className = 'status error';
                startBtn.disabled = true;
                startBtn.classList.add('disabled');
                return;
            }

            fileNameDisplay.textContent = file.name;
            statusDiv.textContent = 'Reading PDF...';
            statusDiv.className = 'status';
            
            try {
                const arrayBuffer = await file.arrayBuffer();
                
                // Use pdf.js to extract text
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let fullText = '';
                
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += pageText + ' ';
                }
                
                statusDiv.textContent = 'Extracting data...';
                
                // Normalizes the text into a single cleanly-spaced string
                const labData = extractLabData(fullText);
                
                console.log("Normalized PDF Text ready. Length:", labData.length);
                
                if (!labData || labData.trim().length === 0) {
                    throw new Error("Could not extract any text from the PDF.");
                }

                pdfTextToInject = labData;
                
                // Save it to chrome.storage so it persists across tab switches!
                chrome.storage.local.set({
                    savedPdfText: labData,
                    savedPdfName: file.name
                }, () => {
                    uploadArea.style.display = 'none';
                    memoryState.style.display = 'block';
                    memoryFileName.textContent = file.name;

                    startBtn.disabled = false;
                    startBtn.classList.remove('disabled');
                    statusDiv.textContent = 'PDF parsed and saved! Ready to Autofill.';
                    statusDiv.className = 'status success';
                });

            } catch (error) {
                console.error(error);
                statusDiv.textContent = 'Error parsing PDF: ' + error.message;
                statusDiv.className = 'status error';
                startBtn.disabled = true;
                startBtn.classList.add('disabled');
            }
        } else {
            fileNameDisplay.textContent = 'No file chosen';
            startBtn.disabled = true;
            startBtn.classList.add('disabled');
            statusDiv.textContent = '';
            statusDiv.className = 'status';
        }
    });

    // 4. Send data to content script
    startBtn.addEventListener('click', async () => {
        if (!pdfTextToInject) return;

        startBtn.disabled = true;
        startBtn.textContent = 'Filling...';
        statusDiv.textContent = 'Injecting data into page...';
        statusDiv.className = 'status';

        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                throw new Error("Could not find active tab.");
            }

            // Send the extracted text string to the content script
            chrome.tabs.sendMessage(tab.id, { 
                action: "FILL_LAB_DATA", 
                data: pdfTextToInject 
            }, (response) => {
                if (chrome.runtime.lastError) {
                    statusDiv.textContent = 'Error: Make sure you are on the lab website and refresh the page.';
                    statusDiv.className = 'status error';
                } else if (response && response.status === 'success') {
                    
                    // Summarize what we filled
                    const filledCount = response.details.filter(l => l.includes('✅')).length;
                    const missedCount = response.details.filter(l => l.includes('❌')).length;
                    
                    statusDiv.textContent = `Done. Filled ${filledCount}, but missed ${missedCount}. Press F12 to see console logs.`;
                    statusDiv.className = filledCount > 0 ? 'status success' : 'status error';
                    
                    console.log("Detailed Logs:\n" + response.details.join('\n'));
                } else {
                    statusDiv.textContent = 'Error: ' + (response?.message || 'Unknown error');
                    statusDiv.className = 'status error';
                }
                
                startBtn.disabled = false;
                startBtn.textContent = 'Start Autofill';
            });

        } catch (error) {
            console.error(error);
            statusDiv.textContent = 'Error: ' + error.message;
            statusDiv.className = 'status error';
            startBtn.disabled = false;
            startBtn.textContent = 'Start Autofill';
        }
    });
});
