import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto';
import { AddItemsDto, RemoveItemDto } from './dto/add-items.dto';

/**
 * Lean item type stored in Firestore.
 * No undefined-prone optional MenuItem fields — guaranteed safe for Admin SDK writes.
 */
export interface OrderItem {
  menuItemId: string;
  name: string;
  selectedSize: string;
  unitPrice: number;
  quantity: number;
  addedBy: 'customer' | 'admin';
}

export interface OrderDocument {
  id: string;
  tableId: string;
  items: OrderItem[];
  subtotal: number;
  totalAmount: number;
  status: 'pending' | 'preparing' | 'served' | 'completed';
  createdAt?: any;
  updatedAt?: any;
}

@Injectable()
export class OrdersService {
  private readonly COLLECTION = 'orders';
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject('FIRESTORE') private firestore: admin.firestore.Firestore
  ) { }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Calculate subtotal from lean order items.
   */
  private calculateSubtotal(items: OrderItem[]): number {
    return items.reduce((sum, i) => sum + (i.unitPrice || 0) * (i.quantity || 1), 0);
  }

  /**
   * Normalize any raw item (old format with menuItem blob, or new lean format)
   * into a clean FirestoreOrderItem that never contains undefined.
   */
  private normalizeItem(raw: any, addedBy: 'customer' | 'admin' = 'customer'): OrderItem {
    return {
      menuItemId: raw.menuItemId ?? raw.menuItem?.id ?? raw.id ?? '',
      name: raw.name ?? raw.menuItem?.name ?? 'Item',
      selectedSize: raw.selectedSize ?? '',
      unitPrice: Number(raw.unitPrice ?? raw.menuItem?.price ?? 0),
      quantity: Number(raw.quantity ?? 1),
      addedBy: raw.addedBy ?? addedBy,
    };
  }

  /**
   * Merge incoming items into an existing items array.
   * Same menuItemId + same size → increment quantity, otherwise append.
   */
  private mergeItems(existing: OrderItem[], incoming: OrderItem[]): OrderItem[] {
    const result: OrderItem[] = existing.map(i => ({ ...i }));
    for (const newItem of incoming) {
      const match = result.find(
        e => e.menuItemId === newItem.menuItemId && e.selectedSize === newItem.selectedSize
      );
      if (match) {
        match.quantity += newItem.quantity;
      } else {
        result.push({ ...newItem });
      }
    }
    return result;
  }

  // ─── Feature 1 & 2: Active Order Detection ─────────────────────────────────

  /**
   * Find the most recent active (pending/preparing) order for a table.
   * Uses simple tableId query + in-memory filter to avoid composite index needs.
   */
  async findActiveOrderForTable(tableId: string): Promise<OrderDocument | null> {
    this.logger.log(`[OrderService] Looking for active order for table ${tableId}`);
    const snapshot = await this.firestore
      .collection(this.COLLECTION)
      .where('tableId', '==', tableId)
      .get();

    if (snapshot.empty) {
      this.logger.log(`[OrderService] No orders found for table ${tableId}`);
      return null;
    }

    // Filter in memory for active statuses and pick the most recent
    const activeOrders = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as OrderDocument))
      .filter(o => o.status === 'pending' || o.status === 'preparing')
      .sort((a, b) => {
        const tA = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
        const tB = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
        return tB - tA;
      });

    if (activeOrders.length > 0) {
      this.logger.log(`[OrderService] ✅ Active order found: ${activeOrders[0].id} (status: ${activeOrders[0].status})`);
      return activeOrders[0];
    }

    this.logger.log(`[OrderService] No active order for table ${tableId}`);
    return null;
  }

  // ─── Feature 1: Smart Order Creation (merge or create) ──────────────────────

  /**
   * POST /orders/submit — Customer submits an order.
   * If an active order exists for this table → merge items.
   * Otherwise → create a new order.
   */
  async createOrder(dto: CreateOrderDto): Promise<{ orderId: string; merged: boolean }> {
    const { tableId, items } = dto;
    this.logger.log(`[OrderService] createOrder for table ${tableId} with ${items.length} items`);

    // Normalize all incoming items to lean format, tagged as 'customer'
    const normalized: OrderItem[] = (items as any[]).map(i => this.normalizeItem(i, 'customer'));

    // Check for existing active order
    const activeOrder = await this.findActiveOrderForTable(tableId);

    if (activeOrder) {
      // ─── MERGE ────────────────────────────────────────────────────────
      this.logger.log(`[OrderService] Merging ${normalized.length} items into order ${activeOrder.id}`);
      const existingItems: OrderItem[] = (activeOrder.items || []).map(i => this.normalizeItem(i));
      const merged = this.mergeItems(existingItems, normalized);
      const subtotal = this.calculateSubtotal(merged);

      await this.firestore.collection(this.COLLECTION).doc(activeOrder.id).update({
        items: merged,
        subtotal,
        totalAmount: subtotal,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      this.logger.log(`[OrderService] ✅ Order ${activeOrder.id} merged. Total items: ${merged.length}, Amount: ₹${subtotal}`);
      return { orderId: activeOrder.id, merged: true };
    } else {
      // ─── CREATE ───────────────────────────────────────────────────────
      const subtotal = this.calculateSubtotal(normalized);
      const orderData = {
        tableId,
        items: normalized,
        subtotal,
        totalAmount: subtotal,
        status: 'pending',
        notes: dto.notes || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await this.firestore.collection(this.COLLECTION).add(orderData);
      this.logger.log(`[OrderService] ✅ New order created: ${docRef.id} for table ${tableId}. Amount: ₹${subtotal}`);
      return { orderId: docRef.id, merged: false };
    }
  }

  // ─── Feature 3 & 7: Admin Adds Items ────────────────────────────────────────

  async addItemsToOrder(dto: AddItemsDto): Promise<{ orderId: string }> {
    const activeOrder = await this.findActiveOrderForTable(dto.tableId);
    if (!activeOrder) {
      throw new NotFoundException(`No active order found for table ${dto.tableId}`);
    }

    const adminItems: OrderItem[] = (dto.items as any[]).map(i => this.normalizeItem(i, 'admin'));
    const existing: OrderItem[] = (activeOrder.items || []).map(i => this.normalizeItem(i));
    const merged = this.mergeItems(existing, adminItems);
    const subtotal = this.calculateSubtotal(merged);

    await this.firestore.collection(this.COLLECTION).doc(activeOrder.id).update({
      items: merged,
      subtotal,
      totalAmount: subtotal,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    this.logger.log(`[OrderService] ✅ Admin added ${adminItems.length} items to order ${activeOrder.id}`);
    return { orderId: activeOrder.id };
  }

  // ─── Feature 8: Admin Removes Item ──────────────────────────────────────────

  async removeItemFromOrder(dto: RemoveItemDto): Promise<void> {
    const docRef = this.firestore.collection(this.COLLECTION).doc(dto.orderId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) throw new NotFoundException('Order not found');

    const order = { id: snapshot.id, ...snapshot.data() } as OrderDocument;
    const updatedItems = order.items.filter(
      item => !(item.menuItemId === dto.itemKey && item.selectedSize === dto.selectedSize)
    );

    // Also support old format itemKey: "menuItemId__size"
    const fallbackItems = updatedItems.length === order.items.length
      ? order.items.filter(item => {
        const [menuItemId, selectedSize] = dto.itemKey.split('__');
        return !(item.menuItemId === menuItemId && item.selectedSize === selectedSize);
      })
      : updatedItems;

    const subtotal = this.calculateSubtotal(fallbackItems);
    await docRef.update({
      items: fallbackItems,
      subtotal,
      totalAmount: subtotal,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    this.logger.log(`[OrderService] ✅ Removed item from order ${dto.orderId}. Remaining: ${fallbackItems.length}`);
  }

  // ─── Standard CRUD ──────────────────────────────────────────────────────────

  async getAllOrders(): Promise<OrderDocument[]> {
    const snapshot = await this.firestore
      .collection(this.COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(150)
      .get();
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OrderDocument));
  }

  async getOrderById(orderId: string): Promise<OrderDocument | null> {
    const snapshot = await this.firestore.collection(this.COLLECTION).doc(orderId).get();
    if (!snapshot.exists) return null;
    return { id: snapshot.id, ...snapshot.data() } as OrderDocument;
  }

  async getOrdersByTable(tableId: string): Promise<OrderDocument[]> {
    const snapshot = await this.firestore
      .collection(this.COLLECTION)
      .where('tableId', '==', tableId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OrderDocument));
  }

  async getOrdersByStatus(status: string): Promise<OrderDocument[]> {
    const snapshot = await this.firestore
      .collection(this.COLLECTION)
      .where('status', '==', status)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OrderDocument));
  }

  async updateOrderStatus(orderId: string, newStatus: string): Promise<void> {
    await this.firestore.collection(this.COLLECTION).doc(orderId).update({
      status: newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    this.logger.log(`[OrderService] ✅ Order ${orderId} status → ${newStatus}`);
  }

  getNextStatus(currentStatus: string): string {
    const flow: Record<string, string> = {
      pending: 'preparing', preparing: 'served', served: 'completed', completed: 'completed'
    };
    return flow[currentStatus] || 'pending';
  }

  async deleteOrder(orderId: string): Promise<void> {
    await this.firestore.collection(this.COLLECTION).doc(orderId).delete();
    this.logger.log(`[OrderService] ✅ Order ${orderId} deleted`);
  }
}
