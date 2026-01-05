// 1. FIREBASE IMPORTS
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ==========================================
// 2. YOUR FIREBASE KEYS
// ==========================================
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",           // <--- PASTE YOUR KEYS HERE
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "SENDER_ID",
    appId: "APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ==========================================
// 3. PRICING CONFIGURATION
// ==========================================
export const PRICING = {
    shippingStandard: 100, 
    freeShippingThreshold: 500,
    upiId: "raki97ts@ybl",
    upiName: "V Electronics Pvt Ltd",
    
    materials: {
        'PLA': { density: 1.54, price: 3.5, name: "PLA (Eco-Friendly)" },
        'PETG': { density: 1.47, price: 5.5, name: "PETG (Strong)" },
        'ABS': { density: 1.24, price: 5.0, name: "ABS (Durable)" },
        'TPU': { density: 1.41, price: 6.0, name: "TPU (Flexible)" },
        'CF':   { density: 1.40, price: 7.0, name: "Carbon Fiber" },
        'ASA':  { density: 1.17, price: 8.0, name: "ASA (UV Resistant)" } // Added ASA since it's in HTML
    },
    // Map Layer Heights to Flow Rates (Speed)
    quality: {
        '0.12': { label: '0.12mm (Ultra Detail)', flowRate: 4, priceMult: 1.3 }, // Slower printing
        '0.20': { label: '0.20mm (Standard)',     flowRate: 8, priceMult: 1.0 },
        '0.28': { label: '0.28mm (Draft/Fast)',   flowRate: 12, priceMult: 0.8 } // Faster printing
    },
    finishes: {
        'raw': { price: 0, label: "Raw" },
        'sanded': { price: 80, label: "Sanded" }, 
        'painted': { price: 250, label: "Painted" }
    },
    infillPatterns: [
        'grid', 'gyroid', 'honeycomb', 'triangles', 'cubic', 'concentric'
    ]
};

// ==========================================
// 4. CALCULATOR LOGIC (UPDATED FOR PRO FEATURES)
// ==========================================
export function calculateMetrics(baseVol, baseArea, infillPct, matType, qualityKey, options) {
    if(!baseVol || baseVol <= 0) return { weight: 0, timeHours: 0, totalCost: 0, shippingCost: 0, breakdown: { material:0, machine:0, labor:0 } };

    // A. SCALING
    const scaleFactor = options.scale || 1.0;
    const volumeCm3 = baseVol * Math.pow(scaleFactor, 3);
    const areaCm2 = baseArea * Math.pow(scaleFactor, 2);

    // B. GET SETTINGS
    const matData = PRICING.materials[matType] || PRICING.materials['PLA'];
    
    // FIX 1: Map the layer height from dropdown (e.g. "0.12") to pricing
    // If options.layerHeight is passed, use it, otherwise default to "0.20"
    const layerHeightKey = (options.layerHeight || "0.20").toString();
    const qualData = PRICING.quality[layerHeightKey] || PRICING.quality['0.20'];

    // C. WEIGHT CALCULATION (With Wall Loop Logic)
    // FIX 2: Calculate shell thickness based on Wall Loops (0.4mm nozzle * wall loops)
    const wallLoops = options.wallLoops || 3; 
    const shellThickness = (wallLoops * 0.4) / 10; // convert mm to cm
    
    const shellVolume = areaCm2 * shellThickness; 
    // Internal volume cannot be negative
    const internalVolume = Math.max(0, volumeCm3 - shellVolume);
    const infillVolume = internalVolume * (infillPct / 100);
    
    let totalPlasticCm3 = shellVolume + infillVolume;

    // Modifiers for Material
    if(options.supports) totalPlasticCm3 *= 1.25; // Supports add ~25% waste
    if(options.adhesion) totalPlasticCm3 += (2 + (areaCm2 * 0.05)); // Brim/Raft

    const weightGrams = totalPlasticCm3 * matData.density;

    // D. TIME CALCULATION
    const volumeMm3 = totalPlasticCm3 * 1000;
    
    // Flow Rate determines speed. High detail = Low Flow = More Time.
    let printTimeSeconds = volumeMm3 / qualData.flowRate;
    
    // Time penalties
    printTimeSeconds *= (1 + ((infillPct / 100) * 0.5)); 
    if(options.supports) printTimeSeconds *= 1.25;
    
    printTimeSeconds += 600; // 10 min setup
    const timeHours = printTimeSeconds / 3600;

    // E. COST CALCULATION
    const SETUP_FEE = 40; 
    const materialCost = weightGrams * matData.price;
    const machineCost = timeHours * 30; // ₹30/hr

    // F. FINISHING & ADDONS
    let finishCost = 0;
    if(options.finish && PRICING.finishes[options.finish]) {
        finishCost = PRICING.finishes[options.finish].price;
        if(options.finish !== 'raw') finishCost += (areaCm2 * 0.2); 
    }

    let addonsCost = 0;
    if(options.qc) addonsCost += 150; 
    if(options.epoxy) addonsCost += 150;
    if(options.vapor) addonsCost += 200;
    if(options.hardware) addonsCost += 80;
    if(options.removeBrand) addonsCost += 40;
    if(options.inserts) addonsCost += 120;
    if(options.uv) addonsCost += 100;
    if(options.assembly) addonsCost += 250;
    if(options.repair) addonsCost += 100;
    
    // Pro Feature Pricing
    if(options.cert) addonsCost += 500; 
    if(options.report) addonsCost += 800; 
    if(options.sandblast) addonsCost += 180;

    // G. TOTALS
    let singleUnitCost = (SETUP_FEE + materialCost + machineCost) * qualData.priceMult + finishCost + addonsCost;

    if(options.rush) singleUnitCost *= 1.50; 
    if(singleUnitCost < 80) singleUnitCost = 80; // Minimum Order Value

    const qty = options.qty || 1;
    // Bulk Discount on Setup Fee
    const bulkDiscountedTotal = (singleUnitCost * qty) - (SETUP_FEE * 0.5 * (qty - 1));
    const subTotal = Math.ceil(bulkDiscountedTotal);

    // Shipping
    let shippingCost = PRICING.shippingStandard;
    if(subTotal > PRICING.freeShippingThreshold) {
        shippingCost = 0;
    }

    return {
        weight: weightGrams * qty,
        timeHours: timeHours * qty,
        totalCost: subTotal + shippingCost,
        shippingCost: shippingCost,
        subTotal: subTotal,
        breakdown: {
            material: (materialCost * qty),
            machine: (machineCost * qty) + (SETUP_FEE * qty),
            labor: (finishCost + addonsCost) * qty
        }
    };
}
