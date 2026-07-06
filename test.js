const { extractLabData } = require('./extractor.js');

const mockPdfText = `
LFT-Liver Function Test
Name : Mrs. M Sunitha Barcode No : 24309212 Visit No : D00201232
Total Bilirubin 0.3 mg/dl 0.2-1.2
Direct Bilirubin 0.1 mg/dL 0.0-0.4
Indirect Bilirubin 0.2 mg/dl 0.1-1.0
Alkaline Phosphatase 68 U/L 52-171
SGPT/ALT 20 U/L <34
SGOT/AST 28 U/L 8-40
Total Protein 6.9 gm/dl 6.6-8.8
Albumin 3.7 g/dl 3.5-5.4
Globulin 3.2 g/dl 1.8-3.6

Lipid Profile
Total Cholesterol 187 mg/dl Desirable:<200
Cholesterol-HDL 53 mg/dl Low:<40
Cholesterol-LDL 111 mg/dl Normal:<100
Cholesterol-VLDL 23 mg/dl 7-40
Triglycerides 117 mg/dl Normal:<160

CBP-Complete Blood Picture (WHOLE BLOOD EDTA)
Name : Mrs. M Sunitha Barcode No : 24309212
Hemoglobin(HB) 11.2 g/dl
Erythrocyte count (Rbc Count) 5.2 million/cmm
Total Leucocytes Count(WBC) 10,270 Cells/Cumm
`;

function extractPatientInfo(text) {
    let name = null;
    const nameMatch = text.match(/Name\s*:\s*([^:\n]+)/i);
    if (nameMatch) {
        name = nameMatch[1].replace(/Barcode.*/i, '').trim();
    }
    
    const barcodes = [];
    const barcodeMatches = text.matchAll(/Barcode\s*No\s*:\s*(\d+)/gi);
    for (const match of barcodeMatches) {
        if (match[1] && !barcodes.includes(match[1])) {
            barcodes.push(match[1]);
        }
    }
    
    return { name, barcodes };
}

console.log("=== Running Extraction Tests ===");
const normalizedText = extractLabData(mockPdfText);
const patientInfo = extractPatientInfo(normalizedText);

console.log("\n=== Extracted Patient Info ===");
console.log(JSON.stringify(patientInfo, null, 2));

// Quick validation
const passed = 
    patientInfo.name === "Mrs. M Sunitha" &&
    patientInfo.barcodes.includes("24309212");

if (passed) {
    console.log("\n✅ ALL TESTS PASSED!");
} else {
    console.log("\n❌ TESTS FAILED!");
}
