import { IsString, IsArray, IsNotEmpty, IsOptional } from 'class-validator';

export class AddItemsDto {
    @IsString()
    @IsNotEmpty()
    tableId: string;

    @IsArray()
    @IsNotEmpty()
    items: any[];

    @IsOptional()
    @IsString()
    addedBy?: 'customer' | 'admin';
}

export class RemoveItemDto {
    @IsString()
    @IsNotEmpty()
    orderId: string;

    @IsString()
    @IsNotEmpty()
    itemKey: string; // menuItemId or composite "menuItemId__selectedSize"

    @IsOptional()
    @IsString()
    selectedSize?: string;
}
