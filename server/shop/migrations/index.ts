import m0000 from "./0000_settings.sql?raw";
import m0001 from "./0001_sticky_machine_man.sql?raw";
import journal from "./meta/_journal.json";

export const migrations = { journal, migrations: { m0000, m0001 } };
