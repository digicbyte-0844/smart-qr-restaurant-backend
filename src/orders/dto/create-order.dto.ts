import {
  IsString,
  IsNumber,
  IsArray,
  IsNotEmpty,
  ValidateNested,
  Min,
  IsIn,
  IsOptional
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Lean order item DTO — matches what the frontend sends.
 * Supports both legacy (menuItem blob) and new (flat) format.
 * All fields optional to avoid forbidNonWhitelisted rejections.
 */
class OrderItemDto {
  @IsOptional()
  @IsString()
  menuItemId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  selectedSize?: string;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  addedBy?: string;

  // Legacy support — full menuItem blob
  @IsOptional()
  menuItem?: any;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  tableId: string;

  @IsArray()
  @IsNotEmpty()
  items: OrderItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsNumber()
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  tax?: number;

  @IsOptional()
  @IsNumber()
  taxRate?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateOrderStatusDto {
  @IsString()
  @IsIn(['pending', 'preparing', 'served', 'completed'])
  @IsNotEmpty()
  status: 'pending' | 'preparing' | 'served' | 'completed';
}
