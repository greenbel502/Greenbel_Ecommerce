import type { Product } from "@/domain/entities/product";

const commonIncludes = ["Equipo armado", "Manual de uso", "Orientación técnica GreenBel"];

export const products: Product[] = [
  {
    id: "asp-001", slug: "ak-26gx", sku: "AK-26GX", name: "Aspersora de mochila AK-26GX",
    category: "Equipos de aspersión", brand: "Kawashima", engineBrand: "Honda", operation: "Motorizado",
    price: 3895, compareAtPrice: 4190, isMockPrice: true, rating: 4.9, stock: 8, warrantyMonths: 12,
    badge: "Más vendido", featured: true,
    shortDescription: "Mochila motorizada de 25 L para aplicaciones agrícolas continuas.",
    description: "Equipo compacto con motor Honda de cuatro tiempos, pensado para aplicaciones precisas y jornadas de trabajo exigentes.",
    recommendedUse: "Fumigación de cultivos, viveros y mantenimiento de áreas verdes.", image: "/images/products/ak-26gx.png",
    specs: [{label:"Motor",value:"Honda AK-26GX"},{label:"Tipo",value:"4 tiempos"},{label:"Peso",value:"9 kg"},{label:"Descarga máxima",value:"8 L/min"},{label:"Capacidad",value:"25 L"},{label:"Presión máxima",value:"569 PSI"}],
    includes: commonIncludes, searchTerms: ["fumigadora", "aspersora", "mochila", "25 litros", "honda", "569 psi"]
  },
  {
    id: "asp-002", slug: "ak-26tb", sku: "AK-26TB", name: "Aspersora de mochila AK-26TB",
    category: "Equipos de aspersión", brand: "Kawashima", engineBrand: "Mitsubishi", operation: "Motorizado",
    price: 3290, isMockPrice: true, rating: 4.8, stock: 5, warrantyMonths: 6, badge: "Últimas unidades", featured: true,
    shortDescription: "Aspersora de 25 L con motor Mitsubishi de dos tiempos.",
    description: "Una alternativa ligera y eficiente para trabajo agrícola frecuente, con presión estable y tanque de alta capacidad.",
    recommendedUse: "Aplicación de fertilizantes, herbicidas y control fitosanitario.", image: "/images/products/ak-26tb.png",
    specs: [{label:"Motor",value:"Mitsubishi AK-26TB"},{label:"Tipo",value:"2 tiempos"},{label:"Peso",value:"9 kg"},{label:"Descarga máxima",value:"8 L/min"},{label:"Capacidad",value:"25 L"},{label:"Presión máxima",value:"569 PSI"}],
    includes: commonIncludes, searchTerms: ["fumigadora", "aspersora", "mochila", "mitsubishi", "25 litros"]
  },
  {
    id: "asp-003", slug: "ms333ech", sku: "MS333ECH", name: "Sistema de aspersión MS333ECH",
    category: "Equipos de aspersión", brand: "Maruyama", engineBrand: "Honda", operation: "Motorizado",
    price: 5840, isMockPrice: true, rating: 4.8, stock: 6, warrantyMonths: 3, badge: "Trabajo intensivo", featured: true,
    shortDescription: "Sistema estacionario de 25 L/min con bomba de triple pistón.",
    description: "Conjunto de alta capacidad con sistema Uniflow libre de grasa y accionamiento por correa.",
    recommendedUse: "Fincas, aplicaciones de alto volumen y jornadas prolongadas.", image: "/images/products/ms333ech.png",
    specs: [{label:"Motor",value:"Honda 5.5 HP"},{label:"Tipo",value:"4 tiempos"},{label:"Bomba",value:"Triple pistón"},{label:"Descarga máxima",value:"25 L/min"},{label:"Accionamiento",value:"Correa"},{label:"Presión máxima",value:"500 PSI"}],
    includes: commonIncludes, searchTerms: ["honda", "triple piston", "500 psi", "25 litros minuto"]
  },
  {
    id: "asp-004", slug: "ms417ech", sku: "MS417ECH", name: "Sistema de aspersión MS417ECH",
    category: "Equipos de aspersión", brand: "Maruyama", engineBrand: "Honda", operation: "Motorizado",
    price: 6390, isMockPrice: true, rating: 4.9, stock: 3, warrantyMonths: 3, badge: "Alta presión", featured: true,
    shortDescription: "Bomba triple pistón de 700 PSI para aplicaciones exigentes.",
    description: "Sistema de aspersión profesional con alto rango de presión y motor Honda de 5.5 HP.",
    recommendedUse: "Cultivos extensivos, mangueras largas y aplicaciones de alta presión.", image: "/images/products/ms417ech.png",
    specs: [{label:"Motor",value:"Honda 5.5 HP"},{label:"Tipo",value:"4 tiempos"},{label:"Bomba",value:"Triple pistón"},{label:"Descarga máxima",value:"25 L/min"},{label:"Accionamiento",value:"Correa"},{label:"Presión máxima",value:"700 PSI"}],
    includes: commonIncludes, searchTerms: ["honda", "700 psi", "alta presion", "triple piston"]
  },
  {
    id: "asp-005", slug: "ms073e", sku: "MS073E", name: "Sistema de aspersión MS073E",
    category: "Equipos de aspersión", brand: "Maruyama", engineBrand: "Maruyama", operation: "Motorizado",
    price: 4275, isMockPrice: true, rating: 4.7, stock: 7, warrantyMonths: 3,
    shortDescription: "Equipo compacto de 30 cc y descarga de 7.1 L/min.",
    description: "Sistema motorizado ágil, diseñado para labores donde la movilidad y la presión consistente son importantes.",
    recommendedUse: "Parcelas medianas, viveros y mantenimiento agrícola.", image: "/images/products/ms073e.png",
    specs: [{label:"Motor",value:"Maruyama"},{label:"Tipo",value:"2 tiempos"},{label:"Cilindrada",value:"30 cc"},{label:"Descarga máxima",value:"7.1 L/min"},{label:"Accionamiento",value:"Correa"},{label:"Presión máxima",value:"360 PSI"}],
    includes: commonIncludes, searchTerms: ["maruyama", "30 cc", "360 psi"]
  },
  {
    id: "asp-006", slug: "akm20l-la", sku: "AKM20L-LA", name: "Aspersora manual AKM20L-LA",
    category: "Equipos de aspersión", brand: "Kawashima", operation: "Manual",
    price: 575, isMockPrice: true, rating: 4.6, stock: 18, warrantyMonths: 2, badge: "Práctica",
    shortDescription: "Mochila manual de 20 L con boquilla ajustable.",
    description: "Aspersora manual liviana con modos de abanico, cono lleno y cono vacío.",
    recommendedUse: "Huertos, jardines, viveros y aplicación localizada.", image: "/images/products/akm20l-la.png",
    specs: [{label:"Funcionamiento",value:"Manual"},{label:"Peso",value:"4 kg"},{label:"Capacidad",value:"20 L"},{label:"Presión máxima",value:"145 PSI"},{label:"Boquilla",value:"Ajustable"}],
    includes: commonIncludes, searchTerms: ["manual", "mochila", "20 litros", "145 psi"]
  },
  {
    id: "asp-007", slug: "kawa-15l", sku: "KAWA", name: "Aspersora manual KAWA 15 L",
    category: "Equipos de aspersión", brand: "Kawashima", operation: "Manual",
    price: 465, isMockPrice: true, rating: 4.5, stock: 20, warrantyMonths: 2,
    shortDescription: "Aspersora manual compacta de 15 L y 3.6 kg.",
    description: "Equipo sencillo y cómodo para aplicaciones controladas en áreas pequeñas y medianas.",
    recommendedUse: "Jardines, huertos familiares y mantenimiento residencial.", image: "/images/products/kawa.png",
    specs: [{label:"Funcionamiento",value:"Manual"},{label:"Peso",value:"3.6 kg"},{label:"Capacidad",value:"15 L"},{label:"Presión máxima",value:"145 PSI"},{label:"Boquilla",value:"Ajustable"}],
    includes: commonIncludes, searchTerms: ["manual", "15 litros", "mochila", "jardin"]
  },
  {
    id: "bom-001", slug: "bt5-520", sku: "BT5.520", name: "Motobomba Takashi BT5.520",
    category: "Equipos de bombeo", brand: "Takashi", engineBrand: "Takashi", operation: "Motorizado",
    price: 2490, isMockPrice: true, rating: 4.7, stock: 9, warrantyMonths: 1, featured: true,
    shortDescription: "Motobomba a gasolina de 5.5 HP y caudal de 417 L/min.",
    description: "Motobomba robusta para traslado de agua y apoyo a sistemas de riego.",
    recommendedUse: "Riego, drenaje y abastecimiento de depósitos.", image: "/images/products/bt5-520.png",
    specs: [{label:"Motor",value:"Takashi BT5520"},{label:"Tipo",value:"4 tiempos"},{label:"Combustible",value:"Gasolina"},{label:"Potencia",value:"5.5 HP"},{label:"Caudal",value:"417 L/min"},{label:"Peso",value:"27 kg"}],
    includes: commonIncludes, searchTerms: ["bomba de agua", "motobomba", "5.5 hp", "417 litros"]
  },
  {
    id: "bom-002", slug: "bt6-530", sku: "BT6.530", name: "Motobomba Takashi BT6.530",
    category: "Equipos de bombeo", brand: "Takashi", engineBrand: "Takashi", operation: "Motorizado",
    price: 3180, isMockPrice: true, rating: 4.8, stock: 5, warrantyMonths: 1, badge: "Alto caudal", featured: true,
    shortDescription: "Motobomba de 6.5 HP con caudal máximo de 1000 L/min.",
    description: "Equipo de alto caudal para mover grandes volúmenes de agua en menos tiempo.",
    recommendedUse: "Drenaje, riego intensivo y llenado de depósitos.", image: "/images/products/bt6-530.png",
    specs: [{label:"Motor",value:"Takashi BT6530"},{label:"Tipo",value:"4 tiempos"},{label:"Combustible",value:"Gasolina"},{label:"Potencia",value:"6.5 HP"},{label:"Caudal",value:"1000 L/min"},{label:"Peso",value:"29 kg"}],
    includes: commonIncludes, searchTerms: ["bomba de agua", "motobomba", "6.5 hp", "1000 litros"]
  },
  {
    id: "bom-003", slug: "bp720c", sku: "BP720C", name: "Motobomba Parazzini BP720C",
    category: "Equipos de bombeo", brand: "Parazzini", engineBrand: "Parazzini", operation: "Motorizado",
    price: 3690, isMockPrice: true, rating: 4.9, stock: 4, warrantyMonths: 12, badge: "12 meses de garantía", featured: true,
    shortDescription: "Motobomba OHV de 7 HP con respaldo de 12 meses.",
    description: "Motobomba potente y estable para aplicaciones agrícolas y de mantenimiento con demanda continua.",
    recommendedUse: "Riego, transferencia de agua y uso profesional.", image: "/images/products/bp720c.png",
    specs: [{label:"Motor",value:"Parazzini BP720C"},{label:"Tipo",value:"4 tiempos OHV"},{label:"Combustible",value:"Gasolina"},{label:"Potencia",value:"7 HP"},{label:"Caudal",value:"417 L/min"},{label:"Peso",value:"27 kg"}],
    includes: commonIncludes, searchTerms: ["bomba de agua", "parazzini", "7 hp", "ohv"]
  },
  ...[
    ["rep-001","kit-boquillas","KIT-BQ","Kit de boquillas ajustables","Implementos","Kawashima",185,"Boquillas dobles, cónicas y en Y para distintas aplicaciones."],
    ["rep-002","manguera-alta-presion","MANG-50","Manguera de alta presión 50 m","Implementos","GreenBel",625,"Manguera reforzada para sistemas de aspersión motorizados."],
    ["rep-003","lanza-telescopica","LANZA-3S","Lanza telescópica de 3 salidas","Implementos","GreenBel",295,"Lanza para ampliar cobertura y adaptar el patrón de aplicación."],
    ["rep-004","carburador-universal","CARB-UNI","Carburador universal para motor 2T","Repuestos","Universal",245,"Repuesto compatible con distintos equipos de dos tiempos."],
    ["rep-005","kit-mantenimiento","KIT-MANT","Kit de mantenimiento preventivo","Repuestos","GreenBel",325,"Bujía, filtros, empaques y piezas básicas para mantenimiento."],
  ].map(([id,slug,sku,name,category,brand,price,shortDescription], index): Product => ({
    id: String(id), slug: String(slug), sku: String(sku), name: String(name), category: category as Product["category"],
    brand: String(brand), operation: "Accesorio", price: Number(price), isMockPrice: true, rating: 4.5 + (index % 3) * 0.1,
    stock: 12 + index * 4, warrantyMonths: 1, badge: index === 0 ? "Compatible" : undefined,
    shortDescription: String(shortDescription), description: String(shortDescription),
    recommendedUse: "Mantenimiento y adaptación de equipos agrícolas.", image: "/images/brand/greenbel-brand.jpeg",
    specs: [{label:"Tipo",value: category === "Repuestos" ? "Repuesto" : "Implemento"},{label:"Compatibilidad",value:"Consultar con asesor"},{label:"Disponibilidad",value:"En inventario demo"}],
    includes: ["Producto seleccionado", "Orientación de compatibilidad"], searchTerms: ["repuesto", "implemento", String(name).toLowerCase()]
  }))
];

export const categories = ["Todos", "Equipos de aspersión", "Equipos de bombeo", "Repuestos", "Implementos"] as const;
export const brands = ["Todas", "Kawashima", "Maruyama", "Takashi", "Parazzini", "GreenBel", "Universal"] as const;
