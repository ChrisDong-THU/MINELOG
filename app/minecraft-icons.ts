import type { Section } from "./content-types";

const item = (name: string) => `/minecraft/items/${name}.png`;

export const MINECRAFT_UI_ICONS = {
  home: "/minecraft/blocks/bookshelf.png",
  more: item("bundle"),
  articleClosed: item("book"),
  articleOpen: item("writable_book"),
  search: item("spyglass"),
  manageSections: item("comparator"),
  createSection: item("chest_minecart"),
  createArticle: item("feather"),
  editArticle: item("iron_pickaxe"),
  back: item("arrow"),
  paperLink: item("spectral_arrow"),
  random: item("firework_star"),
  delete: item("redstone"),
  table: item("honeycomb"),
  link: item("name_tag"),
} as const;

export const MINECRAFT_ITEM_ICONS = [
  item("amethyst_shard"),
  item("arrow"),
  item("bell"),
  item("blaze_rod"),
  item("book"),
  item("brush"),
  item("bundle"),
  item("cake"),
  item("campfire"),
  item("cauldron"),
  item("chest_minecart"),
  item("chorus_fruit"),
  item("clock_00"),
  item("compass_16"),
  item("comparator"),
  item("copper_ingot"),
  item("diamond"),
  item("dragon_breath"),
  item("echo_shard"),
  item("enchanted_book"),
  item("end_crystal"),
  item("emerald"),
  item("ender_eye"),
  item("ender_pearl"),
  item("experience_bottle"),
  item("feather"),
  item("filled_map"),
  item("firework_rocket"),
  item("firework_star"),
  item("fishing_rod"),
  item("glow_berries"),
  item("glowstone_dust"),
  item("goat_horn"),
  item("golden_apple"),
  item("heart_of_the_sea"),
  item("honeycomb"),
  item("iron_pickaxe"),
  item("lapis_lazuli"),
  item("magma_cream"),
  item("music_disc_wait"),
  item("name_tag"),
  item("nautilus_shell"),
  item("netherite_ingot"),
  item("nether_star"),
  item("phantom_membrane"),
  item("prismarine_crystals"),
  item("rabbit_foot"),
  item("recovery_compass_16"),
  item("redstone"),
  item("slime_ball"),
  item("snowball"),
  item("spectral_arrow"),
  item("spyglass"),
  item("totem_of_undying"),
  item("trident"),
  item("turtle_helmet"),
  item("writable_book"),
] as const;

export const RESERVED_UI_ICON_PATHS: readonly string[] = Object.values(MINECRAFT_UI_ICONS);
const RESERVED_UI_ICON_SET = new Set(RESERVED_UI_ICON_PATHS);

export const SECTION_ICON_OPTIONS: readonly string[] = MINECRAFT_ITEM_ICONS.filter(
  (icon) => !RESERVED_UI_ICON_SET.has(icon),
);

export function availableSectionIcons(sections: Pick<Section, "id" | "icon">[], currentSectionId?: string) {
  const usedByOtherSections = new Set(
    sections.filter((section) => section.id !== currentSectionId).map((section) => section.icon),
  );
  return SECTION_ICON_OPTIONS.filter((icon) => !usedByOtherSections.has(icon));
}

export function normalizeSectionIcons(sections: Section[]) {
  const used = new Set<string>();
  let changed = false;
  const normalized = sections.map((section) => {
    const iconIsAvailable = SECTION_ICON_OPTIONS.includes(section.icon) && !used.has(section.icon);
    const icon = iconIsAvailable ? section.icon : SECTION_ICON_OPTIONS.find((candidate) => !used.has(candidate));
    if (!icon || icon === section.icon) {
      used.add(section.icon);
      return section;
    }
    changed = true;
    used.add(icon);
    return { ...section, icon };
  });
  return changed ? normalized : sections;
}
