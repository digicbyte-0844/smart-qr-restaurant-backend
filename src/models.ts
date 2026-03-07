export interface MenuItem {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  description?: string;
  available: boolean;
  isSpecial?: boolean;
  sizes: {
    label: string; // e.g., 'Single', 'Half', 'Full'
    price: number;
    enabled: boolean;
  }[];
  createdAt?: any;
}

export interface Order {
  id: string;
  tableId: string;
  items: { menuItem: MenuItem; quantity: number }[];
  totalAmount: number;
  status: 'pending' | 'preparing' | 'served';
  createdAt: Date;
}

export interface Table {
  tableId: string;
  qrCodeUrl: string;
  status: 'available' | 'occupied';
}