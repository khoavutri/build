import { db, WAREHOUSE_ID } from '../db/database';
import { newId } from '../utils/ids';
import { nowIso } from '../utils/format';
import { buildSearchName } from '../utils/text';
import type { Actor, Material, MaterialIssue, PurchaseOrder, PurchaseStatus, StockMovement } from '../types';
import { assertAction, logActivity, nextCode } from './core';
import { NotFoundError, assertRule } from './errors';

export interface MaterialInput {
  name: string;
  unit: string;
  avgCostVnd: number;
  minQuantity?: number;
}

function stockId(warehouseId: string, materialId: string): string {
  return `${warehouseId}::${materialId}`;
}

export async function getStockQuantity(materialId: string, warehouseId = WAREHOUSE_ID): Promise<number> {
  const row = await db.stocks.get(stockId(warehouseId, materialId));
  return row?.quantity ?? 0;
}

export interface StockRow {
  material: Material;
  quantity: number;
  valueVnd: number;
  low: boolean;
}

export async function listStockRows(): Promise<StockRow[]> {
  const [materials, stocks] = await Promise.all([
    db.materials.toArray(),
    db.stocks.where('warehouseId').equals(WAREHOUSE_ID).toArray(),
  ]);
  const byMaterial = new Map(stocks.map((s) => [s.materialId, s.quantity]));
  return materials
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((material) => {
      const quantity = byMaterial.get(material.id) ?? 0;
      return {
        material,
        quantity,
        valueVnd: Math.round(quantity * material.avgCostVnd),
        low: quantity <= 0 || (material.minQuantity != null && quantity < material.minQuantity),
      };
    });
}

