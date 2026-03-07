import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  Delete,
  Req
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import * as admin from 'firebase-admin';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto';
import { AddItemsDto, RemoveItemDto } from './dto/add-items.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) { }

  /**
   * Feature 1: Smart Order Creation — merges into existing active order or creates new.
   * POST /orders
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrder(@Body() createOrderDto: CreateOrderDto) {
    try {
      const { orderId, merged } = await this.ordersService.createOrder(createOrderDto);
      return {
        success: true,
        message: merged ? 'Items merged into existing order' : 'New order created successfully',
        orderId,
        merged,
        data: { id: orderId, status: 'pending' }
      };
    } catch (error) {
      throw new BadRequestException(error.message || 'Failed to create order');
    }
  }

  /**
   * Feature 3: Admin adds items to an existing table order.
   * POST /orders/add-items
   */
  @Post('add-items')
  @HttpCode(HttpStatus.OK)
  async addItemsToOrder(@Body() dto: AddItemsDto) {
    try {
      const result = await this.ordersService.addItemsToOrder(dto);
      return {
        success: true,
        message: 'Items added to order successfully',
        orderId: result.orderId
      };
    } catch (error) {
      throw new BadRequestException(error.message || 'Failed to add items');
    }
  }

  /**
   * Feature 8: Admin removes an item from an order.
   * PATCH /orders/remove-item
   */
  @Patch('remove-item')
  @HttpCode(HttpStatus.OK)
  async removeItemFromOrder(@Body() dto: RemoveItemDto) {
    try {
      await this.ordersService.removeItemFromOrder(dto);
      return { success: true, message: 'Item removed and totals recalculated' };
    } catch (error) {
      throw new BadRequestException(error.message || 'Failed to remove item');
    }
  }

  /**
   * Feature 2: Get the active order for a specific table.
   * GET /orders/table/:tableId/active
   */
  @Get('table/:tableId/active')
  async getActiveOrderForTable(@Param('tableId') tableId: string) {
    try {
      const order = await this.ordersService.findActiveOrderForTable(tableId);
      return { success: true, data: order };
    } catch (error) {
      throw new BadRequestException(error.message || 'Failed to find active order');
    }
  }

  /**
   * Get all orders
   * GET /orders
   */
  @Get()
  async getAllOrders() {
    try {
      const orders = await this.ordersService.getAllOrders();
      return { success: true, count: orders.length, data: orders };
    } catch (error) {
      throw new BadRequestException(error.message || 'Failed to fetch orders');
    }
  }

  /**
   * Get order by ID
   * GET /orders/:id
   */
  @Get(':id')
  async getOrderById(@Param('id') orderId: string) {
    try {
      const order = await this.ordersService.getOrderById(orderId);
      if (!order) throw new BadRequestException('Order not found');
      return { success: true, data: order };
    } catch (error) {
      throw new BadRequestException(error.message || 'Failed to fetch order');
    }
  }

  /**
   * Update order status
   * PATCH /orders/:id/status
   */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateOrderStatus(@Param('id') orderId: string, @Body() updateStatusDto: UpdateOrderStatusDto) {
    try {
      const validStatuses = ['pending', 'preparing', 'served', 'completed'];
      if (!validStatuses.includes(updateStatusDto.status)) {
        throw new BadRequestException('Invalid status value');
      }
      await this.ordersService.updateOrderStatus(orderId, updateStatusDto.status);
      return {
        success: true,
        message: 'Order status updated successfully',
        data: { orderId, newStatus: updateStatusDto.status, updatedAt: new Date() }
      };
    } catch (error) {
      throw new BadRequestException(error.message || 'Failed to update order status');
    }
  }

  /**
   * Get orders by table ID
   * GET /orders/table/:tableId
   */
  @Get('table/:tableId')
  async getOrdersByTable(@Param('tableId') tableId: string) {
    try {
      const orders = await this.ordersService.getOrdersByTable(tableId);
      return { success: true, count: orders.length, tableId, data: orders };
    } catch (error) {
      throw new BadRequestException(error.message || 'Failed to fetch table orders');
    }
  }

  /**
   * Delete an order (Admin only)
   * DELETE /orders/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteOrder(@Param('id') orderId: string, @Req() req: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }
    try {
      const token = authHeader.split(' ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const adminDoc = await admin.firestore().collection('admins').doc(decodedToken.uid).get();
      if (!adminDoc.exists || adminDoc.data()?.isAdmin !== true) {
        throw new ForbiddenException('Admin role required to delete orders');
      }
      await this.ordersService.deleteOrder(orderId);
      return { success: true, message: 'Order deleted successfully' };
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) throw error;
      throw new BadRequestException(error.message || 'Failed to delete order');
    }
  }
}
