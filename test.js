const { extractLabData } = require('./extractor.js');

const mockPdfText = `
LFT-Liver Function Test
Total Bilirubin 0.2 mg/dl 0.2-1.2
Direct Bilirubin 0.1 mg/dL 0.0-0.4
Indirect Bilirubin 0.1 mg/dl 0.1-1.0
Alkaline Phosphatase 86 U/L 52-171
SGPT/ALT 20 U/L <34
SGOT/AST 27 U/L 8-40
Total Protein 7.1 gm/dl 6.6-8.8
Albumin 4.3 g/dl 3.5-5.4
Globulin 2.8 g/dl 1.8-3.6

Lipid Profile
Total Cholesterol 227 mg/dl Desirable:<200
Cholesterol-HDL 38 mg/dl Low:<40
Cholesterol-LDL 134 mg/dl Normal:<100
Cholesterol-VLDL 55 mg/dl 7-40
Triglycerides 273 mg/dl Normal:<160

FBS-Glucose
Glucose- Fasting 229 mg/dL

CBP-Complete Blood Picture (WHOLE BLOOD EDTA)
Hemoglobin(HB) 11.2 g/dl
Erythrocyte count (Rbc Count) 5.2 million/cmm
Packed Cell Volume(Hematocrit) 38.9 %
Platelet Count 3.29 Lakh/cumm
Mean Cell Volume (MCV) 75.1 fL
Mean Cell Haemoglobin (MCH) 21.7 pg
Mean Corpuscular Hb Concn. (MCHC) 28.8 g/dl
Red Cell Distribution Width (RDW)- CV 16.4 %
Total Leucocytes Count(WBC) 10,270 Cells/Cumm
Neutrophils 63 %
Lymphocytes 30 %
Eosinophils 03 %
Monocytes 04 %

Kidney Profile
Urea 17 mg/dL
Creatinine 0.7 mg/dl
Uric acid 4.1 mg/dL
Calcium 9.6 mg/dL
Blood Urea Nitrogen 7.9 mg/dl
Sodium 140 mmol/L
Potassium 4.6 mmol/L
Chloride 102 mmol/L

// Simulating the PDF.js spacing issue where spaces get inserted between digits
// We will put another copy of the text here but with random spaces inside numbers
Hemoglobin(HB)   1 1 . 2  g/dl
Total Leucocytes Count(WBC)  1 0 , 2 7 0
`;

console.log("=== Running Extraction Tests ===");
const result = extractLabData(mockPdfText);

console.log("\n=== Extracted Results ===");
console.log(JSON.stringify(result, null, 2));

// Quick validation
const passed = 
    result["Complete Hemogram"]["Hemoglobin(HB)"] === "11.2" &&
    result["Complete Hemogram"]["Total Leucocytes Count"] === "10,270" &&
    result["Lipid Profile"]["Triglycerides"] === "273" &&
    result["Liver Function Test - LFT"]["Alkaline Phosphatase"] === "86";

if (passed) {
    console.log("\n✅ ALL TESTS PASSED!");
} else {
    console.log("\n❌ TESTS FAILED!");
}