export async function saveMaterial(
  actor: Actor,
  input: MaterialInput,
  options: { id?: string; openingQuantity?: number } = {},
): Promise<Material> {
  assertAction(actor, 'material.adjust');
  assertRule(input.name.trim().length >= 2, 'Tên vật tư cần có ít nhất 2 ký tự.');
  assertRule(input.unit.trim().length >= 1, 'Vui lòng nhập đơn vị tính của vật tư.');
  assertRule(input.avgCostVnd >= 0, 'Đơn giá bình quân không được âm.');
  return db.transaction('rw', [db.materials, db.stocks, db.documentSequences, db.activityLogs], async () => {
    const now = nowIso();
    if (options.id) {
      const current = await db.materials.get(options.id);
      if (!current) throw new NotFoundError('Không tìm thấy vật tư cần cập nhật.');
      const updated: Material = {
        ...current,
        name: input.name.trim(),
        searchName: buildSearchName(input.name),
        unit: input.unit.trim(),
        avgCostVnd: Math.round(input.avgCostVnd),
        minQuantity: input.minQuantity,
        updatedAt: now,
        revision: current.revision + 1,
      };
      await db.materials.put(updated);
      await logActivity({
        entityType: 'MATERIAL',
        entityId: updated.id,
        action: 'MATERIAL_UPDATED',
        actor,
        summary: `Cập nhật vật tư ${updated.code} — ${updated.name}`,
      });
      return updated;
    }
    const code = await nextCode('MATERIAL', '');
    const material: Material = {
      id: newId(),
      code,
      name: input.name.trim(),
      searchName: buildSearchName(input.name),
      unit: input.unit.trim(),
      avgCostVnd: Math.round(input.avgCostVnd),
      minQuantity: input.minQuantity,
      active: true,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await db.materials.add(material);
    if (options.openingQuantity && options.openingQuantity !== 0) {
      await db.stocks.put({ id: stockId(WAREHOUSE_ID, material.id), warehouseId: WAREHOUSE_ID, materialId: material.id, quantity: options.openingQuantity });
      await db.stockMovements.add({
        id: newId(),
        materialId: material.id,
        type: 'ADJUST',
        quantity: options.openingQuantity,
        unitCostVnd: material.avgCostVnd,
        warehouseId: WAREHOUSE_ID,
        refType: 'OPENING',
        refId: material.id,
        at: now,
        note: 'Tồn đầu kỳ khi khai báo vật tư',
      });
    }
    await logActivity({
      entityType: 'MATERIAL',
      entityId: material.id,
      action: 'MATERIAL_CREATED',
      actor,
      summary: `Thêm vật tư ${material.code} — ${material.name}`,
    });
    return material;
  });
}

export interface PurchaseOrderInput {
  supplierId: string;
  projectId?: string;
  note?: string;
  items: Array<{ materialId: string; quantity: number; unitCostVnd: number }>;
}

export async function createPurchaseOrder(
  actor: Actor,
  input: PurchaseOrderInput,
  options: { operationId?: string } = {},
): Promise<PurchaseOrder> {
  assertAction(actor, 'material.purchase');
  assertRule(!!input.supplierId, 'Vui lòng chọn nhà cung cấp.');
  assertRule(input.items.length > 0, 'Phiếu mua cần ít nhất một dòng vật tư.');
  for (const item of input.items) {
    assertRule(item.quantity > 0, 'Số lượng mua phải lớn hơn 0.');
    assertRule(item.unitCostVnd >= 0, 'Đơn giá mua không được âm.');
  }
  return db.transaction(
    'rw',
    [db.purchaseOrders, db.purchaseOrderItems, db.documentSequences, db.activityLogs, db.operationReceipts],
    async () => {
      const code = await nextCode('PURCHASE');
      const now = nowIso();
      const totalVnd = input.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitCostVnd), 0);
      const po: PurchaseOrder = {
        id: newId(),
        code,
        supplierId: input.supplierId,
        projectId: input.projectId,
        status: 'ORDERED',
        totalVnd,
        itemCount: input.items.length,
        createdAt: now,
        note: input.note?.trim() || undefined,
        createdBy: actor.employeeId,
        revision: 1,
      };
      await db.purchaseOrders.add(po);
      await db.purchaseOrderItems.bulkAdd(
        input.items.map((item) => ({
          id: newId(),
          poId: po.id,
          materialId: item.materialId,
          quantity: item.quantity,
          unitCostVnd: Math.round(item.unitCostVnd),
        })),
      );
      await logActivity({
        entityType: 'PURCHASE_ORDER',
        entityId: po.id,
        action: 'PURCHASE_CREATED',
        actor,
        summary: `Tạo phiếu mua ${code} — ${input.items.length} dòng, ${totalVnd.toLocaleString('vi-VN')} ₫`,
        operationId: options.operationId,
      });
      return po;
    },
  );
}

/** Nhận hàng: cộng tồn kho, cập nhật giá bình quân, ghi movement, tăng công nợ NCC */
export async function receivePurchaseOrder(actor: Actor, poId: string): Promise<PurchaseOrder> {
  assertAction(actor, 'material.purchase');
  return db.transaction('rw', [db.purchaseOrders, db.purchaseOrderItems, db.materials, db.stocks, db.stockMovements, db.activityLogs], async () => {
    const po = await db.purchaseOrders.get(poId);
    if (!po) throw new NotFoundError('Không tìm thấy phiếu mua.');
    assertRule(po.status !== 'RECEIVED', 'Phiếu mua này đã được nhận hàng trước đó.', 'INVALID_STATE');
    assertRule(po.status !== 'CANCELLED', 'Phiếu mua đã huỷ, không thể nhận hàng.', 'INVALID_STATE');
    const items = await db.purchaseOrderItems.where('poId').equals(poId).toArray();
    const now = nowIso();
    for (const item of items) {
      const material = await db.materials.get(item.materialId);
      if (!material) continue;
      const stock = await db.stocks.get(stockId(WAREHOUSE_ID, material.id));
      const currentQty = stock?.quantity ?? 0;
      const newQty = currentQty + item.quantity;
      const newAvg = newQty > 0 ? Math.round((currentQty * material.avgCostVnd + item.quantity * item.unitCostVnd) / newQty) : material.avgCostVnd;
      await db.stocks.put({ id: stockId(WAREHOUSE_ID, material.id), warehouseId: WAREHOUSE_ID, materialId: material.id, quantity: newQty });
      await db.materials.put({ ...material, avgCostVnd: newAvg, updatedAt: now, revision: material.revision + 1 });
      const movement: StockMovement = {
        id: newId(),
        materialId: material.id,
        type: 'RECEIPT',
        quantity: item.quantity,
        unitCostVnd: item.unitCostVnd,
        warehouseId: WAREHOUSE_ID,
        refType: 'PURCHASE',
        refId: po.id,
        at: now,
        note: `Nhập theo phiếu ${po.code}`,
      };
      await db.stockMovements.add(movement);
    }
    const updated: PurchaseOrder = { ...po, status: 'RECEIVED', receivedAt: now, revision: po.revision + 1 };
    await db.purchaseOrders.put(updated);
    await logActivity({
      entityType: 'PURCHASE_ORDER',
      entityId: po.id,
      action: 'PURCHASE_RECEIVED',
      actor,
      summary: `Nhận hàng phiếu ${po.code} (${items.length} dòng) và cộng tồn kho tổng`,
    });
    return updated;
  });
}

