import { z } from "zod";
import type { Tool } from "../core/tool";

export const echoTool: Tool<{ msg: string }> = {
  name: "echo",
  description:
    "Echo back a message — used to validate the Tool contract end-to-end",
  sensitivity: "read",
  schema: z.object({ msg: z.string() }),
  enabledFor: () => true,
  run: async ({ msg }) => ({ ok: true, output: msg }),
};
