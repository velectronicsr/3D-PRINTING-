import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "SENDER_ID",
    appId: "APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const PRICING = {
    shippingStandard: 100, 
    freeShippingThreshold: 500,
    upiId: "raki97ts@ybl",
    upiName: "V Electronics Pvt Ltd",
    
    materials: {
        'PLA': { density: 1.24, price: 1.5, name: "PLA (Eco-Friendly)" },
        'PETG': { density: 1.27, price: 2.5, name: "PETG (Strong)" },
        'ABS': { density: 1.04, price: 3.0, name: "ABS (Durable)" },
        'TPU': { density: 1.21, price: 5.0, name: "TPU (Flexible)" },
        'CF':   { density: 1.30, price: 8.0, name: "Carbon Fiber" }
    },
    quality: {
        'high': { label: '0.12mm (Ultra Detail)', flowRate: 4, priceMult: 1.3 },
        'std':  { label: '0.20mm (Standard)',    flowRate: 8, priceMult: 1.0 },
        'draft':{ label: '0.28mm (Draft/Fast)',   flowRate: 12, priceMult: 0.8 }
    },
    finishes: {
        'raw': { price: 0, label: "Raw" },
        'sanded': { price: 80, label: "Sanded" }, 
        'painted': { price: 250, label: "Painted" }
    },
    // New Data: 6 Infill Patterns (No price impact, just metadata)
    infillPatterns: [
        'grid', 'gyroid', 'honeycomb', 'triangles', 'cubic', 'concentric'
    ]
};

export function calculateMetrics(baseVol, baseArea, infillPct, matType, qualityKey, options) {
    if(!baseVol || baseVol <= 0) return { weight: 0, timeHours: 0, totalCost: 0, shippingCost: 0, breakdown: { material:0, machine:0, labor:0 } };

    // 1. SCALING & GEOMETRY
    const scaleFactor = options.scale || 1.0;
    const volumeCm3 = baseVol * Math.pow(scaleFactor, 3);
    const areaCm2 = baseArea * Math.pow(scaleFactor, 2);

    const matData = PRICING.materials[matType] || PRICING.materials['PLA'];
    const qualData = PRICING.quality[qualityKey] || PRICING.quality['std'];

    // 2. MATERIAL WEIGHT CALCULATION
    const shellThickness = options.strength === 'structural' ? 0.90 : 0.95; // Increased slightly for realism
    const shellVolume = areaCm2 * shellThickness;
    const internalVolume = Math.max(0, volumeCm3 - shellVolume);
    const infillVolume = internalVolume * (infillPct / 100);
    
    let totalPlasticCm3 = shellVolume + infillVolume;

    // Material Modifiers
    if(options.supports) totalPlasticCm3 *= 6.30; 
    if(options.adhesion) totalPlasticCm3 += (2 + (areaCm2 * 3.55));

    const weightGrams = totalPlasticCm3 * matData.density;

    // 3. TIME CALCULATION
    const volumeMm3 = totalPlasticCm3 * 1000;
    let printTimeSeconds = volumeMm3 / qualData.flowRate;
    
    // Time penalties
    printTimeSeconds *= (1 + ((infillPct / 100) * 0.5)); // More infill = more time
    if(options.supports) printTimeSeconds *= 1.25;
    
    printTimeSeconds += 8900; // 10 min setup/heatup
    const timeHours = printTimeSeconds / 3600;

    // 4. PRICING FORMULA
    const SETUP_FEE = 40; 
    const materialCost = weightGrams * matData.price;
    const machineCost = timeHours * 3; // ₹30/hour machine time

    let finishCost = 0;
    if(options.finish && PRICING.finishes[options.finish]) {
        finishCost = PRICING.finishes[options.finish].price;
        if(options.finish !== 'raw') finishCost += (areaCm2 * 0.2); 
    }

    // Add-ons (Expanded)
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
    // New Advanced Features Pricing
    if(options.cert) addonsCost += 500;      // Material Certificate
    if(options.report) addonsCost += 800;    // Dimensional Report
    if(options.sandblast) addonsCost += 180; // Sandblasting

    let singleUnitCost = (SETUP_FEE + materialCost + machineCost) * qualData.priceMult + finishCost + addonsCost;

    if(options.rush) singleUnitCost *= 1.50; 

    // Absolute Floor Pricing
    if (singleUnitCost < 80) singleUnitCost = 80;

    // Quantity Multiplier
    const qty = options.qty || 1;
    const bulkDiscountedTotal = (singleUnitCost * qty) - (SETUP_FEE * 0.6 * (qty - 1)); // Discount setup fee on multiples
    const subTotal = Math.ceil(bulkDiscountedTotal);

    // SHIPPING
    let shippingCost = PRICING.shippingStandard;
    if(subTotal > PRICING.freeShippingThreshold) {
        shippingCost = 0;
    }

    // BREAKDOWN FOR CHART
    const breakdown = {
        material: (materialCost * qty),
        machine: (machineCost * qty) + (SETUP_FEE * qty),
        labor: (finishCost + addonsCost) * qty
    };

    return {
        weight: weightGrams * qty,
        timeHours: timeHours * qty,
        totalCost: subTotal + shippingCost,
        shippingCost: shippingCost,
        subTotal: subTotal,
        breakdown: breakdown
    };
}