export async function setPurchaseStatus(actor: Actor, poId: string, status: PurchaseStatus): Promise<PurchaseOrder> {
  assertAction(actor, 'material.purchase');
  return db.transaction('rw', [db.purchaseOrders, db.activityLogs], async () => {
    const po = await db.purchaseOrders.get(poId);
    if (!po) throw new NotFoundError('Không tìm thấy phiếu mua.');
    assertRule(po.status !== 'RECEIVED', 'Phiếu đã nhận hàng không đổi được trạng thái khác.', 'INVALID_STATE');
    const updated: PurchaseOrder = { ...po, status, revision: po.revision + 1 };
    await db.purchaseOrders.put(updated);
    await logActivity({
      entityType: 'PURCHASE_ORDER',
      entityId: poId,
      action: 'PURCHASE_STATUS',
      actor,
      summary: `Chuyển phiếu mua ${po.code} sang trạng thái ${status}`,
    });
    return updated;
  });
}

export interface IssueInput {
  projectId: string;
  note?: string;
  items: Array<{ materialId: string; quantity: number }>;
}

/** Xuất vật tư cho dự án: chặn vượt tồn, trừ kho tổng, ghi phiếu xuất + movement */
export async function issueMaterialsToProject(
  actor: Actor,
  input: IssueInput,
  options: { operationId?: string } = {},
): Promise<MaterialIssue> {
  assertAction(actor, 'material.issue');
  assertRule(!!input.projectId, 'Vui lòng chọn dự án nhận vật tư.');
  assertRule(input.items.length > 0, 'Phiếu xuất cần ít nhất một dòng vật tư.');
  for (const item of input.items) {
    assertRule(item.quantity > 0, 'Số lượng xuất phải lớn hơn 0.');
  }
  return db.transaction(
    'rw',
    [db.materialIssues, db.materialIssueItems, db.materials, db.stocks, db.stockMovements, db.projects, db.documentSequences, db.activityLogs, db.operationReceipts],
    async () => {
      const project = await db.projects.get(input.projectId);
      if (!project) throw new NotFoundError('Không tìm thấy dự án nhận vật tư.');
      const now = nowIso();
      const code = await nextCode('ISSUE');
      let totalVnd = 0;
      const issueItems: Array<{ id: string; issueId: string; materialId: string; quantity: number; unitCostVnd: number }> = [];
      const issueId = newId();
      for (const item of input.items) {
        const material = await db.materials.get(item.materialId);
        if (!material) throw new NotFoundError('Có vật tư không còn tồn tại trong danh mục. Hãy tải lại dữ liệu.');
        const stock = await db.stocks.get(stockId(WAREHOUSE_ID, material.id));
        const currentQty = stock?.quantity ?? 0;
        assertRule(
          item.quantity <= currentQty,
          `Vật tư "${material.name}" chỉ còn ${currentQty} ${material.unit} trong kho tổng, không đủ xuất ${item.quantity} ${material.unit}.`,
          'INSUFFICIENT_STOCK',
        );
        await db.stocks.put({ id: stockId(WAREHOUSE_ID, material.id), warehouseId: WAREHOUSE_ID, materialId: material.id, quantity: currentQty - item.quantity });
        const unitCost = material.avgCostVnd;
        totalVnd += Math.round(item.quantity * unitCost);
        issueItems.push({ id: newId(), issueId, materialId: material.id, quantity: item.quantity, unitCostVnd: unitCost });
        await db.stockMovements.add({
          id: newId(),
          materialId: material.id,
          type: 'ISSUE',
          quantity: -item.quantity,
          unitCostVnd: unitCost,
          warehouseId: WAREHOUSE_ID,
          projectId: project.id,
          refType: 'ISSUE',
          refId: issueId,
          at: now,
          note: `Xuất cho dự án ${project.code} theo phiếu ${code}`,
        });
      }
      const issue: MaterialIssue = {
        id: issueId,
        code,
        projectId: project.id,
        totalVnd,
        itemCount: issueItems.length,
        createdAt: now,
        note: input.note?.trim() || undefined,
        createdBy: actor.employeeId,
        createdByName: actor.name,
        revision: 1,
      };
      await db.materialIssues.add(issue);
      await db.materialIssueItems.bulkAdd(issueItems);
      await logActivity({
        entityType: 'PROJECT',
        entityId: project.id,
        projectId: project.id,
        action: 'MATERIAL_ISSUED',
        actor,
        summary: `Xuất vật tư ${code} cho dự án ${project.code} — ${issueItems.length} dòng, ${totalVnd.toLocaleString('vi-VN')} ₫`,
        operationId: options.operationId,
      });
      return issue;
    },
  );
}

