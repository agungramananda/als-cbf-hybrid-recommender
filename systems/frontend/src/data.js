// Mock database matching the prototype screenshots exactly

export const products = [
  {
    id: "aura-studio-anc",
    name: "Aura Studio ANC Headphones",
    brand: "AUDIOTECH",
    category: "Audio",
    price: 299.00,
    rating: 4.9,
    reviewCount: 128,
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "Experience premium active noise cancelling audio with the Aura Studio. Perfect for music lovers and professionals seeking silence and crystal-clear sound quality. Features a minimalist design with comfortable memory foam earcups.",
    isBestseller: true,
    details: {
      "Color": "Matte Black",
      "Size": "Adjustable Headband",
      "Material": "Aluminum & Memory Foam",
      "Style": "Over-Ear"
    }
  },
  {
    id: "lumina-ambient-hub",
    name: "Lumina Ambient Hub",
    brand: "SMART HOME",
    category: "Smart Home",
    price: 149.00,
    rating: 4.7,
    reviewCount: 84,
    image: "https://images.unsplash.com/photo-1507646227500-4d389b0012be?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "Control your entire home ambiance with a simple tap. The Lumina Ambient Hub integrates light, temperature, and audio triggers into one beautiful cylindrical smart device that blends into any room decoration.",
    details: {
      "Color": "Frost White",
      "Size": "Medium",
      "Material": "Polycarbonate",
      "Style": "Minimalist Cylinder"
    }
  },
  {
    id: "kanso-ceramic-vase",
    name: "Kanso Ceramic Vase",
    brand: "DECOR",
    category: "Decor",
    price: 85.00,
    rating: 5.0,
    reviewCount: 21,
    image: "https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "Handcrafted ceramic vase styled after traditional Japanese Zen philosophies. The neutral cream tones and textured finish bring organic warmth and peace to any modern living space.",
    isNew: true,
    details: {
      "Color": "Cream White",
      "Size": "Height 25cm",
      "Material": "Terracotta Ceramic",
      "Style": "Wabi-Sabi"
    }
  },
  {
    id: "oak-silhouette-chair",
    name: "Oak Silhouette Chair",
    brand: "FURNITURE",
    category: "Furniture",
    price: 450.00,
    rating: 4.8,
    reviewCount: 56,
    image: "https://images.unsplash.com/photo-1592078615290-033ee584e267?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "Designed for comfort and visual lightness. Crafted from solid red oak, the curved seat and backrest dynamically support your posture while the slim profile preserves space in your dining room or workspace.",
    details: {
      "Color": "Natural Oak",
      "Size": "Standard",
      "Material": "Solid Red Oak",
      "Style": "Mid-Century Modern"
    }
  },
  {
    id: "aura-pro-anc",
    name: "Aura Pro Noise Cancelling Headphones",
    brand: "AURAAUDIO",
    category: "Audio",
    price: 299.00,
    rating: 4.9,
    reviewCount: 428,
    image: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "The Aura Pro is the ultimate choice for true high-fidelity listening. Advanced adaptive ANC adjusts in real-time to your surroundings, delivering breathtaking resolution and deep, precise bass responses.",
    isBestseller: true,
    details: {
      "Color": "Midnight Gray",
      "Size": "Over-Ear",
      "Material": "Carbon Fiber & Leather",
      "Style": "Hi-Fi Wireless"
    }
  },
  {
    id: "sonic-buds-true",
    name: "Sonic Buds True Wireless",
    brand: "SONICTECH",
    category: "Wearables",
    price: 149.00,
    rating: 4.7,
    reviewCount: 156,
    image: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "Small size, massive sound. The Sonic Buds feature dual dynamic drivers for balanced audio, ergonomic ear gels that fit securely for athletic use, and an ultra-compact charging case with USB-C fast charge.",
    isNew: true,
    details: {
      "Color": "Matte White",
      "Size": "In-Ear",
      "Material": "Sweatproof Plastic",
      "Style": "True Wireless"
    }
  },
  {
    id: "studio-master-ref",
    name: "Studio Master Reference",
    brand: "BASSLINE",
    category: "Audio",
    price: 450.00,
    rating: 5.0,
    reviewCount: 89,
    image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "The standard for audio engineers and studio monitoring worldwide. Flat frequency response ensures you hear the mix exactly as it was recorded. Features open-back design for an expansive spatial soundstage.",
    details: {
      "Color": "Studio Black",
      "Size": "Open-Back Over-Ear",
      "Material": "Steel & Velour",
      "Style": "Wired Studio Monitor"
    }
  },
  {
    id: "aura-lite-wireless",
    name: "Aura Lite Wireless",
    brand: "AURAAUDIO",
    category: "Audio",
    price: 129.00,
    rating: 4.0,
    reviewCount: 210,
    image: "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "Enjoy wireless freedom on a budget. The Aura Lite packs high-efficiency 40mm drivers and 30 hours of battery life into a lightweight, fold-flat design that is perfect for commutes and daily wear.",
    details: {
      "Color": "Soft Ash White",
      "Size": "On-Ear",
      "Material": "Composite & Foam",
      "Style": "Wireless On-Ear"
    }
  },
  {
    id: "lurrose-toenails",
    name: "Lurrose 100Pcs Full Cover Fake Toenails Artificial Transparent Nail Tips Nail Art for DIY",
    brand: "LURROSE",
    category: "Beauty",
    price: 6.99,
    rating: 3.7,
    reviewCount: 35,
    image: "https://images.unsplash.com/photo-1604654894610-df4906fe150f?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "Made of high quality material, which is sturdy and durable enough to last a period of time. These strong fake nails are designed with full cover shape with moderate length and thickness. You can wear them long or clip them short. Easy to shape, file, paint, and apply with glue and nail polish decorations, making your nails slim, magic and cosplay.",
    details: {
      "Color": "As Shown",
      "Size": "Large",
      "Material": "ABS",
      "Style": "French"
    }
  },
  {
    id: "cinemax-soundbar",
    name: "CinemaX Surround Soundbar",
    brand: "AudioTech",
    category: "Audio",
    price: 399.00,
    rating: 4.6,
    reviewCount: 142,
    image: "https://images.unsplash.com/photo-1545454675-3531b543be5d?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "Upgrade your TV room to a full theater experience. The CinemaX features 5 built-in speakers and a wireless subwoofer option, providing virtual Dolby Atmos surround sound with clean, clear dialog.",
    details: {
      "Color": "Charcoal Black",
      "Size": "Length 90cm",
      "Material": "Wood & Fabric Mesh",
      "Style": "Virtual Surround"
    }
  },
  {
    id: "gobeat-speaker",
    name: "GoBeat Portable Speaker",
    brand: "AudioTech",
    category: "Audio",
    price: 129.00,
    rating: 4.8,
    reviewCount: 97,
    image: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "Waterproof, dustproof, and drop-proof. The GoBeat is the ultimate outdoor companion, pumping out immersive 360-degree sound for up to 15 hours on a single charge.",
    details: {
      "Color": "Stealth Black",
      "Size": "Cylindrical Small",
      "Material": "Rubberized Mesh",
      "Style": "Outdoor Rugged"
    }
  },
  {
    id: "studiopro-headphones",
    name: "StudioPro Monitor Headphones",
    brand: "AudioTech",
    category: "Audio",
    price: 199.00,
    rating: 4.7,
    reviewCount: 114,
    image: "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "High performance mixing headphones with neutral tuning and detailed frequency response. Ideal for reference listening, podcasts, and long editing sessions.",
    details: {
      "Color": "Professional Silver & Black",
      "Size": "Closed-Back Over-Ear",
      "Material": "Steel & Protein Leather",
      "Style": "Wired Monitor"
    }
  },
  {
    id: "chronos-watch",
    name: "Chronos Smartwatch Elite",
    brand: "CHRONOS",
    category: "Wearables",
    price: 249.00,
    rating: 4.0,
    reviewCount: 19,
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "The Chronos Smartwatch Elite blends high-end classic watch aesthetics with advanced fitness tracking. Offers heart rate analysis, sleep scoring, and notifications, though some users report a slightly shorter battery life of 1-2 days.",
    details: {
      "Color": "Stealth Black / Leather Strap",
      "Size": "42mm Case",
      "Material": "Stainless Steel & Sapphire Glass",
      "Style": "Hybrid Smartwatch"
    }
  },
  {
    id: "aeropulse-sneakers",
    name: "AeroPulse Pro Sneakers",
    brand: "AEROFIT",
    category: "Footwear",
    price: 150.00,
    rating: 5.0,
    reviewCount: 45,
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "Run on clouds. Features the revolutionary AeroPulse foam cushioning which returns energy with every stride. Perfect for distance running, gym workouts, or casual everyday comfort.",
    details: {
      "Color": "Cobalt Blue & Crimson Red",
      "Size": "Mens US 10",
      "Material": "Recycled Knit Mesh",
      "Style": "High-Performance Trainer"
    }
  },
  {
    id: "cashmere-overcoat",
    name: "Cashmere Blend Overcoat",
    brand: "LAVISH",
    category: "Accessories",
    price: 1250.00,
    rating: 4.9,
    reviewCount: 12,
    image: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "Wrap yourself in luxury. Made from a premium cashmere-wool blend, this tailored overcoat offers timeless silhouette contours, exceptional warmth, and unmatched comfort.",
    details: {
      "Color": "Classic Camel",
      "Size": "Slim Fit (L)",
      "Material": "70% Virgin Wool, 30% Cashmere",
      "Style": "Double-breasted Tailored"
    }
  },
  {
    id: "leather-tote",
    name: "Minimalist Leather Tote",
    brand: "KRAFT",
    category: "Accessories",
    price: 485.00,
    rating: 4.8,
    reviewCount: 28,
    image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "Everyday carry reimagined. Handcrafted from full-grain vegetable-tanned leather, this tote develops a unique patina over time. Ample room for a 15-inch laptop and daily essentials.",
    details: {
      "Color": "Saddle Brown",
      "Size": "15x12x5 inches",
      "Material": "Full-Grain Vegetable Leather",
      "Style": "Everyday Tote"
    }
  },
  {
    id: "silk-blouse",
    name: "Silk Charmeuse Blouse",
    brand: "LAVISH",
    category: "Wearables",
    price: 290.00,
    rating: 4.7,
    reviewCount: 18,
    image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    description: "Flowing elegance. Made from pure 19-momme silk charmeuse, this blouse feels incredibly soft on skin while displaying a natural, elegant luster that transitions effortlessly from desk to dinner.",
    details: {
      "Color": "Ivory Pearl",
      "Size": "Medium",
      "Material": "100% Mulberry Silk",
      "Style": "Button-down Draped"
    }

  }
];

