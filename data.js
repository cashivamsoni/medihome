// Medicine Inventory Database
// Format: id, name, description, type (homeopathic/allopathic), form, quantity, quantityUnit, expiryDate, category, owner, frequentlyUsed, lowStock, notes

const MEDICINE_DB = [
  // ─────────────────────────────────────────────
  // SHARED — Mouth Ulcer Care (High Frequency, top priority)
  // ─────────────────────────────────────────────
  {
    id: "m001",
    name: "Mouth Ulcer IAR Drops",
    description: "Homeopathic drops for fast relief from painful mouth ulcers and oral inflammation.",
    type: "homeopathic",
    form: "Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2029-04-30",
    category: "Mouth Ulcer Care",
    owner: "shared",
    frequentlyUsed: true,
    lowStock: false,
    notes: "Used frequently"
  },
  {
    id: "m002",
    name: "Boroglycerine",
    description: "Soothing topical gel for mouth ulcers, minor cuts, and irritated mucous membranes.",
    type: "allopathic",
    form: "Gel/Liquid",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2030-08-31",
    category: "Mouth Ulcer Care",
    owner: "shared",
    frequentlyUsed: true,
    lowStock: false,
    notes: "Used frequently"
  },

  // ─────────────────────────────────────────────
  // SHARED — Fever, Cold & Cough (sorted by expiry)
  // ─────────────────────────────────────────────
  {
    id: "m003",
    name: "Febral",
    description: "Homeopathic fever remedy that helps reduce body temperature and associated restlessness.",
    type: "homeopathic",
    form: "Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2027-07-31",
    category: "Fever, Cold & Cough Care",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },
  {
    id: "m004",
    name: "Vicks VapoRub",
    description: "Topical mentholated ointment for relieving nasal congestion, cough, and minor muscle aches.",
    type: "allopathic",
    form: "Ointment",
    quantity: 1,
    quantityUnit: "tube",
    expiryDate: "2028-08-31",
    category: "Fever, Cold & Cough Care",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },
  {
    id: "m005",
    name: "Aidoaller",
    description: "Antihistamine tablets for managing fever, allergic reactions, sneezing, and runny nose.",
    type: "allopathic",
    form: "Tablets",
    quantity: 7,
    quantityUnit: "tablets",
    expiryDate: "2030-04-30",
    category: "Fever, Cold & Cough Care",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },
  {
    id: "m006",
    name: "Ralnofev",
    description: "Homeopathic fever drops for gentle reduction of high temperature without side effects.",
    type: "homeopathic",
    form: "Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2030-08-31",
    category: "Fever, Cold & Cough Care",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },
  {
    id: "m007",
    name: "Homeopathic Drops (Cough & Head Pain)",
    description: "Unbranded homeopathic drops for relieving cough deposits and head pain during fever.",
    type: "homeopathic",
    form: "Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: null,
    category: "Fever, Cold & Cough Care",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: false,
    notes: "For cough deposit, head pain during fever"
  },
  {
    id: "m008",
    name: "Homeopathic Drops (Fever)",
    description: "Unbranded homeopathic drops formulated to bring down fever and ease associated discomfort.",
    type: "homeopathic",
    form: "Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: null,
    category: "Fever, Cold & Cough Care",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: false,
    notes: "For fever"
  },
  {
    id: "m009",
    name: "Homeopathic Chewy (Cough & Cold)",
    description: "Unbranded homeopathic chewable tablet for soothing cough and relieving cold symptoms.",
    type: "homeopathic",
    form: "Chewable Tablet",
    quantity: 1,
    quantityUnit: "tablet",
    expiryDate: null,
    category: "Fever, Cold & Cough Care",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: true,
    notes: ""
  },
  {
    id: "m010",
    name: "Vicks Candy",
    description: "Medicated throat lozenges with menthol for soothing sore throat and freshening breath.",
    type: "allopathic",
    form: "Candy/Lozenges",
    quantity: 2,
    quantityUnit: "pieces",
    expiryDate: null,
    category: "Fever, Cold & Cough Care",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: true,
    notes: "Sore throat relief"
  },

  // ─────────────────────────────────────────────
  // SHARED — Pain Relief & Injury Care
  // ─────────────────────────────────────────────
  {
    id: "m011",
    name: "Cipladine Antiseptic Cream",
    description: "Broad-spectrum povidone-iodine antiseptic cream for wound cleaning and preventing infection.",
    type: "allopathic",
    form: "Cream",
    quantity: 1,
    quantityUnit: "tube",
    expiryDate: "2026-12-31",
    category: "Pain Relief & Injury Care",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },
  {
    id: "m012",
    name: "Dettol Bandage",
    description: "Antiseptic-coated adhesive bandages for covering and protecting minor cuts and wounds.",
    type: "allopathic",
    form: "Bandage",
    quantity: 7,
    quantityUnit: "pieces",
    expiryDate: "2027-05-31",
    category: "Pain Relief & Injury Care",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },
  {
    id: "m013",
    name: "Hansaplast Bandage",
    description: "Flexible adhesive bandages offering reliable wound protection and comfortable wear.",
    type: "allopathic",
    form: "Bandage",
    quantity: 3,
    quantityUnit: "pieces",
    expiryDate: "2027-09-30",
    category: "Pain Relief & Injury Care",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: true,
    notes: ""
  },
  {
    id: "m014",
    name: "Zerodol SP",
    description: "Pain-relief tablets combining aceclofenac and serratiopeptidase for pain, swelling, and inflammation.",
    type: "allopathic",
    form: "Tablets",
    quantity: 7,
    quantityUnit: "tablets",
    expiryDate: "2028-04-30",
    category: "Pain Relief & Injury Care",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },
  {
    id: "m015",
    name: "Pain Drops P19",
    description: "Homeopathic multi-purpose pain drops for headaches, joint pain, and general body aches.",
    type: "homeopathic",
    form: "Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2030-08-31",
    category: "Pain Relief & Injury Care",
    owner: "shared",
    frequentlyUsed: true,
    lowStock: false,
    notes: "Used frequently"
  },
  {
    id: "m016",
    name: "Homeopathic Drops (Chest/Side Pain)",
    description: "Unbranded homeopathic drops to relieve sharp side chest pain and intercostal discomfort.",
    type: "homeopathic",
    form: "Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: null,
    category: "Pain Relief & Injury Care",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: false,
    notes: "For side chest pain"
  },

  // ─────────────────────────────────────────────
  // SHARED — Digestion, Gut Health & Hydration
  // ─────────────────────────────────────────────
  {
    id: "m017",
    name: "Hajmola",
    description: "Ayurvedic digestive tablets for indigestion, bloating, and improving digestive fire after meals.",
    type: "allopathic",
    form: "Tablets",
    quantity: 1,
    quantityUnit: "pack",
    expiryDate: "2027-01-31",
    category: "Digestion, Gut Health & Hydration",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },
  {
    id: "m018",
    name: "Enerzal Zero",
    description: "Zero-sugar oral rehydration powder to replenish electrolytes during dehydration and illness.",
    type: "allopathic",
    form: "Rehydration Pouch",
    quantity: 3,
    quantityUnit: "pouches",
    expiryDate: "2027-02-28",
    category: "Digestion, Gut Health & Hydration",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },
  {
    id: "m019",
    name: "ORS Electral",
    description: "WHO-formulated oral rehydration salts to combat dehydration from diarrhea, vomiting, or fever.",
    type: "allopathic",
    form: "Rehydration Pouch",
    quantity: 1,
    quantityUnit: "pouch",
    expiryDate: "2027-07-31",
    category: "Digestion, Gut Health & Hydration",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: true,
    notes: ""
  },
  {
    id: "m020",
    name: "Cholerasol",
    description: "Homeopathic drops for treating loose motion, diarrhea, and overall digestive system support.",
    type: "homeopathic",
    form: "Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2029-03-31",
    category: "Digestion, Gut Health & Hydration",
    owner: "shared",
    frequentlyUsed: true,
    lowStock: false,
    notes: "Used frequently"
  },
  {
    id: "m021",
    name: "Homeopathic Drops (Stomach Pain)",
    description: "Unbranded homeopathic drops for soothing stomach cramps, spasms, and abdominal pain.",
    type: "homeopathic",
    form: "Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: null,
    category: "Digestion, Gut Health & Hydration",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: false,
    notes: "For stomach pain"
  },
  {
    id: "m022",
    name: "Homeopathic Chewy (Gas Relief)",
    description: "Unbranded homeopathic chewable tablets to relieve flatulence, gas, and abdominal bloating.",
    type: "homeopathic",
    form: "Chewable Tablet",
    quantity: 2,
    quantityUnit: "tablets",
    expiryDate: null,
    category: "Digestion, Gut Health & Hydration",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: true,
    notes: "For gas; reorder soon"
  },
  {
    id: "m023",
    name: "Homeopathic Chewy (Loose Motion)",
    description: "Unbranded homeopathic chewable tablets for quick relief from loose motion and diarrhea.",
    type: "homeopathic",
    form: "Chewable Tablet",
    quantity: 0,
    quantityUnit: "tablets",
    expiryDate: null,
    category: "Digestion, Gut Health & Hydration",
    owner: "shared",
    frequentlyUsed: true,
    lowStock: true,
    notes: "For loose motion — almost finished, reorder urgently"
  },

  // ─────────────────────────────────────────────
  // SHARED — Allergies & Infections
  // ─────────────────────────────────────────────
  {
    id: "m024",
    name: "Avil 25",
    description: "Antihistamine tablets for allergic rashes, itching, hives, and hypersensitivity reactions.",
    type: "allopathic",
    form: "Tablets",
    quantity: 3,
    quantityUnit: "tablets",
    expiryDate: null,
    category: "Allergies & Infections",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: true,
    notes: "Expiry date not visible — please check package"
  },
  {
    id: "m025",
    name: "Septran",
    description: "Broad-spectrum antibiotic tablets (cotrimoxazole) for bacterial infections of the urinary tract and respiratory system.",
    type: "allopathic",
    form: "Tablets",
    quantity: 6,
    quantityUnit: "tablets",
    expiryDate: "2028-06-30",
    category: "Allergies & Infections",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },
  {
    id: "m026",
    name: "Alfadom G",
    description: "Homeopathic drops to combat general debility, weakness, and low vitality in adults.",
    type: "homeopathic",
    form: "Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2028-05-31",
    category: "Allergies & Infections",
    owner: "shared",
    frequentlyUsed: false,
    lowStock: false,
    notes: "Stored in rarely-opened box"
  },

  // ─────────────────────────────────────────────
  // BABITA — Uterus & Women's Health
  // ─────────────────────────────────────────────
  {
    id: "m027",
    name: "Uterus Troubles No.101",
    description: "Homeopathic remedy for uterine disorders, irregular cycles, and associated discomfort in women.",
    type: "homeopathic",
    form: "Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2028-09-30",
    category: "Uterus & Women's Health",
    owner: "babita",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },
  {
    id: "m028",
    name: "Omeo Uteroplus Tonic",
    description: "Homeopathic uterine tonic for managing prolapse symptoms, hormonal balance, and reproductive wellness.",
    type: "homeopathic",
    form: "Tonic",
    quantity: 1,
    quantityUnit: "large bottle",
    expiryDate: "2029-04-30",
    category: "Uterus & Women's Health",
    owner: "babita",
    frequentlyUsed: false,
    lowStock: false,
    notes: "Stored in almirah"
  },
  {
    id: "m029",
    name: "Utronic",
    description: "Homeopathic uterus tonic to strengthen uterine muscles and support long-term reproductive health.",
    type: "homeopathic",
    form: "Tonic",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2029-07-31",
    category: "Uterus & Women's Health",
    owner: "babita",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },
  {
    id: "m030",
    name: "Prolapsis Uterus No.86",
    description: "Homeopathic drops specifically formulated for uterine prolapse symptoms and pelvic floor support.",
    type: "homeopathic",
    form: "Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2030-04-30",
    category: "Uterus & Women's Health",
    owner: "babita",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },

  // ─────────────────────────────────────────────
  // BABITA — Eye Care
  // ─────────────────────────────────────────────
  {
    id: "m031",
    name: "Cineraria Maritima Eye Drops",
    description: "Homeopathic eye drops for preventing and managing early-stage cataracts and eye strain.",
    type: "homeopathic",
    form: "Eye Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2029-07-31",
    category: "Eye Care",
    owner: "babita",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },
  {
    id: "m032",
    name: "Homeopathic Chewy (Eye Pain)",
    description: "Unbranded homeopathic chewable tablet for alleviating eye pain and reducing ocular discomfort.",
    type: "homeopathic",
    form: "Chewable Tablet",
    quantity: 1,
    quantityUnit: "tablet",
    expiryDate: null,
    category: "Eye Care",
    owner: "babita",
    frequentlyUsed: false,
    lowStock: true,
    notes: "For eye pain"
  },
  {
    id: "m033",
    name: "Homeopathic Drops (Eye Pain – Edible)",
    description: "Unbranded homeopathic oral drops for relieving eye pain and improving eye nerve function.",
    type: "homeopathic",
    form: "Drops (Edible)",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: null,
    category: "Eye Care",
    owner: "babita",
    frequentlyUsed: false,
    lowStock: false,
    notes: "For eye pain; edible/oral use"
  },

  // ─────────────────────────────────────────────
  // BABITA — Jaw Pain Care
  // ─────────────────────────────────────────────
  {
    id: "m034",
    name: "Homeopathic Drops (Jaw Pain)",
    description: "Unbranded homeopathic drops for relieving jaw pain, TMJ discomfort, and jaw muscle tension.",
    type: "homeopathic",
    form: "Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: null,
    category: "Jaw Pain Care",
    owner: "babita",
    frequentlyUsed: false,
    lowStock: false,
    notes: "For jaw pain"
  },
  {
    id: "m035",
    name: "Homeopathic Chewy (Jaw Pain)",
    description: "Unbranded homeopathic chewable tablets for easing chronic jaw pain and facial muscle aches.",
    type: "homeopathic",
    form: "Chewable Tablet",
    quantity: 2,
    quantityUnit: "tablets",
    expiryDate: null,
    category: "Jaw Pain Care",
    owner: "babita",
    frequentlyUsed: false,
    lowStock: true,
    notes: "For jaw pain"
  },

  // ─────────────────────────────────────────────
  // BABITA — Hair & Nail Health
  // ─────────────────────────────────────────────
  {
    id: "m036",
    name: "Nail and Hair Aid",
    description: "Homeopathic chewable tablets to strengthen brittle nails and support healthy hair growth.",
    type: "homeopathic",
    form: "Chewable Tablets",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2026-09-30",
    category: "Hair & Nail Health",
    owner: "babita",
    frequentlyUsed: false,
    lowStock: false,
    notes: "Expiring soon"
  },
  {
    id: "m037",
    name: "Folli Chew",
    description: "Homeopathic hair tablets to reduce hair fall, improve follicle strength, and boost hair density.",
    type: "homeopathic",
    form: "Chewable Tablets",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2029-11-30",
    category: "Hair & Nail Health",
    owner: "babita",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },
  {
    id: "m038",
    name: "Zauber Hair Drops",
    description: "Homeopathic hair drops for stimulating scalp circulation, reducing hair loss, and promoting regrowth.",
    type: "homeopathic",
    form: "Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2029-04-30",
    category: "Hair & Nail Health",
    owner: "babita",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },

  // ─────────────────────────────────────────────
  // SHIVAM — Cold & Cough Care
  // ─────────────────────────────────────────────
  {
    id: "m039",
    name: "Cheston Cold",
    description: "Combination tablet for cold and flu relief, targeting congestion, runny nose, and sneezing.",
    type: "allopathic",
    form: "Tablets",
    quantity: 8,
    quantityUnit: "tablets",
    expiryDate: null,
    category: "Cold & Cough Care",
    owner: "shivam",
    frequentlyUsed: false,
    lowStock: false,
    notes: "Expiry date not visible — please check package"
  },

  // ─────────────────────────────────────────────
  // SHIVAM — Gut & Appetite Care
  // ─────────────────────────────────────────────
  {
    id: "m040",
    name: "Euphrasia Eye Drops",
    description: "Homeopathic eye drops for conjunctivitis, eye redness, irritation, and watery eyes.",
    type: "homeopathic",
    form: "Eye Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2027-06-30",
    category: "Eye Care",
    owner: "shivam",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },
  {
    id: "m041",
    name: "R37 Homeopathic Colon Drops",
    description: "Dr. Reckeweg R37 drops for intestinal colic, digestive cramps, and colon health support.",
    type: "homeopathic",
    form: "Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2029-05-31",
    category: "Gut & Appetite Care",
    owner: "shivam",
    frequentlyUsed: false,
    lowStock: false,
    notes: "Stored in rarely-opened box"
  },
  {
    id: "m042",
    name: "Dr. Reckeweg R95 Alfalfa Tonic",
    description: "Homeopathic appetite tonic with alfalfa to improve appetite, weight, and general vitality.",
    type: "homeopathic",
    form: "Tonic",
    quantity: 1,
    quantityUnit: "large bottle",
    expiryDate: "2029-05-31",
    category: "Gut & Appetite Care",
    owner: "shivam",
    frequentlyUsed: false,
    lowStock: false,
    notes: "Stored in almirah"
  },
  {
    id: "m043",
    name: "Enteroclen",
    description: "Homeopathic gut care drops to cleanse the intestines, ease bloating, and restore gut microflora balance.",
    type: "homeopathic",
    form: "Drops",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: "2030-03-31",
    category: "Gut & Appetite Care",
    owner: "shivam",
    frequentlyUsed: false,
    lowStock: false,
    notes: ""
  },

  // ─────────────────────────────────────────────
  // SHIVAM — Hair Care
  // ─────────────────────────────────────────────
  {
    id: "m044",
    name: "Homeopathic Dandruff Hair Oil",
    description: "Unbranded homeopathic medicated hair oil to control dandruff, soothe scalp, and reduce itchiness.",
    type: "homeopathic",
    form: "Hair Oil",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: null,
    category: "Hair Care",
    owner: "shivam",
    frequentlyUsed: false,
    lowStock: false,
    notes: "Unbranded"
  },

  // ─────────────────────────────────────────────
  // SHIVAM — Debility & Wellness
  // ─────────────────────────────────────────────
  {
    id: "m045",
    name: "Apriway Ginko Plus",
    description: "Homeopathic brain and energy tonic with Ginkgo Biloba to boost memory, focus, and mental clarity.",
    type: "homeopathic",
    form: "Tonic",
    quantity: 1,
    quantityUnit: "bottle",
    expiryDate: null,
    category: "Debility & Wellness",
    owner: "shivam",
    frequentlyUsed: false,
    lowStock: false,
    notes: "Expiry not available"
  }
];

// Low stock threshold config
const LOW_STOCK_ITEMS = ["m009","m010","m013","m019","m022","m023","m024","m032","m035"];