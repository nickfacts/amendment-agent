import { Cursor } from "@cursor/sdk";

const models = await Cursor.models.list();
for (const m of models) console.log(m.id, "—", m.displayName);
