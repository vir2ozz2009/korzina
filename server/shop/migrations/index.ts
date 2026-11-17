import m0000 from "./0000_settings.sql?raw";
import m0001 from "./0001_sticky_machine_man.sql?raw";
import m0002 from "./0002_hard_azazel.sql?raw";
import m0003 from "./0003_mysterious_spectrum.sql?raw";
import m0004 from "./0004_perfect_edwin_jarvis.sql?raw";
import m0005 from "./0005_huge_the_stranger.sql?raw";
import m0006 from "./0006_catalog.sql?raw";
import m0007 from "./0007_shiny_silver_surfer.sql?raw";
import m0008 from "./0008_smart_metal_master.sql?raw";
import m0009 from "./0009_pale_iron_man.sql?raw";
import journal from "./meta/_journal.json";

export const migrations = {
  journal,
  migrations: { m0000, m0001, m0002, m0003, m0004, m0005, m0006, m0007, m0008, m0009 },
};
