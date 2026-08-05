import type { Section } from "./content-types";

export const HOTBAR_DYNAMIC_SLOTS = 7;

export function resolveHotbarSections(sections: Section[]) {
  const slots: Array<Section | null> = Array(HOTBAR_DYNAMIC_SLOTS).fill(null);
  const pending: Section[] = [];

  for (const section of sections) {
    if (!section.enabled) continue;
    const slot = section.hotbarSlot;
    if (Number.isInteger(slot) && slot && slot >= 1 && slot <= HOTBAR_DYNAMIC_SLOTS && !slots[slot - 1]) {
      slots[slot - 1] = section;
    } else {
      pending.push(section);
    }
  }

  for (const section of pending) {
    const empty = slots.indexOf(null);
    if (empty === -1) break;
    slots[empty] = section;
  }

  return slots;
}

export function assignSectionToHotbarSlot(sections: Section[], sectionId: string, targetSlot: number) {
  const currentSlots = resolveHotbarSections(sections);
  const targetIndex = targetSlot - 1;
  const sourceIndex = currentSlots.findIndex((section) => section?.id === sectionId);
  const source = sections.find((section) => section.id === sectionId);
  if (!source || targetIndex < 0 || targetIndex >= HOTBAR_DYNAMIC_SLOTS) return sections;
  if (currentSlots[targetIndex]?.id === sectionId) return sections;

  const nextSlots = [...currentSlots];
  const displaced = nextSlots[targetIndex];
  if (sourceIndex >= 0) nextSlots[sourceIndex] = displaced;
  nextSlots[targetIndex] = source;

  const slotBySectionId = new Map<string, number>();
  nextSlots.forEach((section, index) => {
    if (section) slotBySectionId.set(section.id, index + 1);
  });

  return sections.map((section) => {
    const slot = slotBySectionId.get(section.id);
    return slot
      ? { ...section, enabled: true, hotbarSlot: slot }
      : { ...section, enabled: false, hotbarSlot: undefined };
  });
}