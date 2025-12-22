import prisma from "../db.server";

/**
 * Validate that all serials are entered for a line item
 */
function validateSerials(serials, quantity) {
  const errors = [];
  
  if (serials.length !== quantity) {
    errors.push(`Expected ${quantity} serial numbers, got ${serials.length}`);
  }
  
  const nonEmpty = serials.filter(s => s && s.trim());
  if (nonEmpty.length !== quantity) {
    errors.push(`All ${quantity} serial numbers must be filled in`);
  }
  
  // Check for duplicates within this submission
  const seen = new Set();
  serials.forEach((serial, index) => {
    const trimmed = serial?.trim();
    if (trimmed) {
      if (seen.has(trimmed)) {
        errors.push(`Duplicate serial number: ${trimmed}`);
      }
      seen.add(trimmed);
    }
  });
  
  return errors;
}

/**
 * Check if serial numbers already exist in database
 */
async function checkDuplicateSerials(serials, excludeLineItemId = null) {
  const trimmedSerials = serials.filter(s => s && s.trim()).map(s => s.trim());
  
  if (trimmedSerials.length === 0) return [];
  
  const existing = await prisma.serialNumber.findMany({
    where: {
      serialNumber: { in: trimmedSerials },
      ...(excludeLineItemId ? { lineItemId: { not: excludeLineItemId } } : {})
    },
    select: {
      serialNumber: true,
      lineItem: {
        select: {
          order: {
            select: {
              orderName: true
            }
          }
        }
      }
    }
  });
  
  return existing.map(e => ({
    serial: e.serialNumber,
    existingOrder: e.lineItem.order.orderName
  }));
}

/**
 * Save or update serial numbers for a line item (idempotent)
 */
export async function saveSerialNumbers(lineItemId, serials) {
  const lineItem = await prisma.lineItem.findUnique({
    where: { id: lineItemId },
    select: { quantity: true }
  });
  
  if (!lineItem) {
    throw new Error(`Line item ${lineItemId} not found`);
  }
  
  // Validate
  const validationErrors = validateSerials(serials, lineItem.quantity);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join("; "));
  }
  
  // Check for duplicates in database
  const duplicates = await checkDuplicateSerials(serials, lineItemId);
  if (duplicates.length > 0) {
    const dupeMessages = duplicates.map(d => 
      `${d.serial} (already used in ${d.existingOrder})`
    );
    throw new Error(`Duplicate serial numbers: ${dupeMessages.join(", ")}`);
  }
  
  // Get existing serials for this line item
  const existing = await prisma.serialNumber.findMany({
    where: { lineItemId },
    orderBy: { unitIndex: "asc" }
  });
  
  // Update or create serials (idempotent)
  for (let i = 0; i < serials.length; i++) {
    const serialValue = serials[i].trim();
    const unitIndex = i + 1;
    
    const existingSerial = existing.find(s => s.unitIndex === unitIndex);
    
    if (existingSerial) {
      // Update if changed
      if (existingSerial.serialNumber !== serialValue) {
        await prisma.serialNumber.update({
          where: { id: existingSerial.id },
          data: { 
            serialNumber: serialValue,
            // updatedAt is automatic
          }
        });
      }
    } else {
      // Create new
      await prisma.serialNumber.create({
        data: {
          lineItemId,
          serialNumber: serialValue,
          unitIndex,
          enteredAt: new Date()
        }
      });
    }
  }
  
  // Remove any extras (if quantity decreased)
  const extraSerials = existing.filter(s => s.unitIndex > serials.length);
  if (extraSerials.length > 0) {
    await prisma.serialNumber.deleteMany({
      where: {
        id: { in: extraSerials.map(s => s.id) }
      }
    });
  }
  
  return { success: true };
}
