declare module '@/lib/db' {
  const db: any;
  export default db;
}

declare module '@/lib/calculator' {
  export function calculatePrice(params: any): any;
  export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number;
  export function validateForm(data: any, settings: any): any;
}

declare module '@/lib/notifications' {
  const emailService: any;
  export default emailService;
}