/** Kiểm kê nhanh: đưa tồn thực tế về đúng số đếm và ghi lý do */
export async function adjustStock(
  actor: Actor,
  materialId: string,
  actualQuantity: number,
  reason: string,
): Promise<void> {
  assertAction(actor, 'material.adjust');
  assertRule(actualQuantity >= 0, 'Tồn thực tế không được âm.');
  assertRule(reason.trim().length >= 3, 'Vui lòng nhập lý do điều chỉnh tồn kho.');
  await db.transaction('rw', [db.materials, db.stocks, db.stockMovements, db.activityLogs], async () => {
    const material = await db.materials.get(materialId);
    if (!material) throw new NotFoundError('Không tìm thấy vật tư cần kiểm kê.');
    const stock = await db.stocks.get(stockId(WAREHOUSE_ID, materialId));
    const currentQty = stock?.quantity ?? 0;
    const delta = actualQuantity - currentQty;
    if (delta === 0) return;
    await db.stocks.put({ id: stockId(WAREHOUSE_ID, materialId), warehouseId: WAREHOUSE_ID, materialId, quantity: actualQuantity });
    await db.stockMovements.add({
      id: newId(),
      materialId,
      type: 'ADJUST',
      quantity: delta,
      unitCostVnd: material.avgCostVnd,
      warehouseId: WAREHOUSE_ID,
      refType: 'ADJUST',
      refId: materialId,
      at: nowIso(),
      note: `Kiểm kê: ${currentQty} → ${actualQuantity}. Lý do: ${reason.trim()}`,
    });
    await logActivity({
      entityType: 'MATERIAL',
      entityId: materialId,
      action: 'STOCK_ADJUSTED',
      actor,
      summary: `Kiểm kê ${material.code}: ${currentQty} → ${actualQuantity} ${material.unit} (${reason.trim()})`,
    });
  });
}
