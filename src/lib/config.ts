export const siteConfig = {
  name: "GreenBel",
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "50255550101",
  currency: "GTQ",
  country: "Guatemala",
  deliveryProvider: process.env.NEXT_PUBLIC_DELIVERY_PROVIDER ?? "Forza",
  email: "ventas@greenbel.gt"
} as const;

export const guatemalaDepartments = ["Alta Verapaz", "Baja Verapaz", "Chimaltenango", "Chiquimula", "El Progreso", "Escuintla", "Guatemala", "Huehuetenango", "Izabal", "Jalapa", "Jutiapa", "Petén", "Quetzaltenango", "Quiché", "Retalhuleu", "Sacatepéquez", "San Marcos", "Santa Rosa", "Sololá", "Suchitepéquez", "Totonicapán", "Zacapa"];
