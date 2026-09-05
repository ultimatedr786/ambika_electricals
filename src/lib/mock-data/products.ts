import type { Product, ProductCategory } from "@/types";

export const productCategories: ProductCategory[] = [
  "Lighting",
  "Switches & Sockets",
  "Wires & Cables",
  "Protection",
  "Distribution",
  "Fans",
  "Accessories",
];

export const brands = [
  "Philips",
  "Havells",
  "Polycab",
  "Finolex",
  "Anchor",
  "Schneider Electric",
  "Legrand",
  "Wipro",
  "Crompton",
  "Orient",
  "Bajaj",
  "RR Kabel",
];

/** `image` is an art key rendered by <ProductArt/> — no external assets needed. */
export const products: Product[] = [
  {
    id: "p-001", name: "Philips 9W LED Bulb", sku: "AMB-LGT-009", category: "Lighting", subcategory: "LED Bulbs",
    brand: "Philips", price: 120, mrp: 165, unit: "piece", stock: 486, points: 12, image: "bulb", status: "Active",
    description: "Energy-efficient LED bulb suitable for everyday home and commercial lighting.",
  },
  {
    id: "p-002", name: "Philips 12W LED Bulb", sku: "AMB-LGT-012", category: "Lighting", subcategory: "LED Bulbs",
    brand: "Philips", price: 165, mrp: 210, unit: "piece", stock: 320, points: 17, image: "bulb", status: "Active",
    description: "Brighter 12W cool daylight LED bulb with surge protection up to 4kV.",
  },
  {
    id: "p-003", name: "Havells 10W LED Bulb", sku: "AMB-LGT-010", category: "Lighting", subcategory: "LED Bulbs",
    brand: "Havells", price: 180, mrp: 230, unit: "piece", stock: 210, points: 18, image: "bulb", status: "Active",
    description: "Adore LED lamp with wide beam angle and high lumen output.",
  },
  {
    id: "p-004", name: "Wipro 20W LED Tube Light", sku: "AMB-LGT-020", category: "Lighting", subcategory: "Tube Lights",
    brand: "Wipro", price: 340, mrp: 450, unit: "piece", stock: 164, points: 34, image: "tube", status: "Active",
    description: "4-foot LED batten with uniform light spread, ideal for shops and workspaces.",
  },
  {
    id: "p-005", name: "Havells 18W LED Panel Light", sku: "AMB-LGT-118", category: "Lighting", subcategory: "Panel Lights",
    brand: "Havells", price: 520, mrp: 690, unit: "piece", stock: 96, points: 52, image: "panel", status: "Active",
    description: "Slim recessed round panel light for false ceilings.",
  },
  {
    id: "p-006", name: "Philips 7W LED Downlight", sku: "AMB-LGT-107", category: "Lighting", subcategory: "Downlights",
    brand: "Philips", price: 395, unit: "piece", stock: 128, points: 40, image: "panel", status: "Active",
    description: "Recessed downlight with warm white output.",
  },
  {
    id: "p-007", name: "Bajaj 50W LED Flood Light", sku: "AMB-LGT-150", category: "Lighting", subcategory: "Flood Lights",
    brand: "Bajaj", price: 1180, mrp: 1650, unit: "piece", stock: 42, points: 118, image: "flood", status: "Active",
    description: "IP65 outdoor flood light for compounds and signage.",
  },
  {
    id: "p-008", name: "Wipro Emergency LED Light", sku: "AMB-LGT-200", category: "Lighting", subcategory: "Emergency Lights",
    brand: "Wipro", price: 890, unit: "piece", stock: 58, points: 89, image: "flood", status: "Active",
    description: "Rechargeable emergency lamp with 4-hour backup.",
  },
  {
    id: "p-009", name: "Philips 9W Smart Wi-Fi LED Bulb", sku: "AMB-LGT-909", category: "Lighting", subcategory: "Smart Lighting",
    brand: "Philips", price: 999, mrp: 1299, unit: "piece", stock: 34, points: 100, image: "smartbulb", status: "Active",
    description: "16 million colours, app and voice controlled smart LED bulb.",
  },

  {
    id: "p-010", name: "Anchor Modular Switch 6A", sku: "AMB-SWT-006", category: "Switches & Sockets", subcategory: "Switches",
    brand: "Anchor", price: 85, mrp: 110, unit: "piece", stock: 640, points: 9, image: "switch", status: "Active",
    description: "Roma 1-way 6A modular switch with silver alloy contacts.",
  },
  {
    id: "p-011", name: "Anchor 2-Way Switch 6A", sku: "AMB-SWT-206", category: "Switches & Sockets", subcategory: "Switches",
    brand: "Anchor", price: 110, unit: "piece", stock: 420, points: 11, image: "switch", status: "Active",
    description: "Two-way switch for staircase and dual-point control.",
  },
  {
    id: "p-012", name: "Anchor 16A Socket", sku: "AMB-SKT-016", category: "Switches & Sockets", subcategory: "Sockets",
    brand: "Anchor", price: 145, mrp: 185, unit: "piece", stock: 312, points: 15, image: "socket", status: "Active",
    description: "3-pin 16A modular socket with shutter protection.",
  },
  {
    id: "p-013", name: "Legrand 16A Socket", sku: "AMB-SKT-116", category: "Switches & Sockets", subcategory: "Sockets",
    brand: "Legrand", price: 220, mrp: 275, unit: "piece", stock: 188, points: 22, image: "socket", status: "Active",
    description: "Myrius 16A socket with premium finish.",
  },
  {
    id: "p-014", name: "Legrand USB Charging Socket", sku: "AMB-SKT-USB", category: "Switches & Sockets", subcategory: "Sockets",
    brand: "Legrand", price: 780, unit: "piece", stock: 64, points: 78, image: "socket", status: "Active",
    description: "Dual USB-A modular charging socket, 2.1A output.",
  },
  {
    id: "p-015", name: "Anchor Fan Regulator Step Type", sku: "AMB-SWT-REG", category: "Switches & Sockets", subcategory: "Regulators",
    brand: "Anchor", price: 310, mrp: 395, unit: "piece", stock: 142, points: 31, image: "regulator", status: "Active",
    description: "5-step modular fan regulator, low heat dissipation.",
  },
  {
    id: "p-016", name: "Anchor Bell Push", sku: "AMB-SWT-BEL", category: "Switches & Sockets", subcategory: "Switches",
    brand: "Anchor", price: 95, unit: "piece", stock: 220, points: 10, image: "switch", status: "Active",
    description: "Modular bell push with soft-touch action.",
  },
  {
    id: "p-017", name: "Schneider Dimmer 400W", sku: "AMB-SWT-DIM", category: "Switches & Sockets", subcategory: "Dimmers",
    brand: "Schneider Electric", price: 1150, unit: "piece", stock: 38, points: 115, image: "regulator", status: "Active",
    description: "Rotary dimmer for incandescent and dimmable LED loads.",
  },

  {
    id: "p-018", name: "Polycab 1.5 sq mm FR Wire (90m)", sku: "AMB-WIR-015", category: "Wires & Cables", subcategory: "House Wire",
    brand: "Polycab", price: 1450, mrp: 1780, unit: "coil", stock: 96, points: 145, image: "wire", status: "Active",
    description: "Flame retardant copper house wire, 90 metre coil.",
  },
  {
    id: "p-019", name: "Finolex 2.5 sq mm FRLS Wire (90m)", sku: "AMB-WIR-025", category: "Wires & Cables", subcategory: "House Wire",
    brand: "Finolex", price: 2250, mrp: 2680, unit: "coil", stock: 74, points: 225, image: "wire", status: "Active",
    description: "Flame retardant low smoke wire for power circuits.",
  },
  {
    id: "p-020", name: "RR Kabel 4 sq mm Copper Cable (90m)", sku: "AMB-WIR-040", category: "Wires & Cables", subcategory: "Copper Cable",
    brand: "RR Kabel", price: 3480, unit: "coil", stock: 40, points: 348, image: "wire", status: "Active",
    description: "Heavy-duty copper cable for AC and geyser circuits.",
  },
  {
    id: "p-021", name: "Polycab 3 Core Flexible Cable (per m)", sku: "AMB-WIR-3CF", category: "Wires & Cables", subcategory: "Flexible Cable",
    brand: "Polycab", price: 62, unit: "metre", stock: 1200, points: 6, image: "wire", status: "Active",
    description: "Multi-strand flexible cable for appliances.",
  },
  {
    id: "p-022", name: "Finolex CAT6 Ethernet Cable (per m)", sku: "AMB-WIR-CAT", category: "Wires & Cables", subcategory: "Data Cable",
    brand: "Finolex", price: 38, unit: "metre", stock: 900, points: 4, image: "wire", status: "Active",
    description: "CAT6 UTP networking cable for structured wiring.",
  },
  {
    id: "p-023", name: "RR Kabel Coaxial Cable RG6 (per m)", sku: "AMB-WIR-RG6", category: "Wires & Cables", subcategory: "Coaxial",
    brand: "RR Kabel", price: 26, unit: "metre", stock: 760, points: 3, image: "wire", status: "Active",
    description: "RG6 coaxial cable for TV and CCTV runs.",
  },

  {
    id: "p-024", name: "Schneider 32A MCB Single Pole", sku: "AMB-PRT-032", category: "Protection", subcategory: "MCB",
    brand: "Schneider Electric", price: 380, mrp: 470, unit: "piece", stock: 210, points: 38, image: "mcb", status: "Active",
    description: "C-curve miniature circuit breaker, 10kA breaking capacity.",
  },
  {
    id: "p-025", name: "Havells 32A MCB Single Pole", sku: "AMB-PRT-132", category: "Protection", subcategory: "MCB",
    brand: "Havells", price: 420, unit: "piece", stock: 176, points: 42, image: "mcb", status: "Active",
    description: "Domae MCB with quick-make quick-break mechanism.",
  },
  {
    id: "p-026", name: "Havells 40A RCCB 30mA", sku: "AMB-PRT-RCB", category: "Protection", subcategory: "RCCB",
    brand: "Havells", price: 2450, mrp: 2980, unit: "piece", stock: 48, points: 245, image: "mcb", status: "Active",
    description: "Residual current circuit breaker for earth leakage protection.",
  },
  {
    id: "p-027", name: "Schneider 63A Isolator", sku: "AMB-PRT-ISO", category: "Protection", subcategory: "Isolator",
    brand: "Schneider Electric", price: 890, unit: "piece", stock: 62, points: 89, image: "mcb", status: "Active",
    description: "Double pole isolator for main incomer switching.",
  },
  {
    id: "p-028", name: "Anchor Surge Protector 4 Socket", sku: "AMB-PRT-SPD", category: "Protection", subcategory: "Surge Protector",
    brand: "Anchor", price: 640, unit: "piece", stock: 88, points: 64, image: "mcb", status: "Active",
    description: "Spike guard with surge suppression and indicator.",
  },

  {
    id: "p-029", name: "Havells 8-Way SPN Distribution Box", sku: "AMB-DIS-008", category: "Distribution", subcategory: "SPN DB",
    brand: "Havells", price: 1680, mrp: 2150, unit: "piece", stock: 52, points: 168, image: "db", status: "Active",
    description: "Single pole and neutral distribution board, double door.",
  },
  {
    id: "p-030", name: "Schneider 12-Way TPN Distribution Box", sku: "AMB-DIS-012", category: "Distribution", subcategory: "TPN DB",
    brand: "Schneider Electric", price: 4250, unit: "piece", stock: 24, points: 425, image: "db", status: "Active",
    description: "Three pole and neutral DB for commercial installations.",
  },
  {
    id: "p-031", name: "Copper Busbar Set 100A", sku: "AMB-DIS-BUS", category: "Distribution", subcategory: "Busbar",
    brand: "Havells", price: 720, unit: "set", stock: 66, points: 72, image: "db", status: "Active",
    description: "Insulated copper busbar comb for DB assembly.",
  },
  {
    id: "p-032", name: "Neutral Link 12-Way", sku: "AMB-DIS-NEU", category: "Distribution", subcategory: "Neutral Link",
    brand: "Anchor", price: 180, unit: "piece", stock: 140, points: 18, image: "db", status: "Active",
    description: "Brass neutral link bar with mounting base.",
  },

  {
    id: "p-033", name: "Crompton Ceiling Fan 1200mm", sku: "AMB-FAN-120", category: "Fans", subcategory: "Ceiling Fan",
    brand: "Crompton", price: 2450, mrp: 3200, unit: "piece", stock: 58, points: 245, image: "fan", status: "Active",
    description: "High-speed 1200mm ceiling fan with dust-resistant finish.",
  },
  {
    id: "p-034", name: "Havells BLDC Ceiling Fan 1200mm", sku: "AMB-FAN-BLD", category: "Fans", subcategory: "Ceiling Fan",
    brand: "Havells", price: 3980, mrp: 4790, unit: "piece", stock: 32, points: 398, image: "fan", status: "Active",
    description: "5-star energy efficient BLDC fan with remote control.",
  },
  {
    id: "p-035", name: "Orient Exhaust Fan 250mm", sku: "AMB-FAN-EXH", category: "Fans", subcategory: "Exhaust Fan",
    brand: "Orient", price: 1850, mrp: 2250, unit: "piece", stock: 46, points: 185, image: "fan", status: "Active",
    description: "Kitchen and bathroom exhaust fan with rust-proof body.",
  },
  {
    id: "p-036", name: "Bajaj Wall Fan 400mm", sku: "AMB-FAN-WAL", category: "Fans", subcategory: "Wall Fan",
    brand: "Bajaj", price: 2280, unit: "piece", stock: 28, points: 228, image: "fan", status: "Active",
    description: "Wall mounted fan with oscillation and pull cord control.",
  },
  {
    id: "p-037", name: "Orient Table Fan 400mm", sku: "AMB-FAN-TAB", category: "Fans", subcategory: "Table Fan",
    brand: "Orient", price: 1990, unit: "piece", stock: 22, points: 199, image: "fan", status: "Active",
    description: "Portable high-air-delivery table fan.",
  },

  {
    id: "p-038", name: "Anchor Bulb Holder Batten", sku: "AMB-ACC-HLD", category: "Accessories", subcategory: "Holders",
    brand: "Anchor", price: 35, unit: "piece", stock: 880, points: 4, image: "holder", status: "Active",
    description: "Heat-resistant batten holder for B22 lamps.",
  },
  {
    id: "p-039", name: "Ceiling Rose 3 Plate", sku: "AMB-ACC-ROS", category: "Accessories", subcategory: "Holders",
    brand: "Anchor", price: 48, unit: "piece", stock: 520, points: 5, image: "holder", status: "Active",
    description: "Three-plate ceiling rose for fan and light points.",
  },
  {
    id: "p-040", name: "Anchor 6A Plug Top", sku: "AMB-ACC-PLG", category: "Accessories", subcategory: "Plugs",
    brand: "Anchor", price: 55, unit: "piece", stock: 460, points: 6, image: "plug", status: "Active",
    description: "3-pin 6A plug top with shrouded pins.",
  },
  {
    id: "p-041", name: "PVC Conduit Pipe 20mm (3m)", sku: "AMB-ACC-CON", category: "Accessories", subcategory: "Conduit",
    brand: "Polycab", price: 45, unit: "length", stock: 1400, points: 5, image: "conduit", status: "Active",
    description: "ISI marked rigid PVC conduit for concealed wiring.",
  },
  {
    id: "p-042", name: "PVC Conduit Bend 20mm", sku: "AMB-ACC-BND", category: "Accessories", subcategory: "Conduit",
    brand: "Polycab", price: 18, unit: "piece", stock: 900, points: 2, image: "conduit", status: "Active",
    description: "90° conduit bend for concealed conduit runs.",
  },
  {
    id: "p-043", name: "Junction Box 4x4", sku: "AMB-ACC-JUN", category: "Accessories", subcategory: "Boxes",
    brand: "Anchor", price: 65, unit: "piece", stock: 380, points: 7, image: "box", status: "Active",
    description: "PVC junction box with cover plate.",
  },
  {
    id: "p-044", name: "Cable Tie 200mm (100 pcs)", sku: "AMB-ACC-TIE", category: "Accessories", subcategory: "Fasteners",
    brand: "Anchor", price: 120, unit: "pack", stock: 300, points: 12, image: "tie", status: "Active",
    description: "Nylon self-locking cable ties, pack of 100.",
  },
  {
    id: "p-045", name: "Brass Cable Gland 20mm", sku: "AMB-ACC-GLD", category: "Accessories", subcategory: "Glands",
    brand: "Havells", price: 25, unit: "piece", stock: 640, points: 3, image: "gland", status: "Active",
    description: "Double compression brass cable gland.",
  },
  {
    id: "p-046", name: "Terminal Block 10A (12-Way)", sku: "AMB-ACC-TRM", category: "Accessories", subcategory: "Connectors",
    brand: "Anchor", price: 42, unit: "piece", stock: 410, points: 4, image: "box", status: "Active",
    description: "Polyamide terminal connector strip.",
  },
  {
    id: "p-047", name: "Electrical Insulation Tape (Pack of 5)", sku: "AMB-ACC-TAP", category: "Accessories", subcategory: "Tapes",
    brand: "Anchor", price: 130, unit: "pack", stock: 520, points: 13, image: "tape", status: "Active",
    description: "PVC insulation tape, 5-roll pack, multi colour.",
  },
  {
    id: "p-048", name: "Havells 4 Socket Extension Board", sku: "AMB-ACC-EXT", category: "Accessories", subcategory: "Extension",
    brand: "Havells", price: 690, mrp: 850, unit: "piece", stock: 110, points: 69, image: "extension", status: "Active",
    description: "4-socket extension board with master switch and 2m cord.",
  },
];

export const productById = (id: string) => products.find((p) => p.id === id);
